// Execute unmodified production modules with the page's real import map.
// Mount stops at the existing disposed-scope guard; no WebGL or models are used.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const base = new URL('../site/viewer/', import.meta.url);
const html = readFileSync(new URL('community.html', base), 'utf8');
const importMap = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]);
const entry = new URL(html.match(/data-controller="([^"]+)"/)[1], base);
const probe = process.argv.indexOf('--probe');

if (probe !== -1) {
  const {machines, mutant, exporter, lighting, legacyDefault} = JSON.parse(process.argv[probe + 1]);
  if(legacyDefault) importMap.imports.three='./vendor/three.module.js';
  let bareThreeResolutions=0;
  const loaded = new Set();
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'three') {
        bareThreeResolutions++;
        const scope = Object.keys(importMap.scopes).sort((a, b) => b.length - a.length)
          .find(key => context.parentURL?.startsWith(new URL(key, base).href));
        return {url: new URL(scope ? importMap.scopes[scope].three : importMap.imports.three, base).href, shortCircuit: true};
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      const result = next(url, context);
      loaded.add(url);
      const name = new URL(url).pathname.split('/').pop();
      // Negative controls reintroduce either eager boundary independently.
      if ((mutant === 'community' && url === entry.href) ||
          (mutant === 'exporter' && name === 'render-export.js') ||
          (mutant === 'camera' && name === 'export-camera.mjs')) {
        const dependency = mutant === 'community' ? new URL('community-renderer.mjs', base).href : 'three';
        return {...result, source: `import ${JSON.stringify(dependency)};\n` + result.source};
      }
      return result;
    },
  });
  const names = () => [...loaded].map(url => url.replace(base.href, '').split('?')[0]).sort();
  globalThis.fetch = () => { throw Error('Unexpected network/model request'); };

  if (exporter) {
    const THREE = await import(new URL('vendor-r180/three.module.js', base));
    const consumer = exporter === 'explicit' ? 'elegoo.mjs' : 'community-renderer.mjs';
    const exportURL = readFileSync(new URL(consumer, base), 'utf8').match(/from '(\.\/render-export\.js[^']*)'/)[1];
    const {setupRenderExport} = await import(new URL(exportURL, base));
    const nodes = new Map(), node = selector => {
      if (!nodes.has(selector)) nodes.set(selector, {dataset: {}, style: {}, value: '', before() {}, append() {}, close() {}, showModal() { this.open = true; }});
      return nodes.get(selector);
    };
    let success = false, downloaded = 0;
    globalThis.document = {
      body: {append() {}}, querySelector: node,
      createElement: tag => tag === 'canvas' ? {
        getContext: () => ({createImageData: (w, h) => ({data: new Uint8Array(w * h * 4)}), putImageData() {}}),
        toBlob: callback => callback(new Blob(['Controlled PNG transport'], {type: 'image/png'})),
      } : ({...node(Symbol()), querySelector: node, click() { downloaded++; URL.revokeObjectURL(this.href); }}),
    };
    globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,fixture'; this.onload(); } };
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 20);
    camera.position.set(1, 2, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const originalCamera = camera.toJSON(), background = new THREE.Color(0x334455);
    const scene = {background}, oldTarget = {original: true};
    let currentTarget = oldTarget, target, disposed = 0, prepared = 0, finished = 0;
    const renderer = {
      capabilities: {maxTextureSize: 16, maxSamples: 4},
      domElement: {getBoundingClientRect: () => ({width: 8, height: 4})},
      getRenderTarget: () => currentTarget, getClearAlpha: () => .75,
      getClearColor: color => color.set(0x123456), setClearColor() {}, clear() {},
      setRenderTarget(value) {
        currentTarget = value;
        if (value !== oldTarget) { target = value; target.addEventListener('dispose', () => disposed++); }
      },
      render() { if (!success) throw Error('Controlled GPU boundary'); },
      readRenderTargetPixels(value, x, y, w, h, pixels) { assert.equal(value, target); pixels.fill(127); },
    };
    const before = names();
    const api = setupRenderExport({renderer, scene, camera,
      ...(exporter === 'explicit' ? {three: THREE} : {}),
      prepareCamera(value) { assert(value instanceof THREE.PerspectiveCamera); prepared++; },
      afterRender() { finished++; },
    });
    const setup = names();
    node('#openRender').onclick(); // Also exercise the controls-free target path.
    assert(Number.isFinite(Number(node('#renderAzimuth').value)));
    node('#renderView').value = 'custom'; node('#renderResolution').value = '8';
    node('#renderBackground').value = 'transparent';
    const originalError = console.error, errors = [];
    console.error = error => errors.push(error.message);
    try { await api.exportImage(); } finally { console.error = originalError; }
    assert.deepEqual(errors, ['Controlled GPU boundary']);
    assert.equal(node('#renderStatus').dataset.error, 'Controlled GPU boundary');
    assert.equal(target.width, 8); assert.equal(target.height, 4);
    assert.equal(disposed, 1); assert.equal(prepared, 1); assert.equal(finished, 1);
    assert.equal(currentTarget, oldTarget); assert.equal(scene.background, background);
    assert.equal(node('#saveRender').disabled, false);
    assert.deepEqual(camera.toJSON(), originalCamera);
    success = true; await api.exportImage();
    assert.equal(downloaded, 1); assert.equal(node('#renderStatus').dataset.width, 8);
    assert.equal(node('#renderStatus').dataset.height, 4);
    assert.equal(disposed, 2); assert.equal(prepared, 2); assert.equal(finished, 2);
    assert.equal(currentTarget, oldTarget); assert.equal(scene.background, background);
    assert.deepEqual(camera.toJSON(), originalCamera);
    const after = names();
    const expected = exporter === 'explicit' ? THREE : await import(new URL(importMap.imports.three, base));
    assert(target instanceof expected.WebGLRenderTarget, 'Exporter used a different Three namespace');
    console.log(JSON.stringify({before, setup, after, exporter,bareThreeResolutions}));
  } else {
    let languageReads = 0, scopeReads = 0;
    globalThis.document = {documentElement: {dataset: {}, get lang() { languageReads++; return 'en'; }}, querySelector: () => ({})};
    globalThis.location = new URL('https://example.test/viewer/community.html');
    const controller = await import(entry);
    const initial = names(), snapshots = [];
    for (const machine of machines) {
      location.search = machine === null ? '' : '?machine=' + machine;
      const scope = {get disposed() { scopeReads++; return true; }};
      const reads = [languageReads, scopeReads];
      await controller.mount(scope);
      assert(languageReads > reads[0] && scopeReads > reads[1], 'Real delegated mount did not receive the scope');
      if(lighting){
        const text=readFileSync(new URL('elegoo.mjs',base),'utf8');
        const lifecycle=text.match(/from '(\.\/workspace-lifecycle\.mjs[^']*)'/)[1];
        const {WorkspaceScope}=await import(new URL(lifecycle,base));
        const THREE=await import(new URL('vendor-r180/three.module.js',base));
        const sceneScope=new WorkspaceScope();sceneScope.scene(new THREE.Scene());
        sceneScope.dispose();await sceneScope.settle();
      }
      snapshots.push({machine, loaded: names()});
    }
    console.log(JSON.stringify({initial, snapshots}));
  }
  hooks.deregister();
} else {
  const run = options => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--probe', JSON.stringify(options)], {encoding: 'utf8', timeout: 30000});
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout.trim());
  };
  const clean = names => {
    assert(!names.some(name => name.startsWith('vendor/')), 'Delegated ELEGOO loaded the default Three bundle');
    assert(!names.includes('community-renderer.mjs'), 'Delegated ELEGOO imported the ordinary renderer');
    assert(!names.includes('community-loader.mjs') && !names.includes('gcode-panel.js'));
    assert(!names.includes('source-assembly.mjs'), 'Delegated ELEGOO imported another controller');
  };
  const {elegooMachines} = await import(new URL('elegoo-catalog.mjs', base));
  // The common scene hook uses bare Three. Unify its exact existing revision;
  // fail if the two vendor copies ever diverge instead of mixing revisions.
  assert.equal(importMap.imports.three,'./vendor-r180/three.module.js');
  for(const name of ['three.module.js','three.core.js'])
    assert.deepEqual(readFileSync(new URL('vendor/'+name,base)),readFileSync(new URL('vendor-r180/'+name,base)));
  for (const {id} of elegooMachines) {
    const result = run({machines: [id],lighting:true});
    clean(result.initial); assert(!result.initial.some(name => name.startsWith('vendor-r180/')));
    const names = result.snapshots[0].loaded; clean(names);
    assert(names.includes('elegoo.mjs') && names.includes('elegoo-loader.mjs'));
    assert(names.includes('toolhead-lighting.mjs'),'Real asynchronous scene hook was not exercised');
    assert(names.includes('vendor-r180/three.module.js') && names.includes('vendor-r180/three.core.js'));
  }
  for (const machine of [null, 'ender3_stock_220', 'voron_switchwire_250', 'unknown']) {
    const names = run({machines: [machine]}).snapshots[0].loaded;
    assert(names.includes('community-renderer.mjs') && names.includes('community-loader.mjs') && names.includes('gcode-panel.js'));
    assert(!names.includes('elegoo.mjs'));
  }
  const id = elegooMachines[0].id;
  const switching = run({machines: [id, 'ender3_stock_220', id]});
  clean(switching.snapshots[0].loaded);
  assert(switching.snapshots[1].loaded.includes('community-renderer.mjs'));
  assert.equal(switching.snapshots[1].loaded.filter(name => name === 'render-export.js').length, 1, 'Ordinary and delegated renderers used different exporter cache queries');
  assert.deepEqual(switching.snapshots[2].loaded, switching.snapshots[1].loaded, 'A-to-B-to-A imported duplicate modules');
  const source = run({machines: ['rh3d_virtu_may_230']}).snapshots[0].loaded;
  assert(source.includes('source-assembly.mjs') && !source.includes('elegoo.mjs'));
  for (const mutant of ['community', 'exporter', 'camera']) {
    const result = run({machines: [id], mutant,legacyDefault:true});
    assert.throws(() => clean(result.snapshots[0].loaded), undefined, 'Eager ' + mutant + ' boundary escaped detection');
  }
  assert.throws(()=>clean(run({machines:[id],lighting:true,legacyDefault:true}).snapshots[0].loaded),undefined,'Old scene-hook import map escaped detection');
  for (const exporter of ['explicit', 'default']) {
    for(const legacyDefault of [false,true]){
      const result = run({exporter,legacyDefault});
      for (const phase of ['before', 'setup']) assert(!result[phase].some(name => name.startsWith('vendor/')));
      assert.equal(result.after.includes('vendor/three.module.js'), legacyDefault&&exporter === 'default');
      assert.equal(result.bareThreeResolutions,exporter==='default'?1:0);
    }
  }
  console.log('PASS: 3 ELEGOO entries with real asynchronous scene hooks, ordinary/default/unknown and source routes, A-to-B-to-A, 4 duplicate-import negative controls, identical vendor revisions, explicit/default export namespaces and cleanup under both import maps. Source execution only; no browser, model, PNG pixels or fit evidence.');
}
