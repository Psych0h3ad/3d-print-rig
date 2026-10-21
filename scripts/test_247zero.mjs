import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {machineChoices, machineFamilies, machineVendors} from '../site/viewer/machines.js';
import {applyNativeMotionProfile} from '../site/viewer/native-motion-profile.mjs';
import {nativeMotion, validateAxes} from '../site/viewer/community-state.mjs';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
import {supportedLanguages} from '../site/viewer/languages.mjs';
import {sourceRevision, validateTranslations} from './build_locales.mjs';

// Pinned source identities, not a model-hash pin or a physical-fit certificate.
const id = '247zero_beta2_120', commit = '1f790081bddd6120e885f42dc6a78fa326baf4b2', skirtCommit = 'a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8';
const read = relative => JSON.parse(fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const pins = [{"id":"247zero","repository":"247printing/247zero","commit":"1f790081bddd6120e885f42dc6a78fa326baf4b2","source_archive_sha256":"0f9986f9c716698c83ad91057b6acc2c8f3af33e74891834e7bb28803beba011","source_archive_bytes":34739634,"source_step_sha256":"5359ea556128974a57de5564ea6587a53f81c2e48a499a439dc95ea1b64352fa"},{"id":"247zero_voron_v02_skirts","repository":"VoronDesign/Voron-0","commit":"a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8","source_archive_sha256":"694d0de2ec149d12a7072322a57f24f83c751d088f8ded23ec9964aa05f5a09c","source_archive_bytes":30173201,"source_step_sha256":"f53f595c547547cdfb0e1891052a855d045b08de872c0a5b1cdb92defba5d6bf"}];
const catalog = read('site/PUBLIC_CATALOG.json'), assets = read('site/COMMUNITY_MACHINES_ASSETS.json');
const choice = machineChoices.find(row => row.id === id), spec = assets.machines[id];
assert.deepEqual({family: choice?.family, vendor: choice?.vendor, size: choice?.size, page: choice?.page},
  {family: '247zero', vendor: '247printing', size: 120, page: './community.html'});
assert.notEqual(choice.available, false); assert.equal(machineFamilies['247zero'], '247zero'); assert.equal(machineVendors['247printing'], '247printing');
assert.equal(spec.machine_id, id); assert.equal(spec.parts, 2118);
for (const file of ['model.glb', 'assembly_manifest.json', 'machine_profile.json']) {
  assert(spec.files[file]?.bytes > 0, 'Missing declared asset: ' + file);
  assert.match(spec.files[file].sha256, /^[a-f0-9]{64}$/u);
}
for (const pin of pins) {
  const rows = catalog.sources.filter(row => row.id === pin.id); assert.equal(rows.length, 1);
  const source = rows[0]; for (const [key, value] of Object.entries(pin)) assert.equal(source[key], value, pin.id + ': ' + key);
  assert(source.author && source.version && source.scope && source.changes); assert.match(source.license, /^GPL-3\.0/u);
  for (const key of ['url', 'license_url', 'cad_url']) assert(source[key].includes(pin.repository + '/') && source[key].includes(pin.commit), pin.id + ': pinned ' + key);
}
assert.equal(catalog.sources.find(row => row.id === '247zero').version, '247zeroBETA2 / CAD v43');
assert(!catalog.defaults.some(row => row.id === id), 'No new machine STEP download is authorized');

const source = read('localization/source.json'), dictionaries = Object.fromEntries(['es', 'ko', 'ru'].map(lang => [lang, read('localization/' + lang + '.json')]));
const messageIDs = ['caption', 'description', 'source_notice', 'assembly_notice', 'motion_notice'].map(name => 'machine.247zero.' + name);
const subset = {...source, entries: Object.fromEntries(messageIDs.map(key => [key, source.entries[key]]))};
for (const entry of Object.values(subset.entries)) assert.equal(sourceRevision(entry), sha(JSON.stringify([entry.kind, entry.ja, entry.en, entry.aliases || []])).slice(0, 20));
assert.deepEqual(validateTranslations(subset, Object.fromEntries(Object.entries(dictionaries).map(([lang, locale]) => [lang,
  {...locale, messages: Object.fromEntries(messageIDs.map(key => [key, locale.messages[key]]))}]))), []);
const definitions = Object.fromEntries(Object.entries(subset.entries).map(([key, entry]) => [key, {...entry, revision: sourceRevision(entry)}]));
const translator = createTranslator(definitions, {dictionaries: new Map(Object.entries(dictionaries).map(([lang, locale]) => [lang,
  Object.fromEntries(messageIDs.map(key => [key, [locale.messages[key].source_revision, locale.messages[key].text]]))]))});
const community = fs.readFileSync(new URL('../site/viewer/community-renderer.mjs', import.meta.url), 'utf8');
const table = name => vm.runInNewContext('(' + community.match(new RegExp('const ' + name + '=(' + '\x7b' + '[\\s\\S]*?' + '\x7d' + ');'))[1] + ')', {}, {timeout: 100});
const description = table('descriptions')[id], notice = table('sourceNotices')[id];
assert.equal(description, subset.entries['machine.247zero.description'].en); assert.equal(notice, subset.entries['machine.247zero.source_notice'].en);
assert.equal(choice.label, subset.entries['machine.247zero.caption'].en);
for (const language of supportedLanguages) for (const [key, entry] of Object.entries(subset.entries)) {
  const expected = language === 'ja' ? entry.ja : language === 'en' ? entry.en : dictionaries[language].messages[key].text;
  assert.equal(translator.translate(entry.en, language), expected, key + ': exact English lookup in ' + language);
  assert.equal(translator.formatMessage(key, {}, language), expected);
  if (language !== 'ja') assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(expected), 'Untranslated Japanese in ' + key);
}

// Compact selection fixture from CAD v43/source intake. Unlisted native parts,
// geometric seating, belt teeth, swept clearance and browser rendering are outside it.
const roleKeys = {"frame":["0"],"metal":["54","55","77","78","100","101","123","124","260","1737","1738","1739","1740","1741","1742","1743","1744","1818","1819","1820","1821","1823","1824","1825","1826","1827","1828","1829","1830","1831","1832","1833","1834","1835","1839","1840","1841","1842","1843","1844","1847","1848","1849","1850","1852","1853","1866","1885","1886","1887"],"base":["329","56","79","102","125","1730","1807","1809","1810","1811","1812","1813","1857","1882","1883","1884","skirt_v02_00575","skirt_v02_00577","skirt_v02_00578","skirt_v02_00579"],"rubber":["152","153","340","341","342","343","344","345","346","347","348","349","350","351","352","1707","1808","1822","1836","1879","1881"],"brass":["297","1845","1846","1854","1855","1856"],"accent":["1718","1871","1878","1888","1889","1890","skirt_v02_00574","skirt_v02_00576"],"carbon":["1736"],"motor":["1837","1838","1897"]};
const groupKeys = {"fixed":["0","55","56","78","79","101","102","124","125","341","1707","1718","1730","1857","1866","1871","1878","1879","1881","1882","1883","1884","1885","1886","1887","1888","1889","1890","1897","skirt_v02_00575","skirt_v02_00577","skirt_v02_00578","skirt_v02_00579","skirt_v02_00574","skirt_v02_00576"],"gantry":["54","77","1736","1738","1739","1740","1741","1742","1743","1744"],"bed":["100","123","260","297","329","342"],"registered_flex":["152","153"],"registered_chain":["340","343","344","345","346","347","348","349","350","351","352"],"head":["1737","1807","1808","1809","1810","1811","1812","1813","1818","1819","1820","1821","1822","1823","1824","1825","1826","1827","1828","1829","1830","1831","1832","1833","1834","1835","1836","1837","1838","1839","1840","1841","1842","1843","1844","1845","1846","1847","1848","1849","1850","1852","1853","1854","1855","1856"]};
const names = {"1730":"247zero 3Dprinted Bottom Panel Octopus Pro M4 HEX","1736":"247CF_Beam_Mellow_V0.6 AliExpress v1","1807":"247zeroB2 Toolhead Strain relieve","1808":"ECAS04 Bowden Collet","1809":"247zeroESPC2 Fanless Partcooling Duct V2 LEFT","1810":"247zeroESPC2 Fanless Partcooling Duct V2 RIGHT","1811":"Retension Block Threaded four CNC Kitchen Short Inserts","1812":"247zeroB2 ULW Bowden Toolhead Mosquito Crazy NF LEFT","1813":"247zeroB2 ULW Bowden Toolhead Mosquito Crazy NF RIGHT","1830":"volcanoNozzle_steel","1837":"Body","1838":"Blades","1857":"247zeroBETA2 M4 holder","1879":"Main body Mirrored","skirt_v02_00575":"Front Left Skirt:1/=>[0:1:1:362]","skirt_v02_00577":"Front Right Skirt:1/=>[0:1:1:364]","skirt_v02_00578":"Printed Parts (20):1/Side Skirts:1","skirt_v02_00579":"Printed Parts (20):1/Side Skirts:2","skirt_v02_00574":"Logo Insert","skirt_v02_00576":"Logo Insert"};
const nativeHashes = {"1730":"4da191f81c42f38c727047940e28483be80e98ed470d812752f9a3bb3e2a6295","1736":"e4dd4686bd0cd68cfc6470ee9044db0b47acfddadfb87d161951caf12fe85d9d","1807":"69b3ca7ceccd9bf7f410d3a1e8bb76cae5cf2d5d0a3c0885b8d2416450b4aba9","1808":"4d6ff376eb631a9f498c5f65574172cd67e3458a10cc6027bf3fc0c8f0d56ef5","1809":"4360c1d268403e1464a61c8ec179f534825fc68fc3aa227935654c6853694346","1810":"3c9bddbc0b46989079a69a80620e84ecda36c68dbc443f227d40e4e8670e2f47","1811":"783d892c7340290b7b0a2c077cc771f60113dd8d6428e95b07db65a359c666f2","1812":"532ddca1780abfd08396b4e7906b6723f5766a6ac57d023c8f4ac8a7a8696869","1813":"85f9171090442c9d530b0f6d4e6fa9939234fc5dadf9b4d604465a664a61ddd9","1830":"12a6946c85f01a76291feaaa8cdaa7465875666cf40479eb05edd3b6fee1ed05","1837":"480dcb94d0aed5bd14ec9a70ee85a1dea601b0978896982d23e9a3cbb9063692","1838":"e3856cf65e53d77015f178aeec7a53c8b7f3ca8c6378349ac6d3fa25554b10e9","1857":"cb5b72b78c642668bdfbd25397a85ae5a03192fe92cce55a7f5ab62c41a7644e","1879":"576d64816cf77cb485120f18c8a705804d747c8453b2cca6ed8743849e8766ea","skirt_v02_00575":"46ad5be5e26cb553aefe25a93edf60264cd0b5493ec5f2e03f15d1e31c381ca5","skirt_v02_00577":"ed2bcfcb70de5fe52074dcf43ca7621d2e18922f1e88e683368784dee203d489","skirt_v02_00578":"2171c7d26a3b58dd8cb038b87e8b67fa0ac23764b7ba716d0e9b2652b9be2d1a","skirt_v02_00579":"4c81ba2a47ba2170bd5a440a61c44759b379aa7819887f6a5b7cb399b588134a","skirt_v02_00574":"1c74e64b412145a330e6dbb293571db7d95b56ffff23441fb3d815fb86babdc9","skirt_v02_00576":"6b2484ce5d867102d57fe10ce16dc672b763d4127ff7390647987764d4ba6334"};
const skirtPrinted = Object.keys(names).filter(key => key.startsWith('skirt_'));
for (const key of ["1682", "1683", "1684", "1685", "1686", "1688", "1696", "1697"]) {
 const values={"1682": {"role": "native", "name": "TOP BODY", "sha": "e42201026f39b6789e462e695d647937230e6b1a528bb608570b4fb6508d6176"}, "1683": {"role": "native", "name": "TURBINE BODY", "sha": "5444482f6acd882afc340bdc8f5bde83ead05e5222c5f9296ff9ab875081e190"}, "1684": {"role": "native", "name": "BOTTOM BODY", "sha": "de7795387b4ee634ca7cd95d4110630658e7829b6f23963eb45bf38a12366f61"}, "1685": {"role": "base", "name": "247zeroB2 Octopus Pro Stepper Driver Cooling Duct", "sha": "502d03697faf6c317b14727c73cc3593704ecc7d3e5563cb98f982bf78f4f942"}, "1686": {"role": "metal", "name": "M4x20 BHCS", "sha": "59dd3225f909319c9db66837919ca79ef6856db9d7753d22f561dfa60a604016"}, "1688": {"role": "metal", "name": "M4x20 BHCS", "sha": "1543fa30e827bbe3c93e2f0c892f3d434cfc48337b03155ff556c93a2278a20f"}, "1696": {"role": "metal", "name": "M4 Hex Nut", "sha": "753ff0e6f95609d2ddc3d60531372419a3f1e01166a9e3fa8f3038879702d659"}, "1697": {"role": "metal", "name": "M4 Hex Nut", "sha": "28e9e5bb73bbf32a4ad0a707e0b3446de41eba0266448690b06b23c869db06ba"}};
 const v=values[key];(roleKeys[v.role] ||= []).push(key);groupKeys.fixed.push(key);names[key]=v.name;nativeHashes[key]=v.sha;
}
const sourceInfo = {"repository":"https://github.com/247printing/247zero","revision":"1f790081bddd6120e885f42dc6a78fa326baf4b2","version":"BETA2 / CAD v43","path":"CAD/247zeroBETA2_CAD_v43.zip","author":"247printing","license":"GPL-3.0","source_step_sha256":"5359ea556128974a57de5564ea6587a53f81c2e48a499a439dc95ea1b64352fa"};
const fixtureParts = Object.entries(roleKeys).flatMap(([role, keys]) => keys.map(key => ({key, name: names[key] || key,
  appearance_role: role, group: Object.keys(groupKeys).find(group => groupKeys[group].includes(key)),
  source_path: key === '1837' || key === '1838' ? ['2510 fan v1:1', names[key]] : [names[key] || key],
  source_native_sha256: nativeHashes[key] || sha('source-selection-fixture:' + key)})));
const fixtureRig = {machine_id: id, model_sha256: 'a'.repeat(64), part_count: fixtureParts.length, groups: groupKeys,
  axes: {x: [-60, 60], y: [-65, 55], z: [0, 120]}, motions: {"fixed":[0,0,0],"head":["x","y",0],"gantry":[0,"y",0],"bed":[0,0,{"z":-1}],"registered_chain":[0,0,0],"registered_flex":[0,0,0]},
  origin_mm: [334.3564776285, 0, 0], basis: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], head_groups: ['head']};
const fixtureProfile = {machine_id: id, source: sourceInfo, motion_registration: fixtureRig};
const fixtureManifest = {machine_id: id, source: sourceInfo, parts: fixtureParts,
  additional_sources: [{revision: skirtCommit, path: 'CAD/V0.2 Master Assembly RC2.step', parts: skirtPrinted}]};
function review(manifest, profile, whole = false) {
  const rig = profile.motion_registration; assert(rig, 'An embedded strict registration is required');
  assert.equal(manifest.machine_id, id); assert.equal(profile.machine_id, id);
  for (const source of [manifest.source, profile.source]) {
    assert.equal(source.revision, commit); assert.equal(source.path, 'CAD/247zeroBETA2_CAD_v43.zip');
    assert.equal(source.version, 'BETA2 / CAD v43'); assert.equal(source.source_step_sha256, pins[0].source_step_sha256);
  }
  assert.match(rig.model_sha256, /^[a-f0-9]{64}$/u);
  const parts = applyNativeMotionProfile(manifest, profile, rig, rig.model_sha256).manifest.parts;
  const records = new Map(parts.map(part => [part.key, part])); assert.equal(records.size, parts.length);
  const issues = [];
  for (const [role, keys] of Object.entries(roleKeys)) for (const key of keys) {
    const part = records.get(key), expected = ['56', '79', '102', '125'].includes(key) ? ['base', 'accent'] : [role];
    if (!part || part.group !== Object.keys(groupKeys).find(group => groupKeys[group].includes(key)) || !expected.includes(appearanceRole(part))) issues.push('Companion/group/material: ' + key);
  }
  for (const [key, name] of Object.entries(names)) {
    const part = records.get(key); if (part?.name !== name || part?.source_native_sha256 !== nativeHashes[key]) issues.push('Native source identity: ' + key);
  }
  for (const key of ['1729', '1687', '1689', '1814', '1815', '1816', '1817']) if (records.has(key)) issues.push('Unselected source alternative: ' + key);
  for (const part of parts) {
    const sourcePath = (part.source_path || []).join('/');
    if (/247zeroB2 Extras Options Experimental/.test(sourcePath)) issues.push('Experimental source leaf: ' + part.key);
    if (/ULW Bowden Toolhead (?:Dragon Crazy|Mosquito Crazy NF (?:LEFT|RIGHT))/.test(part.name) && !['1812', '1813'].includes(part.key)) issues.push('Obsolete/duplicate cover: ' + part.key);
    if (part.group === 'head' && /LED|Neopixel/i.test(part.name)) issues.push('Unregistered LED companion: ' + part.key);
    if (part.key.startsWith('skirt_') && !skirtPrinted.includes(part.key) && (part.group !== 'fixed' || appearanceRole(part) !== 'metal')) issues.push('Skirt hardware material/group: ' + part.key);
  }
  const skirtSource = manifest.additional_sources.find(row => row.revision === skirtCommit);
  assert.equal(skirtSource?.path, 'CAD/V0.2 Master Assembly RC2.step');
  const thinCommit = 'd17a5c9fad6f21fd4a3a9869d498656b4b03d1dc';
  const thinKeys = parts.filter(part => part.source_revision === thinCommit).map(part => part.key);
  assert.deepEqual(skirtSource.parts.slice().sort(), parts.filter(part => part.key.startsWith('skirt_') && !thinKeys.includes(part.key)).map(part => part.key).sort());
  if (whole) {
    const thin = manifest.additional_sources.find(row => row.revision === thinCommit);
    assert.equal(thin?.repository, 'https://github.com/WV-design/Trinity-toolhead');
    assert.equal(thin.path, 'Files (WIP)/extras/Trinity pre tensioner by Prooda.step');
    assert.equal(thin.license, 'GPL-3.0');
    assert.equal(thin.source_step_sha256, 'eac8d0dff4be00a5aabe5f274230adc77c59f9ea389a6d4896a000656620d172');
    assert.equal(thinKeys.length, 10);
    assert.deepEqual(thin.parts.slice().sort(), thinKeys.slice().sort());
    for (const key of thinKeys) {
      const part = records.get(key);
      assert.equal(part.source_key, '3');
      assert.equal(part.source_native_sha256, 'a261d0d8a3d0e768fdc5ea574fda05e552ac278d55105399172a3ad66474d678');
      assert.equal(part.source_repository, thin.repository);
      assert.equal(part.group, 'fixed'); assert.equal(part.appearance_role, 'metal');
      const matrix = part.native_transform_matrix_4x4;
      assert.equal(matrix.length, 4); assert(matrix.every(row => row.length === 4 && row.every(Number.isFinite)));
      assert.deepEqual(matrix[3], [0, 0, 0, 1]);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
        assert(Math.abs(matrix[a].slice(0, 3).reduce((v, x, j) => v + x * matrix[b][j], 0) - (a === b ? 1 : 0)) < 1e-10);
    }
  }
  if (whole) {
    assert.equal(parts.length, spec.parts); assert.equal(manifest.native_leaf_count, parts.length);
    // Exact final thin-nut source identities and rigid transforms are checked above.
    // Native contact/body qualification belongs to the separate actual/native jobs.
    assert.equal(parts.filter(part => part.key.startsWith('skirt_') && !skirtPrinted.includes(part.key)).length, 20);
    for (const key of ['1837', '1838']) assert(records.get(key).source_path.includes('2510 fan v1:1'));
    for (const key of ['152', '153']) assert.equal(rig.flex[key].type, 'native_belt_boundary');
    for (const key of ['152', '153', '1707']) assert.equal(appearanceRole(records.get(key)), 'rubber');
    assert.equal(profile.bowden_preview.head_key, '1808'); assert.equal(profile.bowden_preview.fixed_key, '1879');
    assert.equal(profile.bowden_preview.source_length_known, false);
    assert.deepEqual(profile.notices, [subset.entries['machine.247zero.assembly_notice'].en]);
    assert.deepEqual(rig.notices, [subset.entries['machine.247zero.motion_notice'].en]);
  }
  assert.deepEqual(issues, [], 'Source companions and role annotations have open findings');
  return parts;
}
review(fixtureManifest, fixtureProfile);
const registrationCounterexamples = [rig => {rig.model_sha256 = 'b'.repeat(64)}, rig => {rig.machine_id = 'wrong'}, rig => {rig.part_count--},
  rig => {rig.groups.head.push(rig.groups.fixed[0])}, rig => {rig.groups.head.pop()}, rig => {rig.groups.head[0] = 'unknown'}];
for (const mutate of registrationCounterexamples) {
  const rig = structuredClone(fixtureRig); mutate(rig);
  assert.throws(() => applyNativeMotionProfile(fixtureManifest, fixtureProfile, rig, fixtureRig.model_sha256));
}
const remove = (manifest, profile, key) => {
  manifest.parts = manifest.parts.filter(part => part.key !== key);
  profile.motion_registration.part_count--; for (const keys of Object.values(profile.motion_registration.groups)) {const i = keys.indexOf(key); if (i >= 0) keys.splice(i, 1);}
};
const selectionCounterexamples = [
  (m, p) => {delete p.motion_registration},
  (m, p) => {p.source = {...p.source, revision: 'wrong'}},
  (m, p) => remove(m, p, '1813'),
  (m, p) => remove(m, p, '1697'),
  (m, p) => {m.parts.push({...m.parts.find(part => part.key === '1697'),key:'1687'});p.motion_registration.groups.fixed.push('1687');p.motion_registration.part_count++},
  (m, p) => {m.parts.push({...m.parts.find(part => part.key === '1837'), name: 'Unregistered LED carrier', key: 'orphan_led'}); p.motion_registration.groups.head.push('orphan_led'); p.motion_registration.part_count++},
  (m, p) => remove(m, p, '1830'), (m, p) => remove(m, p, '1838'),
  (m, p) => {p.motion_registration.appearance_roles = {'1837': 'base'}},
  (m, p) => {p.motion_registration.appearance_roles = {'56': 'metal'}},
  (m, p) => {p.motion_registration.groups.gantry = p.motion_registration.groups.gantry.filter(key => key !== '54'); p.motion_registration.groups.fixed.push('54')},
  m => {m.parts.find(part => part.key === '1812').source_native_sha256 = 'b'.repeat(64)},
  m => {m.additional_sources[0].revision = 'a53fc87562fd630c846af38d7de850c894dc3d85'},
  (m, p) => {m.parts.push({...m.parts.find(part => part.key === '1812'), key: 'obsolete_cover'}); p.motion_registration.groups.head.push('obsolete_cover'); p.motion_registration.part_count++},
];
for (const mutate of selectionCounterexamples) {const manifest = structuredClone(fixtureManifest), profile = structuredClone(fixtureProfile); mutate(manifest, profile); assert.throws(() => review(manifest, profile));}
const applied = applyNativeMotionProfile(fixtureManifest, fixtureProfile, fixtureRig, fixtureRig.model_sha256).profile;
for (const pose of [{x: -60, y: -65, z: 0}, {x: 60, y: 55, z: 120}, {x: 0, y: -5, z: 60}, {x: -60, y: -65, z: 0}, {x: 0, y: 0, z: 0}]) {
  assert.deepEqual(nativeMotion('head', pose, applied), [pose.x, pose.y, 0]);
  assert.deepEqual(nativeMotion('gantry', pose, applied), [0, pose.y, 0]);
  assert.deepEqual(nativeMotion('bed', pose, applied), [0, 0, pose.z === 0 ? 0 : -pose.z]);
  assert.deepEqual(nativeMotion('fixed', pose, applied), [0, 0, 0]);
}

// Execute the production range-input wiring and label update, not a copied
// clamp helper. Browser range serialization can round just outside native CAD.
const nativeRanges = {"x":[-59.997807724500035,60.00219227550002],"y":[-64.78961454249887,55.21038545750127],"z":[0,120]};
const axisKeys = Object.keys(nativeRanges), elements = Object.fromEntries([...axisKeys.flatMap(key => [key, key + 'Value']),
  'motionPause', 'motionPlay', 'resetPose'].map(key => [key, {value: '0', textContent: ''}]));
const sliderState = {axes: {x: 0, y: 0, z: 0}}, dataset = {}, sliderContext = {axisKeys, state: sliderState, animation: {}, evaOptions: null,
  $: key => elements[key], ranges: () => nativeRanges, render() {}, view() {}, zeroAxes: () => ({x: 0, y: 0, z: 0}),
  document: {body: {dataset}}, current: {profile: {axes: nativeRanges}, adapter: {
    setAxes(next) {validateAxes(next, {axes: nativeRanges}); return {...next};}}}, movable: true};
const productionLine = marker => {const line = community.split('\n').find(line => line.includes(marker)); assert(line, 'Missing production UI handler: ' + marker); return line;};
vm.runInNewContext(productionLine('function setAxes(next){') + '\n' + productionLine('$(k).oninput=()=>{animation=null;')
  + '\n' + productionLine("$('motionPause').onclick="), sliderContext, {timeout: 100});
assert.throws(() => validateAxes({x: 0, y: Number('-64.7896145424989'), z: 0}, {axes: nativeRanges}), 'The exact native lower limit stays strict');
for (const key of axisKeys) {
  const [min, max] = nativeRanges[key], outside = Number.EPSILON * Math.max(1, Math.abs(min), Math.abs(max));
  const cases = [[String(min - outside), min], [String(max + outside), max], [String((min + max) / 2), (min + max) / 2],
    [String(max), max], [String(min), min], ['0', 0]];
  if (key === 'y') cases.unshift(['-64.7896145424989', min]);
  for (const [serialized, expected] of cases) {
    elements[key].value = serialized; sliderContext.animation = {}; elements[key].oninput();
    assert.equal(sliderState.axes[key], expected); assert.equal(elements[key + 'Value'].textContent, expected.toFixed(1) + ' mm');
    assert.equal(sliderContext.animation, null); assert.equal(JSON.parse(dataset.pose)[key], expected);
  }
}
elements.resetPose.onclick(); assert.deepEqual(sliderState.axes, {x: 0, y: 0, z: 0});
for (const key of axisKeys) assert.equal(elements[key + 'Value'].textContent, '0.0 mm');

// The same production handler must forward the adapter's accepted pose to an
// active EVA overlay before rendering. Keep the null-controller checks above
// for community machines that have no EVA registration.
const overlayTrace = [], overlayUpdates = [], nativeSetAxes = sliderContext.current.adapter.setAxes;
sliderContext.current.adapter.setAxes = next => {
  overlayTrace.push('adapter'); return nativeSetAxes(next);
};
sliderContext.evaOptions = {update(axes) {
  overlayTrace.push('overlay'); assert.equal(axes, sliderState.axes);
  overlayUpdates.push({...axes});
}};
sliderContext.render = () => {
  overlayTrace.push('render'); assert.deepEqual(JSON.parse(dataset.pose), sliderState.axes);
};
for (const [key, serialized, expected] of [
  ['x', String(nativeRanges.x[1]), nativeRanges.x[1]],
  ['y', '-64.7896145424989', nativeRanges.y[0]],
  ['z', '120', 120], ['y', String(nativeRanges.y[1]), nativeRanges.y[1]], ['z', '60', 60],
]) {
  overlayTrace.length = 0; const before = overlayUpdates.length;
  elements[key].value = serialized; elements[key].oninput();
  assert.deepEqual(overlayTrace, ['adapter', 'overlay', 'render']);
  assert.equal(overlayUpdates.length, before + 1); assert.equal(overlayUpdates.at(-1)[key], expected);
  assert.deepEqual(overlayUpdates.at(-1), sliderState.axes);
  assert.equal(elements[key + 'Value'].textContent, expected.toFixed(1) + ' mm');
}
overlayTrace.length = 0; elements.resetPose.onclick();
assert.deepEqual(overlayTrace, ['adapter', 'overlay', 'render']);
assert.deepEqual(overlayUpdates.at(-1), {x: 0, y: 0, z: 0});

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--candidate'), 'Usage: node scripts/test_247zero.mjs [--candidate assembly-directory]');
if (args.length) {
  const directory = path.resolve(args[1]), load = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const manifest = load('assembly_manifest.json'), profile = load('machine_profile.json'); review(manifest, profile, true);
  console.log(JSON.stringify({passed: true, candidate_metadata: true, parts: manifest.parts.length, declared_model_sha256: profile.motion_registration.model_sha256,
    scope: 'JSON source companions, materials and strict embedded registration only; model bytes, native-solid clearance and browser review are separate.'}));
}
console.log(JSON.stringify({passed: true, machine: id, source_commit: commit, skirt_commit: skirtCommit, languages: supportedLanguages.length,
  fixture_parts: fixtureParts.length, counterexamples: registrationCounterexamples.length + selectionCounterexamples.length + 1, slider_boundary_clamp: true, eva_controller_axis_wiring: true, scope: 'Source/UI registration and compact motion fixtures; no actual mesh or full physical fit qualification.'}));
