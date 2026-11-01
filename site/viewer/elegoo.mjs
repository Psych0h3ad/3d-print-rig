import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadLanguage, formatMessage} from './i18n.mjs?v=fd9c367155a12b48205e';
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {workspaceFrame, workspaceListen, WorkspaceResizeObserver, WorkspaceMutationObserver} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import {setResponsiveAspect, frameResponsiveView} from './responsive-camera.mjs?v=149a79a654914b2af652';
import {rememberDisplayControl, readDisplay} from './display-preferences.mjs?v=8f347468def25922153c';
import {sceneLightingState} from './scene-lighting-state.mjs?v=0e24bd8b53a400dfb636';
import {setupRenderExport} from './render-export.js?v=92d6e71ee392361a4f7d';
import {sourceReferencePanel} from './source-assembly-references.mjs';
import {sourceCreditPresentation} from './source-credit-format.mjs';
import {createModelProgress} from './model-progress.mjs?v=beaef781095b6f56b290';
import {deviceMemoryHint} from './device-memory.mjs?v=c2fd3c5387d359dca8a7';
import {elegooAssetIndex} from './elegoo-catalog.mjs';
import {loadElegooReference, disposeElegooRoot} from './elegoo-loader.mjs?v=5448c02746feee6db82a';
import {assertElegooCurrent, createElegooLoadQueue} from './elegoo-load-task.mjs';
import {validateElegooView} from './elegoo-contract.mjs';
import {createElegooCameraSelection, elegooPresetButtonIds} from './elegoo-view-state.mjs';
import {referenceDepthRange} from './elegoo-depth-range.mjs';

export async function mount(scope) {
  await loadLanguage(document.documentElement.lang); if (scope.disposed) return;
  document.body.classList.add('elegoo-reference');
  scope.cleanup(() => document.body.classList.remove('elegoo-reference'));
  const $ = id => document.getElementById(id), language = () => document.documentElement.lang;
  const machine = new URL(location.href).searchParams.get('machine');
  const row = elegooAssetIndex.machines.find(value => value.id === machine);
  if (!row) throw Error('Unregistered ELEGOO reference');
  const stage = $('stage'), workspace = document.querySelector('.workspace'), bindings = new Map();
  const t = (id, values = {}) => formatMessage(id, values, language());
  function text(node, id, values = {}) {
    node.removeAttribute('data-i18n-id'); node.dataset.i18n = 'off';
    bindings.set(node, () => t(id, typeof values === 'function' ? values() : values));
    node.textContent = bindings.get(node)(); return node;
  }
  function element(tag, id, properties = {}) {
    const node = Object.assign(document.createElement(tag), properties);
    return id ? text(node, id) : node;
  }
  $('machineTitle').textContent = row.title;
  document.title = row.title + ' · 3D Print Rig';
  $('machineRevision').textContent = row.source.revision;
  text($('machineDescription'), 'elegoo.nominal_size', {0: row.nominal_build_size_mm.join(' × ')});
  text($('sourceModelNotice'), 'elegoo.static_notice'); $('sourceModelNotice').hidden = false;
  $('installationOptions').hidden = true; $('references').closest('label').hidden = true;
  // Remove controls that imply a motion, palette or installation capability.
  $('motionSettings').hidden = true; $('base').closest('details').hidden = true;
  const appearance = $('gridVisible').closest('details');
  appearance.append(element('p', 'elegoo.appearance_notice', {className: 'foot'}));
  $('gridVisible').disabled = false; $('night').checked = readDisplay().dark;
  $('gridVisible').checked = false; $('openDownloads').hidden = true;
  const open = element('button', 'source_assembly.full_load', {type: 'button', className: 'primary'});
  const reset = element('button', 'source_assembly.reset', {type: 'button', disabled: true});
  const cancel = element('button', 'source_assembly.cancel', {type: 'button', hidden: true});
  $('machineDescription').after(open, reset);
  const status = $('status'); status.after(cancel);
  const progress = element('progress', null, {max: 100, hidden: true});
  progress.setAttribute('aria-label', t('source_assembly.progress.download')); status.after(progress);
  const sources = sourceReferencePanel(document);
  sources.replaceChildren(element('summary', 'source_assembly.reference_title'));
  function references() {
    const box = element('div'), label = sourceCreditPresentation(row.source).label;
    function link(title, href) {
      const node = element('a', null, {textContent: title, href, target: '_blank', rel: 'noopener noreferrer'});
      node.dataset.i18n = 'off'; return node;
    }
    box.append(link(label, row.source.url), element('p', null, {textContent: row.source.revision}),
      link(row.source.license, row.license_text_url),
      link(t('elegoo.corresponding_source'), row.source_package_url),
      element('p', 'elegoo.appearance_notice'), element('p', 'elegoo.static_notice'));
    return box;
  }
  sources.append(references());
  const credits = element('dialog', null, {id: 'elegooCredits'}), close = element('button', 'source_assembly.cancel', {type: 'button'});
  credits.setAttribute('aria-labelledby', 'elegooCreditsTitle');
  credits.append(element('h2', 'source_assembly.source', {id: 'elegooCreditsTitle'}), references(), close); document.body.append(credits);
  close.onclick = () => credits.close(); $('openSources').onclick = () => credits.showModal();
  scope.cleanup(() => credits.remove());
  const warning = element('dialog', null, {id: 'elegooMemory'}), continueButton = element('button', 'source_assembly.full_load', {type: 'button'});
  const decline = element('button', 'source_assembly.cancel', {type: 'button'});
  warning.setAttribute('aria-labelledby', 'elegooMemoryTitle');
  warning.append(element('h2', 'source_assembly.memory', {id: 'elegooMemoryTitle'}), element('p', 'elegoo.memory_warning'), continueButton, decline);
  document.body.append(warning); scope.cleanup(() => warning.remove());
  let cancelWarning;
  function confirmLargeModel(signal) {
    const hint = deviceMemoryHint(navigator);
    const mobile = matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 680px)').matches;
    if (!mobile && (hint === null || hint > 4)) return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return; settled = true;
        signal.removeEventListener('abort', aborted); warning.removeEventListener('close', closed);
        warning.removeEventListener('cancel', declined); cancelWarning = null;
        if (warning.open) warning.close(); resolve(value);
      };
      const aborted = () => finish(false), closed = () => finish(false);
      const declined = event => { event.preventDefault(); finish(false); };
      cancelWarning = () => finish(false);
      continueButton.onclick = () => finish(true); decline.onclick = () => finish(false);
      warning.addEventListener('close', closed); warning.addEventListener('cancel', declined);
      signal.addEventListener('abort', aborted, {once: true});
      if (signal.aborted) finish(false); else warning.showModal();
    });
  }
  const renderer = scope.renderer(new THREE.WebGLRenderer({antialias: true}));
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; stage.append(renderer.domElement);
  const scene = scope.scene(new THREE.Scene()), clip = referenceDepthRange(1, 1);
  const camera = new THREE.PerspectiveCamera(35, 1, clip.near, clip.far);
  const controls = scope.resource(new OrbitControls(camera, renderer.domElement)); controls.enableDamping = false;
  const pmrem = scope.resource(new THREE.PMREMGenerator(renderer)), room = new RoomEnvironment();
  const environment = scope.resource(pmrem.fromScene(room, .03)); room.dispose(); scene.environment = environment.texture;
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x586b80, .35);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4), fill = new THREE.DirectionalLight(0xe2efff, .5);
  sun.position.set(2, 4, 3); fill.position.set(-2, 1, -1); scene.add(hemisphere, sun, fill);
  const grid = new THREE.GridHelper(2, 40, 0xa8b8b1, 0xc5cec9); grid.visible = false; scene.add(grid);
  const queue = createElegooLoadQueue(); let active, frame = null, exporter, tracker, loadReady = false, stateRequest = 0;
  const badge = $('badge'); badge.dataset.i18n = 'off';
  const badgeText = () => loadReady && active ? active.nodes.size.toLocaleString(language()) + ' · ' + row.title : row.title;
  bindings.set(badge, badgeText);
  function depth(targetCamera = camera) {
    const bounds = active?.bounds; if (!bounds) return;
    const range = referenceDepthRange(targetCamera.position.distanceTo(controls.target), bounds.getSize(new THREE.Vector3()).length());
    targetCamera.near = range.near; targetCamera.far = range.far; targetCamera.updateProjectionMatrix();
  }
  function render() {
    if (scope.disposed || frame !== null) return;
    frame = workspaceFrame(() => { frame = null; depth(); renderer.render(scene, camera); });
  }
  function display() {
    const state = sceneLightingState({darkUI: $('night').checked});
    scene.background = new THREE.Color(state.background); scene.environmentIntensity = state.environmentIntensity;
    renderer.toneMappingExposure = state.exposure; hemisphere.intensity = state.ambientIntensity;
    grid.visible = $('gridVisible').checked; document.body.dataset.roomDark = 'false'; render();
  }
  function view(kind = 'iso') {
    if (!active) return;
    const bounds = kind === 'head' && !active.headBounds.isEmpty() ? active.headBounds : active.bounds;
    const center = bounds.getCenter(new THREE.Vector3()), diagonal = bounds.getSize(new THREE.Vector3()).length();
    const direction = {iso: [.7,.45,1], front: [0,0,1], side: [1,0,0], rear: [0,0,-1], top: [0,1,0], under: [0,-1,0], head: [.5,.25,1]}[kind];
    const distance = diagonal / 2 / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.12;
    camera.up.set(0, ['top', 'under'].includes(kind) ? 0 : 1, kind === 'top' ? -1 : kind === 'under' ? 1 : 0);
    controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
    camera.lookAt(center); frameResponsiveView(camera, controls); controls.update(); depth(); render();
    presets.select(kind);
    document.body.dataset.view = kind;
  }
  const tools = stage.querySelector('.view-tools');
  const presets = createElegooCameraSelection(tools, controls);
  scope.cleanup(() => presets.dispose());
  for (const [id, kind] of [['iso','iso'], ['front','front'], ['top','top'], ['focusHead','head']]) $(id).onclick = () => view(kind);
  for (const [kind, key] of [['side','elegoo.side'], ['rear','elegoo.rear'], ['under','source_assembly.under']]) {
    const button = element('button', key, {id: elegooPresetButtonIds[kind], type: 'button'});
    button.setAttribute('aria-pressed', 'false'); tools.append(button); button.onclick = () => view(kind);
  }
  function ready(value) {
    loadReady = value; document.body.dataset.ready = String(value);
    badge.textContent = badgeText();
    if (!value) presets.clear();
    $('openRender').disabled = reset.disabled = $('saveConfiguration').disabled = !value;
    for (const button of tools.querySelectorAll('button')) button.disabled = !value;
  }
  function release() {
    if (active) { disposeElegooRoot(active.root); active = null; renderer.renderLists.dispose(); }
    ready(false); delete document.body.dataset.modelHash; delete document.body.dataset.parts;
  }
  function stop() {
    queue.cancel(); cancelWarning?.(); tracker?.close(); tracker = null;
    cancel.hidden = progress.hidden = true; open.disabled = false;
  }
  cancel.onclick = () => { stateRequest++; stop(); text(status, 'elegoo.canceled'); open.disabled = false; };
  async function load() {
    const job = queue.start(), current = () => job.current() && !scope.disposed && !workspace.inert;
    open.disabled = true; cancel.hidden = false; delete document.body.dataset.error;
    return queue.run(job, async () => {
      let next;
      try {
        assertElegooCurrent(job.signal, current);
        if (!await confirmLargeModel(job.signal)) {
          if (current()) text(status, 'elegoo.canceled'); return false;
        }
        assertElegooCurrent(job.signal, current); release();
        tracker = createModelProgress({'model.glb': row.files['model.glb']}, state => {
          if (!current()) return;
          progress.hidden = state.phase !== 'download';
          if (state.percent === null) progress.removeAttribute('value'); else progress.value = state.percent;
          if (state.phase === 'assembly') text(status, 'source_assembly.progress.assembly');
          else text(status, 'elegoo.download', {0: state.percent === null ? '…' : state.percent + '%'});
        });
        text(status, 'source_assembly.progress.manifest');
        next = await loadElegooReference(row, {signal: job.signal, isCurrent: current, onProgress: event => {
          if (!current()) return;
          if (event.phase === 'assembly') tracker.assembling(); else tracker.update('model.glb', event);
        }});
        assertElegooCurrent(job.signal, current);
        active = next; next = null;
        // No await between the final current-job check and scene attachment.
        scene.add(active.root);
        const center = active.bounds.getCenter(new THREE.Vector3());
        grid.position.set(center.x, active.bounds.min.y - .002, center.z);
        if (!exporter) exporter = setupRenderExport({renderer, scene, camera, controls, name: machine,
          three: THREE, beforeRender: () => depth(), prepareCamera: depth});
        ready(true); document.body.dataset.machine = machine;
        document.body.dataset.modelHash = row.files['model.glb'].decoded_sha256;
        document.body.dataset.parts = String(active.nodes.size);
        text(status, 'source_assembly.progress.ready'); display(); view(); return true;
      } catch (error) {
        if (next) disposeElegooRoot(next.root);
        if (current() && error.name !== 'AbortError') {
          release(); text(status, 'source_assembly.error'); document.body.dataset.error = error.message;
          console.error('ELEGOO reference load failed', error);
        }
        return false;
      } finally {
        if (job.current() && !scope.disposed) {
          tracker?.close(); tracker = null; cancel.hidden = progress.hidden = true; open.disabled = false;
        }
      }
    });
  }
  open.onclick = () => { stateRequest++; return scope.task(load); };
  reset.onclick = () => { if (loadReady) view(); };
  for (const input of [$('night'), $('gridVisible')]) {
    input.oninput = input.onchange = () => { display(); rememberDisplayControl(); };
  }
  const file = $('configurationFile'); $('loadConfiguration').disabled = false;
  const urls = new Set(); scope.cleanup(() => { for (const url of urls) URL.revokeObjectURL(url); });
  $('saveConfiguration').onclick = () => {
    if (!loadReady) return;
    const data = {schema: 'elegoo-static-view-v1', machine, model_sha256: row.files['model.glb'].decoded_sha256,
      source_revision: row.source.revision, dark: $('night').checked, grid: $('gridVisible').checked,
      camera: {position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray()}};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    urls.add(url); element('a', null, {href: url, download: machine + '.json'}).click();
    setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 0);
    text($('configurationStatus'), 'source_assembly.saved');
  };
  $('loadConfiguration').onclick = () => file.click();
  file.onchange = () => scope.task(async () => {
    const selected = file.files[0], ticket = ++stateRequest; file.value = ''; if (!selected) return;
    try {
      if (selected.size > 65536) throw Error('Oversized saved view');
      const data = validateElegooView(JSON.parse(await selected.text()), row);
      if (scope.disposed || ticket !== stateRequest || workspace.inert) return;
      if (!loadReady && !await load()) return;
      if (scope.disposed || ticket !== stateRequest || workspace.inert || !loadReady) return;
      camera.position.fromArray(data.camera.position); camera.up.fromArray(data.camera.up);
      controls.target.fromArray(data.camera.target); camera.lookAt(controls.target); controls.update();
      presets.clear();
      $('night').checked = data.dark; $('gridVisible').checked = data.grid; display(); rememberDisplayControl();
      text($('configurationStatus'), 'source_assembly.loaded');
    } catch { if (!scope.disposed && ticket === stateRequest) text($('configurationStatus'), 'source_assembly.unsafe'); }
  });
  const resize = () => {
    const rect = stage.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    setResponsiveAspect(camera, controls, rect.width, rect.height); render();
  };
  new WorkspaceResizeObserver(resize).observe(stage); controls.addEventListener('change', render);
  scope.cleanup(() => { stateRequest++; stop(); controls.removeEventListener('change', render); });
  // Router waits for async tasks before disposing. Cancel as soon as it makes
  // the current workspace inert, including while the warning dialog is open.
  new WorkspaceMutationObserver(() => { if (workspace.inert) { stateRequest++; stop(); } })
    .observe(workspace, {attributes: true, attributeFilter: ['inert']});
  workspaceListen(window, 'pagehide', () => stop());
  workspaceListen(window, 'rig-language-change', () => {
    for (const [node, format] of bindings) if (node.isConnected) node.textContent = format();
    progress.setAttribute('aria-label', t('source_assembly.progress.download'));
  });
  scope.cleanup(() => { if (active) { scene.remove(active.root); active = null; } });
  ready(false); display(); resize(); setupMachineNavigation(machine);
  await load();
}
