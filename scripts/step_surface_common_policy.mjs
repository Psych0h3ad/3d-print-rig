// Keep every previously admitted source rule and its terms immutable while
// adding only the eight explicitly reviewed common-front occurrences.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const commonFrontFamilies = [
  {asset: 'sb_rapido2_hf', prefix: 'front'},
  {asset: 'sb_chube_compact', prefix: 'common'}
];
export const commonFrontNumbers = [6, 9, 10, 11];
const ordered = x => Array.isArray(x) ? x.map(ordered) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordered(x[k])])) : x;
const digest = x => createHash('sha256').update(JSON.stringify(ordered(x))).digest('hex');
const prior26SHA256 = '6e337e8c5a20e2fe386899c148c9eda36115407e8e19c07bec93e744324cf16a';

export function commonFrontLegacyPolicy(policy) {
  assert(Array.isArray(policy?.parts) && policy.parts.length === 34, 'Exactly 34 source rules required');
  assert.equal(Object.keys(policy.parts).length, 34, 'Dense source rule array required');
  for (let i = 0; i < 34; i++) assert(Object.hasOwn(policy.parts, i) && policy.parts[i] && typeof policy.parts[i].asset === 'string');
  const added = new Set(commonFrontFamilies.map(r => r.asset));
  const legacy = {...policy, parts: policy.parts.filter(r => !added.has(r.asset))};
  assert.equal(legacy.parts.length, 26, 'Existing source rule count changed');
  assert.equal(digest(legacy), prior26SHA256, 'Existing 26 identities, source terms or generator changed');
  assert.equal(new Set(policy.parts.map(r => `${r.asset}:${r.key}`)).size, 34, 'Duplicate source rule');
  for (const {asset, prefix} of commonFrontFamilies) {
    const rows = policy.parts.filter(r => r.asset === asset);
    assert.deepEqual(rows.map(r => r.key).sort(), commonFrontNumbers.map(n => `${asset}_${prefix}_${n}`).sort());
    for (const n of commonFrontNumbers) {
      const source = legacy.parts.find(r => r.key === `sb_revo_voron_${n}` && r.asset === 'sb_revo_voron');
      const alias = rows.find(r => r.key === `${asset}_${prefix}_${n}`);
      const {sourceAlias, ...body} = alias;
      assert.deepEqual(body, {...source, asset, key: alias.key}, 'Authored product or complete buffer binding changed');
      assert.deepEqual(Object.keys(sourceAlias || {}).sort(), ['asset', 'basis', 'key']);
      assert.equal(sourceAlias.asset, source.asset); assert.equal(sourceAlias.key, source.key);
      assert(typeof sourceAlias.basis === 'string' && sourceAlias.basis.trim(), 'Missing exact source lineage');
    }
  }
  return legacy;
}
