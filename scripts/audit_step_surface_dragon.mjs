// Mandatory release check for eight copied, authored SB front leaves only.
// Call with the normal assembled site while its build-only delivery contract
// is present. This does not qualify native solids, companions or installed fit.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {surfaceRule} from '../site/viewer/step-surface-selection.mjs';

const sourceSite = fileURLToPath(new URL('../site/', import.meta.url));
const assets = ['sb_dragon_hf', 'sb_dragon_sf'];
const numbers = [6, 9, 10, 11];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ordered = x => Array.isArray(x) ? x.map(ordered) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordered(x[k])])) : x;
const canonicalJSON = x => JSON.stringify(ordered(x));
const keysFor = asset => numbers.map(n => `${asset}_front_${n}`);
// The existing 18 rules, author identity, terms and generator remain unchanged.
const basePolicySHA256 = '924661c1286eda95df05664d12e8e9e38793d45c4b48581e2d3887d1d816dc06';
const reviewed = {
  'TOOLHEAD_CONFIGURATIONS.json': [8916573, 'c95523f09e893ed2b4a7603a3e3c74aa39aa0c97508f00b2d60202e26b33afbf'],
  'modules/sb_revo_voron.json': [12185, 'bae72e31c97691400f73b3e00a23ed097e44756144f5aa0710cbfd9ba5a06d07'],
  'modules/sb_revo_voron.glb.gz': [1479155, '83a89541124060982708c814493933b082c9089c1a7dbf77ec476611bd6db8c3'],
  'modules/sb_dragon_hf.json': [14203, '7da96e7afcda7eed905120a0beddfeb6601b027af18fc2809bb63e3a0d7ad06f'],
  'modules/sb_dragon_hf.glb.gz': [1554918, 'd651f10d4ccd078652ae7b2e4ca97c346a9dcfb850aa4b9b23a6107b2e366dcb'],
  'modules/sb_dragon_sf.json': [13852, 'ffbc53f67d9b4ea39c5cf6e07f412aad7bc6291be4d7fccdaeac38e213912b42'],
  'modules/sb_dragon_sf.glb.gz': [1712900, '21dd25c20f40da817f9a79feaa4e94ce8faea89cf1d7217ca52b479e2633fa1e']
};

export function assertDragonPolicy(policy) {
  assert.equal(policy?.parts?.length, 26, 'Dragon release requires exactly 26 source rules');
  const base = {...policy, parts: policy.parts.filter(p => !assets.includes(p.asset))};
  assert.equal(sha(canonicalJSON(base)), basePolicySHA256, 'Existing source identities, license or rules changed');
  assert.equal(new Set(policy.parts.map(p => `${p.asset}:${p.key}`)).size, 26, 'Duplicate source rule');
  assert.equal(new Set(policy.parts.map(p => p.sourceSelector.id)).size, 14, 'Distinct authored sources changed');
  for (const asset of assets) {
    assert.deepEqual(policy.parts.filter(p => p.asset === asset).map(p => p.key).sort(), keysFor(asset).sort(), 'Unexpected Dragon admission');
    for (const n of numbers) {
      const alias = surfaceRule(policy, asset, `${asset}_front_${n}`);
      const source = surfaceRule(policy, 'sb_revo_voron', `sb_revo_voron_${n}`);
      assert(source && alias, 'Missing authored source/alias');
      const {sourceAlias, ...body} = alias;
      assert.deepEqual(body, {...source, asset, key: `${asset}_front_${n}`}, 'Source product or complete geometry binding changed');
      assert.deepEqual(Object.keys(sourceAlias || {}).sort(), ['asset', 'basis', 'key']);
      assert.equal(sourceAlias.asset, source.asset, 'Wrong canonical asset');
      assert.equal(sourceAlias.key, source.key, 'Wrong canonical source product');
      assert.equal(typeof sourceAlias.basis, 'string');
      assert(sourceAlias.basis.trim(), 'Missing alias provenance basis');
    }
  }
}

// Independently checks all source values and all 16 placement components.
// A matching buffer alone must not excuse a moved/rotated/scaled child node.
export function assertDragonAliasRelation(row, source, delta = [0, 0, 0]) {
  assert(row && source, 'Missing actual authored leaf');
  assert(assets.includes(row.asset), 'Unreviewed alias asset');
  const n = numbers.find(n => row.key === `${row.asset}_front_${n}`);
  assert(n !== undefined && row.id === row.key, 'Unreviewed alias key');
  assert.equal(source.asset, 'sb_revo_voron', 'Wrong canonical asset');
  assert.equal(source.id, `sb_revo_voron_${n}`, 'Wrong canonical source product');
  assert.equal(source.key, source.id);
  assert.deepEqual(row.positions, source.positions, 'Complete source POSITION changed');
  assert.deepEqual(row.sourceIndex || row.index, source.sourceIndex || source.index, 'Complete source index changed');
  assert.equal(delta.length, 3); assert(delta.every(Number.isFinite));
  assert.equal(row.matrixCAD?.length, 16); assert.equal(source.matrixCAD?.length, 16);
  for (let j = 0; j < 16; j++) {
    assert(Number.isFinite(row.matrixCAD[j]) && Number.isFinite(source.matrixCAD[j]), 'Non-finite source matrix');
    const expected = source.matrixCAD[j] + (j >= 12 && j <= 14 ? delta[j - 12] : 0);
    assert(Math.abs(row.matrixCAD[j] - expected) < 1e-9, `Source matrix mismatch ${row.id} component ${j}`);
  }
}

function safeRelative(name) {
  assert(typeof name === 'string' && name && !name.includes('\\') && !name.includes('?') && !name.includes('#') &&
    !path.posix.isAbsolute(name) && !name.includes(':') && name.split('/').every(p => p && p !== '.' && p !== '..'), 'Unsafe input path');
  return name;
}

async function pinContext(root) {
  const inputs = {}, files = new Map();
  const auditFile = fileURLToPath(import.meta.url), auditBytes = await fs.readFile(auditFile);
  inputs['audit:scripts/audit_step_surface_dragon.mjs'] = {bytes: auditBytes.length, sha256: sha(auditBytes)};
  files.set('audit:scripts/audit_step_surface_dragon.mjs', auditFile);
  async function pin(name, {source = false, expected} = {}) {
    safeRelative(name);
    const file = path.join(source ? sourceSite : root, name), raw = await fs.readFile(file);
    const identity = {bytes: raw.length, sha256: sha(raw)}, key = (source ? 'source:' : '') + name;
    if (expected) assert.deepEqual(identity, expected, `Changed pinned input ${key}`);
    if (inputs[key]) assert.deepEqual(identity, inputs[key], `Input changed during audit ${key}`);
    inputs[key] = identity; files.set(key, file); return raw;
  }
  const contractBytes = await pin('APPROVED_DELIVERY.json');
  assert.deepEqual(contractBytes, await pin('APPROVED_DELIVERY.json', {source: true}), 'Assembled delivery contract differs from current source');
  const contract = JSON.parse(contractBytes);
  assert(Array.isArray(contract.files), 'Missing delivery files');
  const approved = new Map();
  for (const p of contract.files) {
    safeRelative(p.path); assert(!approved.has(p.path), `Duplicate delivery pin ${p.path}`);
    assert(Number.isSafeInteger(p.bytes) && p.bytes > 0 && /^[a-f0-9]{64}$/.test(p.sha256), 'Invalid delivery pin');
    approved.set(p.path, {bytes: p.bytes, sha256: p.sha256});
  }
  async function delivered(name) {
    assert(approved.has(name), `Missing delivery pin ${name}`);
    if (reviewed[name]) assert.deepEqual(approved.get(name), {bytes: reviewed[name][0], sha256: reviewed[name][1]}, `Reviewed input changed ${name}`);
    return pin(name, {expected: approved.get(name)});
  }
  async function sameSource(name) {
    const local = await pin(name, {source: true}), actual = await pin(name);
    // Git checkouts may use CRLF; retain raw hashes for both, compare LF source.
    assert.equal(actual.toString('utf8').replaceAll('\r\n', '\n'), local.toString('utf8').replaceAll('\r\n', '\n'), `Stale assembled source ${name}`);
    return actual;
  }
  // Pin the executed code and its static import graph before importing models.
  const modules = new Set();
  async function moduleTree(name) {
    safeRelative(name); if (modules.has(name)) return; modules.add(name);
    const code = (await sameSource(name)).toString('utf8');
    // Match declarations, not documentation examples, shader text or strings.
    const imports = code.matchAll(/^\s*(?:import\s+|export\s+(?=[{*]))(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/gm);
    for (const [, specifier] of imports) {
      if (specifier === 'three') { await moduleTree('viewer/vendor/three.module.js'); continue; }
      assert(specifier.startsWith('.'), `Unpinned module import ${specifier}`);
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier.split('?')[0]));
      await moduleTree(next);
    }
  }
  for (const name of ['head-additions.mjs', 'rapido-x-uhf-cover.mjs', 'embedded-boards.mjs',
    'configuration-model.js', 'head-assembly.js', 'step-surface-selection.mjs', 'vendor/GLTFLoader.js']) await moduleTree('viewer/' + name);
  const policy = JSON.parse(await sameSource('viewer/step-surface-sources.json'));
  assertDragonPolicy(policy);
  for (const entry of [policy.license, ...policy.generator]) {
    const name = path.posix.normalize(path.posix.join('viewer', entry.path));
    const raw = await sameSource(name);
    assert.equal(sha(raw), entry.sha256, `Changed terms/generator ${name}`);
  }
  const raw = JSON.parse(await delivered('TOOLHEAD_CONFIGURATIONS.json'));
  const additionsBytes = await sameSource('HEAD_ADDITIONS.json');
  assert.equal(sha(additionsBytes), contract.source_catalog_sha256?.['HEAD_ADDITIONS.json'], 'Unpinned head additions');
  const loadModule = name => import(pathToFileURL(path.join(root, 'viewer', name)).href + '?dragonAudit=' + inputs['viewer/' + name].sha256);
  const {withHeadAdditions} = await loadModule('head-additions.mjs');
  const {withRapidoXUhfCover} = await loadModule('rapido-x-uhf-cover.mjs');
  const {withEmbeddedBoards, sbEmbeddedBoard, xolEmbeddedBoard} = await loadModule('embedded-boards.mjs');
  const {headPlan, headPlacement, partKey} = await loadModule('head-assembly.js');
  const {snapshotHeadSurfaces, planSurfaceSelection} = await loadModule('step-surface-selection.mjs');
  const sbMeta = JSON.parse(await delivered(raw.base_assets.stealthburner.meta));
  const xolMeta = JSON.parse(await delivered(raw.base_assets.xol.meta));
  const board = sbEmbeddedBoard(sbMeta);
  assert.deepEqual(board.keys, ['548', '549'], 'Embedded SB board source changed');
  const merged = withRapidoXUhfCover(withHeadAdditions(raw, JSON.parse(additionsBytes)));
  const catalog = withEmbeddedBoards(merged, [xolEmbeddedBoard(xolMeta), board]);
  const uniqueVariants = new Set();
  for (const v of catalog.variants) { assert(!uniqueVariants.has(v.id), `Duplicate registration ${v.id}`); uniqueVariants.add(v.id); }
  const consumers = new Map();
  for (const asset of assets) {
    const collect = c => c.variants.filter(v => {
      const matches = headPlan(v).modules.filter(m => m.id === asset);
      assert(matches.length <= 1, `Duplicate Dragon module ${v.id}`);
      if (v.toolhead === 'stealthburner' && v.hotend === asset.slice(3)) assert.equal(matches.length, 1, `Missing Dragon registration ${v.id}`);
      return matches.length === 1;
    });
    const before = collect(raw), after = collect(catalog), oldIDs = new Set(before.map(v => v.id));
    assert.equal(before.length, 68, `Raw consumer coverage changed ${asset}`);
    assert.equal(after.length, 82, `Board-expanded consumer coverage changed ${asset}`);
    assert.equal(oldIDs.size, 68);
    assert(before.every(v => after.some(w => w.id === v.id)), 'Raw registration disappeared');
    const added = after.filter(v => !oldIDs.has(v.id));
    assert.equal(added.length, 14, `New board consumer coverage changed ${asset}`);
    for (const v of added) {
      assert(v.id.endsWith('__' + board.suffix) && oldIDs.has(v.id.slice(0, -board.suffix.length - 2)), 'Unreviewed board-derived registration');
      assert.equal(v.board, 'none');
      const hidden = headPlan(v).hidden;
      assert(board.keys.every(k => hidden.has(k)), 'Board-derived visibility mask missing');
    }
    consumers.set(asset, {before, after, added});
  }
  // Check all referenced assets, including companions and docks, for presence
  // and exact delivery identity. Only three meshes are parsed below.
  const referenced = new Set(['sb_revo_voron']);
  for (const {after} of consumers.values()) for (const v of after) {
    const p = headPlan(v); referenced.add(p.base);
    for (const m of p.modules) referenced.add(m.id);
    if (v.inspection_module) referenced.add(v.inspection_module);
  }
  const metadata = new Map();
  for (const asset of referenced) {
    const spec = catalog.base_assets[asset] || catalog.assets[asset];
    assert(spec && !spec.external && spec.meta && spec.glb, `Missing registered local asset ${asset}`);
    const meta = JSON.parse(await delivered(spec.meta));
    assert(Array.isArray(meta.parts) && meta.parts.length > 0, `Missing parts ${asset}`);
    assert.equal(new Set(meta.parts.map(p => String(p.key))).size, meta.parts.length, `Duplicate part key ${asset}`);
    await delivered(spec.glb + '.gz');
    metadata.set(asset, meta);
  }
  for (const {after} of consumers.values()) for (const v of after) {
    const p = headPlan(v);
    for (const e of [{id: p.base, hidden_keys: [...p.hidden]}, ...p.modules]) {
      const keys = new Set(metadata.get(e.id).parts.map(p => String(p.key)));
      for (const key of e.hidden_keys || []) assert(keys.has(String(key)), `Mask refers to missing part ${v.id}/${e.id}/${key}`);
    }
  }
  async function recheck() {
    for (const [key, file] of files) {
      const raw = await fs.readFile(file);
      assert.deepEqual({bytes: raw.length, sha256: sha(raw)}, inputs[key], `Input changed during audit ${key}`);
    }
  }
  return {inputs, delivered, loadModule, raw, catalog, policy, consumers, metadata,
    headPlan, headPlacement, partKey, snapshotHeadSurfaces, planSurfaceSelection, recheck};
}

export async function auditDragonSurfaces(root, {catalog: suppliedCatalog, policy: suppliedPolicy} = {}) {
  root = path.resolve(root);
  const c = await pinContext(root);
  // Execute admission and snapshot from the same freshly pinned delivered
  // module, including its current display-fragment identity handling.
  const {planSurfaceSelection} = c;
  // Caller context never substitutes a stale or reduced consumer catalog.
  const supplied = suppliedCatalog === undefined ? 'none' : canonicalJSON(suppliedCatalog) === canonicalJSON(c.raw) ? 'exact-raw' : 'exact-expanded';
  if (suppliedCatalog !== undefined && supplied !== 'exact-raw') assert.equal(canonicalJSON(suppliedCatalog), canonicalJSON(c.catalog), 'Stale/subset compiled catalog argument');
  if (suppliedPolicy !== undefined) assert.deepEqual(suppliedPolicy, c.policy, 'Stale source policy argument');
  const THREE = await c.loadModule('vendor/three.module.js');
  const {GLTFLoader} = await c.loadModule('vendor/GLTFLoader.js');
  const counts = {sb_revo_voron: 32, sb_dragon_hf: 40, sb_dragon_sf: 39};
  async function load(asset) {
    const spec = c.catalog.assets[asset]; assert(spec && !spec.external);
    assert.equal(spec.meta, `modules/${asset}.json`); assert.equal(spec.glb, `modules/${asset}.glb`);
    const meta = c.metadata.get(asset), wire = await c.delivered(spec.glb + '.gz');
    assert.equal(meta.parts.length, counts[asset], `Actual part count changed ${asset}`);
    const bytes = zlib.gunzipSync(wire);
    const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const bench = new THREE.Group(), assembly = model.scene, meshes = [], byKey = new Map(meta.parts.map(p => [String(p.key), p]));
    bench.add(assembly);
    assembly.traverse(mesh => {
      if (!mesh.isMesh) return;
      const key = c.partKey(mesh), row = byKey.get(key); assert(row, `Unregistered actual mesh ${asset}/${key}`);
      assert(!Array.isArray(mesh.material), 'Unexpected multi-material source leaf');
      mesh.material = mesh.material.clone();
      meshes.push({key, mesh, role: row.appearance_role, component: row.component, color: mesh.material.color.clone()});
    });
    assert.equal(meshes.length, counts[asset], `Missing actual mesh ${asset}`);
    assert.equal(new Set(meshes.map(r => r.key)).size, counts[asset], `Duplicate actual mesh ${asset}`);
    const cached = new Map([[asset, {loaded: {root: assembly, meta, meshes}}]]);
    return {assembly, meshes, byKey, snapshot: () => c.snapshotHeadSurfaces({cached, bench, THREE, policy: c.policy, catalog: c.catalog}),
      dispose() { for (const {mesh} of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } }};
  }
  const canonical = await load('sb_revo_voron');
  const sourceRows = canonical.snapshot();
  const reports = [];
  try {
    for (const asset of assets) {
      const a = await load(asset);
      try {
        const keys = keysFor(asset);
        const sourceFor = row => sourceRows.find(s => s.id === surfaceRule(c.policy, asset, row.key)?.sourceAlias?.key);
        const relation = (row, delta) => assertDragonAliasRelation(row, sourceFor(row), delta);
        const initial = await planSurfaceSelection(a.snapshot(), c.policy);
        assert.deepEqual(initial.included.map(r => r.id).sort(), keys.slice().sort());
        assert.deepEqual(initial.counts, {selected: counts[asset], included: 4, omitted: counts[asset] - 4});
        assert(initial.omitted.every(r => r.reason === 'source-not-admitted'), 'Unreviewed leaves must remain excluded');
        const bindings = initial.included.map(row => {
          relation(row);
          const source = sourceFor(row), rule = surfaceRule(c.policy, asset, row.key);
          assert.equal(a.byKey.get(row.key).name, rule.sourceSelector.label, 'Actual source product label changed');
          assert.equal(row.name, source.name, 'Canonical source product label changed');
          return {key: row.id, canonical: source.id, sourceSelector: rule.sourceSelector,
            positionSha256: row.positionSha256, indexSha256: row.indexSha256, matrixCAD: row.matrixCAD,
            triangles: row.index.length / 3, sourceTriangles: row.sourceIndex.length / 3, zeroAreaTriangles: row.zeroAreaTriangles.length};
        });
        let transformRejects = 0;
        for (const key of keys) {
          const mesh = a.meshes.find(r => r.key === key).mesh;
          assert(mesh.matrixAutoUpdate);
          const p = mesh.position.clone(), q = mesh.quaternion.clone(), s = mesh.scale.clone();
          for (const mutate of [() => { mesh.position.x += .001; }, () => mesh.rotateZ(.1), () => { mesh.scale.x *= 1.01; }]) {
            try {
              mutate();
              assert.throws(() => relation(a.snapshot().find(r => r.id === key)), /Source matrix mismatch/);
              transformRejects++;
            } finally { mesh.position.copy(p); mesh.quaternion.copy(q); mesh.scale.copy(s); }
            relation(a.snapshot().find(r => r.id === key));
          }
        }
        const poses = [{probe: 0, explode: 0}, {probe: 3, explode: 50}, {probe: 1.5, explode: 20}, {probe: 0, explode: 0}];
        const palettes = [['#ffffff', '#0095a8'], ['#203040', '#ff3500'], ['#ffffff', '#0095a8']];
        const configurations = [], consumers = c.consumers.get(asset), oldIDs = new Set(consumers.before.map(v => v.id));
        for (const v of consumers.after) {
          const entry = c.headPlan(v).modules.find(m => m.id === asset), hidden = new Set(entry.hidden_keys || []);
          a.assembly.position.set(0, 0, 0);
          for (const r of a.meshes) {
            r.mesh.visible = !hidden.has(r.key) && r.component !== 'rail_reference';
            r.mesh.material.color.copy(r.color);
          }
          const visible = a.meshes.filter(r => !hidden.has(r.key) && r.component !== 'rail_reference').map(r => r.key).sort();
          const expected = keys.filter(k => visible.includes(k)).sort();
          assert.equal(expected.length, v.cooling === 'cpap' || v.extruder === 'orbiter2' ? 3 : 4, 'Source body visibility changed');
          const checkSnapshot = delta => {
            const snap = a.snapshot();
            assert.deepEqual(snap.map(r => r.key).sort(), visible, 'Actual visible/hide mask mismatch');
            const admitted = snap.filter(r => keys.includes(r.id));
            assert.deepEqual(admitted.map(r => r.id).sort(), expected);
            for (const row of admitted) relation(row, delta);
            return snap;
          };
          let native;
          for (let i = 0; i < poses.length; i++) {
            const pose = poses[i], delta = c.headPlacement(v, entry, pose);
            const expectedDelta = [...(entry.translation_mm || v.head_translation_mm)];
            if (v.mount === 'stealthchanger' && entry.role === 'tool') { expectedDelta[1] -= pose.explode; expectedDelta[2] += pose.probe; }
            assert.deepEqual(delta, expectedDelta, 'Production placement changed');
            a.assembly.position.set(delta[0] * .001, delta[2] * .001, -delta[1] * .001);
            const snap = checkSnapshot(delta), signature = snap.filter(r => keys.includes(r.id)).map(r => ({id: r.id, matrixCAD: r.matrixCAD}));
            if (i === 0) {
              native = signature;
              const admitted = await planSurfaceSelection(snap, c.policy);
              assert.deepEqual(admitted.included.map(r => r.id).sort(), expected);
              assert.deepEqual(admitted.counts, {selected: visible.length, included: expected.length, omitted: visible.length - expected.length});
              assert(admitted.omitted.every(r => r.reason === 'source-not-admitted'));
            }
            if (i === poses.length - 1) assert.deepEqual(signature, native, 'Reversed pose did not restore native placement');
          }
          for (const palette of palettes) {
            for (const r of a.meshes) if (['base', 'accent'].includes(r.role)) r.mesh.material.color.set(palette[r.role === 'base' ? 0 : 1]);
            const snap = checkSnapshot(c.headPlacement(v, entry, poses[0]));
            assert.deepEqual(snap.filter(r => keys.includes(r.id)).map(r => ({id: r.id, matrixCAD: r.matrixCAD})), native);
            for (const r of a.meshes) {
              const expectedColor = ['base', 'accent'].includes(r.role) ? new THREE.Color(palette[r.role === 'base' ? 0 : 1]) : r.color;
              assert.deepEqual(r.mesh.material.color.toArray(), expectedColor.toArray(), 'Hardware/printed palette boundary changed');
            }
            for (const row of snap.filter(r => keys.includes(r.id))) {
              const mesh = a.meshes.find(r => r.key === row.key).mesh;
              assert.deepEqual(row.rgb, mesh.material.color.clone().convertLinearToSRGB().toArray(), 'Exported palette mismatch');
            }
          }
          configurations.push({id: v.id, consumer: oldIDs.has(v.id) ? 'raw' : 'board-expanded-new',
            hidden: [...hidden].sort(), visible: visible.length, included: expected, omitted: visible.length - expected.length,
            poseVisits: poses.length, paletteVisits: palettes.length});
        }
        // Mutated actual buffers and identity-spoofed purchased copies cannot
        // acquire permission from the authored alias or its printed appearance.
        const negatives = [];
        a.assembly.position.set(0, 0, 0); for (const r of a.meshes) r.mesh.visible = true;
        const original = a.snapshot().find(r => r.id === keys[0]);
        for (const [label, mutate, reason] of [
          ['position', r => { r.positions[0] += 1; }, 'source-geometry-changed'],
          ['index', r => { r.index[0] = (r.index[0] + 1) % (r.positions.length / 3); }, 'source-geometry-changed'],
          ['asset', r => { r.asset = 'sb_dragon_uhf'; }, 'source-not-admitted'],
          ['purchased-key', r => { r.key = `${asset}_front_7`; }, 'source-not-admitted'],
          ['unreviewed-mount', r => { r.key = `${asset}_mount_0`; }, 'source-not-admitted']
        ]) {
          const row = structuredClone(original); mutate(row);
          const rejected = await planSurfaceSelection([row], c.policy);
          assert.equal(rejected.included.length, 0); assert.equal(rejected.omitted[0]?.reason, reason);
          negatives.push(label);
        }
        reports.push({asset, occurrences: counts[asset], counts: initial.counts, bindings, transformRejects, negatives,
          rawConfigurations: consumers.before.length, newBoardConfigurations: consumers.added.length, configurations,
          poses, palettes, distinctPoseControlStates: 3, distinctPalettes: 2, posePaletteCartesianProduct: false});
      } finally { a.dispose(); }
    }
    await c.recheck();
    return {passed: true, schema: 'dragon-authored-surface-release-v1', inputs: c.inputs,
      compiledCatalogSha256: sha(canonicalJSON(c.catalog)), suppliedCatalog: supplied,
      sourceAliases: 8, distinctAuthoredSources: 14, rawConfigurations: 136, newBoardConfigurations: 28,
      configurations: reports.reduce((n, r) => n + r.configurations.length, 0), transformRejects: reports.reduce((n, r) => n + r.transformRejects, 0),
      assets: reports, newNativeSolids: 0, parsedAssets: ['sb_revo_voron', ...assets],
      scope: 'Actual delivered Dragon HF/SF four common authored front leaves each; complete POSITION/index and 16-component canonical source relation, all 164 current standalone consumers, sampled pose reversal and separate palette reversal. Companion asset identities/presence only. No complete head/editor, installed machine, native repair, physical-fit or continuous-motion qualification.'};
  } finally { canonical.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert(process.argv[2], 'An assembled site with its temporary delivery contract is required');
  console.log(JSON.stringify(await auditDragonSurfaces(process.argv[2])));
}
