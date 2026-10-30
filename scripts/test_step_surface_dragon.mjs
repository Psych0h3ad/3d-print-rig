// Source/omission regressions only. The tiny synthetic buffers below are not
// Dragon model evidence; the separate assembled-site release audit is required.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {assertDragonPolicy, assertDragonAliasRelation} from './audit_step_surface_dragon.mjs';
import {surfaceRule, planSurfaceSelection} from '../site/viewer/step-surface-selection.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assets = ['sb_dragon_hf', 'sb_dragon_sf'], numbers = [6, 9, 10, 11];
const current = JSON.parse(await fs.readFile(new URL('../site/viewer/step-surface-sources.json', import.meta.url)));
const policy = current;
assertDragonPolicy(policy);
let sourceRejects = 0;
function rejectsPolicy(mutate) {
  const bad = structuredClone(policy); mutate(bad);
  assert.throws(() => assertDragonPolicy(bad)); sourceRejects++;
}
const alias = p => p.parts.find(r => r.key === 'sb_dragon_hf_front_6');
for (const mutate of [
  p => p.parts.pop(),
  p => p.parts.push(structuredClone(alias(p))),
  p => { alias(p).asset = 'sb_dragon_uhf'; },
  p => { alias(p).key = 'sb_dragon_hf_front_7'; },
  p => { alias(p).key = 'sb_dragon_hf_mount_0'; },
  p => { alias(p).sourceAlias.asset = 'purchased'; },
  p => { alias(p).sourceAlias.key = 'sb_revo_voron_7'; },
  p => { alias(p).sourceSelector.productId = 'unreviewed-product'; },
  p => { alias(p).sourceSelector.id = 'unreviewed-definition'; },
  p => { alias(p).geometry.index.sha256 = '0'.repeat(64); },
  p => { alias(p).geometry.position.count--; },
  p => { alias(p).sourceAlias.basis = ''; },
  p => { p.source.license = 'unreviewed-terms'; },
  p => { p.source.revision = 'unreviewed-revision'; },
  p => { p.license.sha256 = '0'.repeat(64); },
  p => { p.parts.find(r => r.key === 'sb_revo_voron_6').sourceSelector.productId = 'different'; },
  p => { p.parts.find(r => r.asset === 'sb_v6').key = 'sb_v6_front_7'; }
]) rejectsPolicy(mutate);

for (const asset of assets) {
  for (const n of numbers) assert(surfaceRule(policy, asset, `${asset}_front_${n}`));
  for (const suffix of ['front_7', 'front_13', 'front_14', 'mount_0', 'heatsink', 'heater', 'nozzle', 'hardware_1', 'bolt_257']) {
    assert.equal(surfaceRule(policy, asset, `${asset}_${suffix}`), undefined, 'Purchased/unreviewed leaf acquired a rule');
  }
}

// Four synthetic vertices and two nonzero triangles: exercise full-buffer
// comparison, including the final coordinate/index, without loading a model.
const positions = new Float32Array([0, 0, 0, .001, 0, 0, 0, .001, 0, .001, .001, 0]);
const index = new Uint32Array([0, 1, 2, 2, 1, 3]);
const matrix = [1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 12, 34, 56, 1];
function fixture(asset, n) {
  const key = `${asset}_front_${n}`;
  return {id: key, key, asset, name: 'Synthetic two-triangle fixture', positions: positions.slice(), index: index.slice(),
    positionItemSize: 3, normalized: false, deformed: false, materialCount: 1, fullDrawRange: true,
    matrixCAD: matrix.slice(), rgb: [1, 0, 0], opacity: 1};
}
function source(n) {
  const row = fixture('sb_dragon_hf', n);
  row.asset = 'sb_revo_voron'; row.id = row.key = `sb_revo_voron_${n}`; return row;
}
const tinyPolicy = {...structuredClone(policy), parts: policy.parts.filter(p => assets.includes(p.asset)).map(p => ({...p,
  geometry: {position: {count: 4, itemSize: 3, componentType: 5126, sha256: sha(positions)},
    index: {count: 6, itemSize: 1, componentType: 5125, sha256: sha(index)}}}))};
// Occurrence/primitive identity belongs to the snapshot producer. Admission
// must still reject duplicate admitted IDs, even with identical source buffers.
await assert.rejects(planSurfaceSelection([fixture('sb_dragon_hf', 6), fixture('sb_dragon_hf', 6)], tinyPolicy), /Duplicate selected part/);
let relations = 0, omissions = 0;
// Display-fragment identities retain the original CAD identity in omissions;
// splitting an unreviewed/purchased leaf never grants a Dragon source rule.
for (const asset of assets) {
  const fragments = [0, 1].map(ordinal => {
    const row = fixture(asset, 6); row.key = `${asset}_front_7`;
    row.id = `${asset}:${row.key}::display-mesh=${ordinal}`;
    row.sourcePart = {asset, key: row.key, displayMeshIndex: ordinal, displayMeshCount: 2,
      displayMeshName: `Synthetic unadmitted fragment ${ordinal}`};
    return row;
  });
  const rejected = await planSurfaceSelection(fragments, tinyPolicy);
  assert.deepEqual(rejected.counts, {selected: 2, included: 0, omitted: 2});
  assert.deepEqual(rejected.omitted.map(r => r.id), fragments.map(r => r.id));
  for (let j = 0; j < fragments.length; j++) {
    assert.equal(rejected.omitted[j].reason, 'source-not-admitted');
    assert.deepEqual(rejected.omitted[j].sourcePart, fragments[j].sourcePart);
    assert.notEqual(rejected.omitted[j].sourcePart, fragments[j].sourcePart);
    omissions++;
  }
}
for (const asset of assets) for (const n of numbers) {
  const row = fixture(asset, n), canonical = source(n);
  assertDragonAliasRelation(row, canonical); relations++;
  const moved = structuredClone(row), delta = [5, -10, 2];
  for (let j = 0; j < 3; j++) moved.matrixCAD[12 + j] += delta[j];
  assertDragonAliasRelation(moved, canonical, delta); relations++;
  for (let j = 0; j < 16; j++) {
    const changed = structuredClone(row); changed.matrixCAD[j] += .01;
    assert.throws(() => assertDragonAliasRelation(changed, canonical), /Source matrix mismatch/);
  }
  const selected = await planSurfaceSelection([row], tinyPolicy);
  assert.equal(selected.included.length, 1);
  assert.equal(selected.included[0].index.length, 6);
  assertDragonAliasRelation(selected.included[0], canonical);
  for (const [mutate, reason] of [
    [r => { r.positions[r.positions.length - 1] += 1; }, 'source-geometry-changed'],
    [r => { r.index[r.index.length - 1] = 0; }, 'source-geometry-changed'],
    [r => { r.asset = 'sb_dragon_uhf'; }, 'source-not-admitted'],
    [r => { r.key = `${asset}_front_7`; }, 'source-not-admitted'],
    [r => { r.key = `${asset}_mount_0`; }, 'source-not-admitted']
  ]) {
    const bad = structuredClone(row); mutate(bad);
    const result = await planSurfaceSelection([bad], tinyPolicy);
    assert.equal(result.included.length, 0); assert.equal(result.omitted[0]?.reason, reason); omissions++;
    if (reason === 'source-geometry-changed') assert.throws(() => assertDragonAliasRelation(bad, canonical));
  }
  const missing = structuredClone(tinyPolicy);
  missing.parts = missing.parts.filter(p => p.key !== row.key);
  const rejected = await planSurfaceSelection([row], missing);
  assert.equal(rejected.included.length, 0); assert.equal(rejected.omitted[0]?.reason, 'source-not-admitted'); omissions++;
  const wrongProduct = source(n === 6 ? 9 : 6);
  assert.throws(() => assertDragonAliasRelation(row, wrongProduct), /Wrong canonical source product/);
}
console.log(JSON.stringify({passed: true, sourceRejects, syntheticRelations: relations, syntheticOmissions: omissions,
  actualModelLoads: 0, scope: 'Exact source-rule and omission guards plus tiny synthetic full-buffer/matrix regressions only. Actual assembled-site audit remains required.'}));
