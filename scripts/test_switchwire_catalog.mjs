import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {machineChoices, machineFamilies, machineVendors, machineOptions, resolveMachine, machinePage} from '../site/viewer/machines.js';
import {galleryMachineURL, filterMachines, validateGallery} from '../site/viewer/machine-gallery.mjs';
import {supportedLanguages} from '../site/viewer/languages.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
import {definitions} from '../site/viewer/locales/catalog.mjs';
import {sourceRevision} from './build_locales.mjs';
import {applySwitchwireDisplayDefault} from '../site/viewer/switchwire-display-default.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ID = 'voron_switchwire_250';
const revision = '92cc013ca2af94e6c09950dbe05c0973ee49aa00';
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--source-only')
  || (args.length === 2 && args[0] === '--site'),
  'Usage: node scripts/test_switchwire_catalog.mjs [--source-only | --site assembled-site]');
const row = machineChoices.find(m => m.id === ID);
assert(row, 'Switchwire must have a concrete machine registration');
assert.equal(machineChoices.filter(m => m.id === ID).length, 1);
assert.notEqual(row.available, false, 'Do not substitute an unavailable placeholder for the original assembly');
assert.equal(row.family, 'switchwire'); assert.equal(row.vendor, 'voron');
assert.equal(row.size, 250); assert.equal(machinePage(ID), './community.html');
assert.equal(machineFamilies.switchwire, 'VORON Switchwire'); assert(machineVendors.voron);
assert.deepEqual(machineOptions(row, 'id'), [ID]);
assert.equal(resolveMachine({...machineChoices[0], family: 'switchwire'}, 'family').id, ID);
assert.equal(row.source.repository, 'https://github.com/VoronDesign/Voron-Switchwire');
assert.equal(row.source.revision, revision); assert.equal(row.source.license, 'GPL-3.0');
assert.equal(row.source.version, 'Switchwire Assembly v1');
assert.equal(row.source.cad_path, 'CAD/Switchwire_Assembly_v1_STEP.zip');
assert.equal(row.source.cad_archive_sha256, '488329f43b3df1881cef0c433430f20b14709f36c973dc805e62412aa271207d');
assert(!/Afterburner|250\s*[×x]\s*250/u.test(row.label), 'Do not infer old toolhead or cubic build volume from the v1 filename or ID');

const community = await fs.readFile(path.join(root, 'site/viewer/community.js'), 'utf8');
const descriptionsText = community.match(/const descriptions=(\{[\s\S]*?^\});/mu)?.[1];
assert(descriptionsText, 'Community descriptions must remain inspectable');
const descriptions = vm.runInNewContext('(' + descriptionsText + ')');
const noticeLiteral = community.match(/sourceNotices\.voron_switchwire_250=('(?:[^'\\]|\\.)*');/u)?.[1];
assert(descriptions[ID] && noticeLiteral, 'Switchwire must pass the community description guard');
const notice = vm.runInNewContext(noticeLiteral);
assert.match(descriptions[ID], /Stealthburner, CW2 and Revo Voron/u);
assert(notice.includes(revision) && notice.includes('GPL-3.0'));
assert.match(community, /\['COMMUNITY_MACHINES_ASSETS\.json','EVA_INSTALLATIONS\.json'\]/u);
assert(!/EXTRA_MACHINE_ASSETS/u.test(community), 'The community loader uses the object-keyed community index');
// A complete display mask is ineffective if either production entrypoint
// stops composing it. These assertions run in source-only and actual-site jobs.
const displayLoader = await fs.readFile(path.join(root, 'site/viewer/community-loader.mjs'), 'utf8');
const displayAuditor = await fs.readFile(path.join(root, 'scripts/audit_community_installations.mjs'), 'utf8');
function assertDisplayComposition(loader, auditor) {
  const call = '({manifest,profile}=applySwitchwireDisplayDefault(manifest,profile,spec.files))';
  for (const [text, next] of [[loader, 'progress.assembling()'], [auditor, 'const adapter=createCommunityAdapter(']]) {
    assert.match(text, /import \{applySwitchwireDisplayDefault\} from ['"][^'"]*switchwire-display-default\.mjs(?:\?[^'"]*)?['"]/u,
      'Switchwire display default must be imported by both production entrypoints');
    const start=text.indexOf(call), after=text.indexOf(next);
    assert.equal(text.split(call).length-1, 1, 'Switchwire display default must be composed exactly once');
    assert(start>text.indexOf('applyEvaInstallation(manifest,profile,spec.eva_installation)')&&after>start,
      'Switchwire display default must follow source registration and precede assembly/adapter creation');
  }
}
assertDisplayComposition(displayLoader, displayAuditor);
assert.throws(() => assertDisplayComposition(displayLoader.replace('({manifest,profile}=applySwitchwireDisplayDefault(manifest,profile,spec.files))', ''), displayAuditor),
  /Switchwire display default/u, 'Missing GUI/layout overlay must fail source-only checks');
assert.throws(() => assertDisplayComposition(displayLoader, displayAuditor.replace('({manifest,profile}=applySwitchwireDisplayDefault(manifest,profile,spec.files))', '')),
  /Switchwire display default/u, 'Missing actual-installation audit overlay must fail source-only checks');
const indexIDs = ['machine.switchwire.label', 'machine.switchwire.description', 'machine.switchwire.source_notice', 'machine.switchwire.chain_notice'];
const source = JSON.parse(await fs.readFile(path.join(root, 'localization/source.json'), 'utf8'));
const dictionaries = new Map();
for (const language of ['es', 'ko', 'ru']) {
  const locale = JSON.parse(await fs.readFile(path.join(root, `localization/${language}.json`), 'utf8'));
  const compiled = (await import(`../site/viewer/locales/${language}.mjs`)).default;
  dictionaries.set(language, compiled);
  for (const id of indexIDs) {
    assert.equal(locale.messages[id]?.source_revision, sourceRevision(source.entries[id]));
    assert.deepEqual(compiled[id], [locale.messages[id].source_revision, locale.messages[id].text]);
  }
}
const translator = createTranslator(definitions, {dictionaries});
for (const [id, text] of indexIDs.map((id, i) => [id, [row.label, descriptions[ID], notice, source.entries['machine.switchwire.chain_notice'].en][i]])) {
  assert.equal(definitions[id].revision, sourceRevision(source.entries[id]));
  assert.equal(source.entries[id].en, text);
  for (const language of supportedLanguages) {
    const translated = translator.translate(text, language);
    assert.equal(translated, translator.formatMessage(id, {}, language));
    if (id === 'machine.switchwire.chain_notice' && language !== 'en') assert.notEqual(translated, text, 'The derivative chain notice must not fall back to English');
    assert(!/[\uFF82\uFF77\uFFFD]|\p{Extended_Pictographic}/u.test(translated));
    const url = new URL(galleryMachineURL(row, 'https://example.test/viewer/machines.html', language));
    assert.equal(url.pathname, '/viewer/community.html');
    assert.equal(url.searchParams.get('machine'), ID); assert.equal(url.searchParams.get('lang'), language);
  }
}
const searchable = {...row, familyLabel: machineFamilies.switchwire, vendorLabel: machineVendors.voron};
assert.deepEqual(filterMachines([searchable], {query: 'Switchwire Voron', family: 'switchwire'}), [searchable]);
const chainNotice = source.entries['machine.switchwire.chain_notice'].en;
assert.equal(chainNotice, 'The original CAD has 18 Z chain links. The movement model uses 24 copies of the same native link geometry to reach the full Z travel. All three chains are assembled at their measured hinge axes.');
assert.match(community, /current\.profile\.motion_registration\?\.notices/u, 'The chain notice must reach the source notice display');
assert.match(community, /await loadLanguage\(document\.documentElement\.lang\)/u, 'The controller must load its current locale before displaying the notice');
assert.match(community, /await loadLanguage\(language\)/u, 'Language changes must load the revised dictionary');
const liveTranslator = await import('../site/viewer/i18n.mjs');
for (const language of supportedLanguages) {
  await liveTranslator.loadLanguage(language);
  assert.equal(liveTranslator.translate(chainNotice, language), translator.formatMessage('machine.switchwire.chain_notice', {}, language));
}
// Inspect only the requested dependency chain; preserve other owners' changes.
const consumers = [
  ['community-adapter.mjs', 'native-motion-flex.mjs'],
  ['community-loader.mjs', 'community-adapter.mjs'],
  ['community-loader.mjs', 'switchwire-display-default.mjs'],
  ['community.js', 'community-loader.mjs'],
  ['community.html', 'community.js'],
];
for (const [consumer, dependency] of consumers) {
  const text = await fs.readFile(path.join(root, 'site/viewer', consumer), 'utf8');
  const bytes = (await fs.readFile(path.join(root, 'site/viewer', dependency), 'utf8')).replace(/\r\n/gu, '\n');
  const expected = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  assert(text.includes(`./${dependency}?v=${expected}`), `Stale ${consumer} import of ${dependency}`);
}

function validateIndex(index) {
  assert(index?.machines && !Array.isArray(index.machines), 'COMMUNITY_MACHINES_ASSETS.json must be keyed by machine ID');
  const spec = index.machines[ID];
  assert(spec, 'Missing actual Switchwire entry in COMMUNITY_MACHINES_ASSETS.json; source registration is not asset delivery');
  assert.equal(spec.machine_id, ID); assert(Number.isSafeInteger(spec.parts) && spec.parts > 0);
  for (const name of ['model.glb', 'assembly_manifest.json', 'machine_profile.json']) {
    const file = spec.files?.[name]; assert(file, 'Missing Switchwire file: ' + name);
    assert(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 180_000_000);
    assert(/^[a-f0-9]{64}$/u.test(file.sha256));
    assert(typeof file.path === 'string' && !file.path.includes('..') && !/[\\:]/u.test(file.path) && !file.path.startsWith('/'));
    if (file.encoding === 'gzip') {
      assert(Number.isSafeInteger(file.decoded_bytes) && file.decoded_bytes > 0);
      assert(/^[a-f0-9]{64}$/u.test(file.decoded_sha256));
    } else assert(file.encoding == null, 'Unsupported community encoding');
  }
  return spec;
}
assert.throws(() => validateIndex({machines: {}}), /Missing actual Switchwire/u);
assert.throws(() => validateIndex({machines: []}), /keyed by machine ID/u);
if (args[0] === '--source-only') {
  console.log(JSON.stringify({machine: ID, source_registration_passed: true, languages: supportedLanguages,
    actual_asset_delivery_tested: false, motion_or_native_fit_tested: false, build_volume_confirmation_pending: true}));
} else {
  const site = args[0] === '--site' ? path.resolve(args[1]) : path.join(root, 'site');
  const index = JSON.parse(await fs.readFile(path.join(site, 'COMMUNITY_MACHINES_ASSETS.json'), 'utf8'));
  const spec = validateIndex(index), local = spec.local_directory ?? index.local_directory;
  assert(typeof local === 'string' && local && !local.includes('..') && !/[\\:]/u.test(local) && !local.startsWith('/'), 'Missing safe local asset directory');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  async function checked(name) {
    const file = spec.files[name], bytes = await fs.readFile(path.join(site, local, file.path));
    assert.equal(bytes.length, file.bytes, name + ' actual bytes'); assert.equal(hash(bytes), file.sha256, name + ' actual hash');
    const decoded = file.encoding === 'gzip' ? gunzipSync(bytes) : bytes;
    if (file.encoding === 'gzip') {
      assert.equal(decoded.length, file.decoded_bytes); assert.equal(hash(decoded), file.decoded_sha256);
    }
    return decoded;
  }
  const [model, manifestBytes, profileBytes] = await Promise.all(['model.glb', 'assembly_manifest.json', 'machine_profile.json'].map(checked));
  const manifest = JSON.parse(manifestBytes), profile = JSON.parse(profileBytes);
  assert.equal(manifest.machine_id, ID); assert.equal(profile.machine_id, ID);
  // The immutable asset still contains both alternatives. Audit the effective
  // production default separately from the raw profile and thumbnail receipt.
  const rawProfileJSON=JSON.stringify(profile);
  const selected=applySwitchwireDisplayDefault(manifest,profile,spec.files);
  assert.equal(JSON.stringify(profile),rawProfileJSON,'Do not rewrite source metadata');
  assert.equal(selected.manifest,manifest);
  const hidden=new Set(selected.profile.configurations.stock.hidden_keys);
  const branch=name=>manifest.parts.filter(p=>p.path[1]==='Front Grill:1'&&p.path[2]===name);
  assert.equal(hidden.size,10);
  assert.equal(branch('2004 LCD Case:1').length,9);
  assert(branch('2004 LCD Case:1').every(p=>hidden.has(p.key)));
  assert.equal(branch('Mini12864 Case Assembly v2 v1:1').length,11);
  assert(branch('Mini12864 Case Assembly v2 v1:1').every(p=>!hidden.has(p.key)));
  assert(hidden.has('sw_087266894303ada5'));
  assert.equal(manifest.parts.filter(p=>!hidden.has(p.key)&&p.group!=='reference').length,703);
  assert.equal(manifest.parts.filter(p=>!hidden.has(p.key)).length,708);
  assert(profile.motion_registration?.notices?.includes(chainNotice), 'The actual profile must disclose its 24-link preview derivative');
  if (profile.configurations?.stock?.motion_notices) assert(profile.configurations.stock.motion_notices.includes(chainNotice), 'The stock description override must retain the chain notice');
  assert.equal(manifest.native_leaf_count, spec.parts); assert.equal(manifest.parts.length, spec.parts);
  assert.equal(new Set(manifest.parts.map(p => p.key)).size, spec.parts);
  assert.equal(model.readUInt32LE(0), 0x46546c67); assert.equal(model.readUInt32LE(4), 2); assert.equal(model.readUInt32LE(8), model.length);
  const gltf = JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString('utf8'));
  const componentDocuments = [gltf];
  for (const name of spec.additional_models || []) {
    const bytes = await checked(name);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    componentDocuments.push(JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')));
  }
  const keys = componentDocuments.flatMap(doc => doc.nodes.filter(n => n.extras?.part_key).map(n => n.extras.part_key));
  assert.equal(keys.length, spec.parts); assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys.sort(), manifest.parts.map(p => p.key).sort(), 'Exact manifest/source occurrence identities must reach the model');
  const sourcePin = manifest.source?.revision ?? manifest.source_revision ?? spec.source?.revision;
  assert.equal(sourcePin, revision, 'Actual assembly must retain the pinned official source revision');
  const gallery = validateGallery(JSON.parse(await fs.readFile(path.join(site, 'assets/machines/index.json'), 'utf8')));
  const thumbnailRow = gallery.find(m => m.id === ID); assert(thumbnailRow, 'Missing actual Switchwire thumbnail');
  const thumbnail = await fs.readFile(path.join(site, 'assets/machines', thumbnailRow.thumbnail));
  assert.equal(thumbnail.length, thumbnailRow.thumbnail_bytes); assert.equal(hash(thumbnail), thumbnailRow.thumbnail_sha256);
  assert.equal(thumbnail.toString('ascii', 0, 4), 'RIFF'); assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP');
  assert.equal(thumbnail.toString('ascii', 12, 16), 'VP8 ');
  assert.equal(thumbnail.readUInt16LE(26) & 0x3fff, 320); assert.equal(thumbnail.readUInt16LE(28) & 0x3fff, 240);
  const pin = thumbnailRow.model_pins.find(p => p.model_sha256 === hash(model)); assert(pin, 'Thumbnail must bind the displayed model');
  assert.equal(pin.stored_model_sha256, spec.files['model.glb'].sha256);
  assert.equal(pin.companion_sha256['assembly_manifest.json'], hash(manifestBytes));
  assert.equal(pin.companion_sha256['machine_profile.json'], hash(profileBytes));
  const projectionRef = thumbnailRow.thumbnail_projection; assert(projectionRef, 'Missing CPU projection scope');
  assert(!projectionRef.path.includes('..') && !/[\\:]/u.test(projectionRef.path));
  const projectionBytes = await fs.readFile(path.join(site, 'assets/machines', projectionRef.path));
  assert.equal(hash(projectionBytes), projectionRef.sha256);
  const projection = JSON.parse(projectionBytes);
  assert.equal(projection.model_sha256, hash(model)); assert.equal(projection.thumbnail.sha256, hash(thumbnail));
  assert.equal(projection.all_part_identities, spec.parts);
  assert.equal(projection.default_visible_identities, projection.rendered_mesh_identities);
  assert.equal(projection.browser_review, false); assert.equal(projection.browser_screenshot, false);
  assert.equal(projection.source_geometry_or_material_assets_modified, false);
  console.log(JSON.stringify({machine: ID, source_registration_passed: true, actual_asset_delivery_passed: true,
    model_sha256: hash(model), manifest_sha256: hash(manifestBytes), profile_sha256: hash(profileBytes),
    thumbnail_sha256: hash(thumbnail), thumbnail_bytes: thumbnail.length, source_occurrences: spec.parts,
    production_display_default_verified: true, display_default_visible: 703, display_reference_visible: 708,
    CPU_projection_verified: true, browser_review: false, motion_or_native_fit_tested: false}));
}
