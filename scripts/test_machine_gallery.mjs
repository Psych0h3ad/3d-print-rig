import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {machineChoices, machineFamilies, machineVendors} from '../site/viewer/machines.js';
import {chooseLanguage, languageURL, supportedLanguages} from '../site/viewer/languages.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
import {sourceRevision, validateTranslations} from './build_locales.mjs';
import {gallerySchema, validateGallery, galleryMachineURL, galleryThumbnailURL, preferredPrinterURL,
  filterMachines, createMachineCard, mountGallery} from '../site/viewer/machine-gallery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--source-only')
  || (args.length === 2 && ['--site', '--support-index'].includes(args[0])),
  'Usage: node scripts/test_machine_gallery.mjs [--source-only | --site assembled-site | --support-index actual-index.json]');
const sourceOnly = args[0] === '--source-only', site = args[0] === '--site' ? path.resolve(args[1]) : path.join(root, 'site');
const read = async relative => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalHash = map => digest(JSON.stringify(Object.fromEntries(Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
const [coverage, source, es, ko, ru, html, css, moduleSource] = await Promise.all([
  read('docs/MACHINE_REVIEW_COVERAGE.json'), read('localization/source.json'), read('localization/es.json'), read('localization/ko.json'), read('localization/ru.json'),
  fs.readFile(path.join(root, 'site/viewer/machines.html'), 'utf8'), fs.readFile(path.join(root, 'site/viewer/machine-gallery.css'), 'utf8'),
  fs.readFile(path.join(root, 'site/viewer/machine-gallery.mjs'), 'utf8'),
]);
const records = new Map(coverage.machines.map(row => [row.id, row]));
const available = machineChoices.filter(row => row.available !== false), unavailable = machineChoices.filter(row => row.available === false);
assert.equal(records.size, 65, 'Release 113 must include the exact 65 current machine review records');
assert.deepEqual(available.map(row => row.id).sort(), [...records.keys()].sort(), 'Source registrations must equal current actual model coverage, including V0 and community printers');
assert.equal(unavailable.length, 6, 'Six CAD-missing registrations stay outside the collection');

const dictionaries = {es, ko, ru}, definitions = Object.fromEntries(Object.entries(source.entries).map(([id, entry]) => [id, {...entry, revision: sourceRevision(entry)}]));
const translator = createTranslator(definitions, {dictionaries: new Map(Object.entries(dictionaries).map(([language, locale]) => [language,
  Object.fromEntries(Object.entries(locale.messages).map(([id, record]) => [id, [record.source_revision, record.text]]))]))});
const galleryIDs = Object.keys(source.entries).filter(id => id.startsWith('gallery.') || id === 'ui.machines');
assert.equal(galleryIDs.length, 24);
assert.deepEqual(validateTranslations({schema_version: 1, source_language: 'en', entries: Object.fromEntries(galleryIDs.map(id => [id, source.entries[id]]))},
  Object.fromEntries(Object.entries(dictionaries).map(([language, locale]) => [language, {...locale, messages: Object.fromEntries(galleryIDs.map(id => [id, locale.messages[id]]))}]))), [], 'All gallery translations have current revisions and preserved arguments');
for (const id of [...galleryIDs, 'ui.printer', 'ui.toolhead', 'ui.gantry', 'ui.just_for_fun', 'ui.support_index', 'ui.dark_mode', 'text.1085']) {
  for (const language of supportedLanguages) {
    const text = translator.formatMessage(id, {0: 'VORON Trident 350', 1: '65'}, language);
    assert(text && text !== id && !/\{\d+\}/u.test(text), id + ' in ' + language);
    if (language !== 'ja') assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(text), 'No untranslated Japanese: ' + id + ' in ' + language);
  }
}
assert.equal(chooseLanguage({}), 'en'); assert.equal(chooseLanguage({query: 'ko-KR', stored: 'ru'}), 'ko');
assert.equal(chooseLanguage({query: 'invalid', stored: 'es-MX'}), 'es');
assert.match(html, /<html lang="en">/u); assert.match(html, /data-machines-gallery/u);
assert.match(html, /href="\.\/machines\.html" aria-current="page"[^>]*data-i18n-id="ui\.machines"/u);
const nav = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/u)[1];
assert.deepEqual([...nav.matchAll(/data-i18n-id="([^"]+)"/gu)].map(match => match[1]), ['ui.machines', 'ui.printer', 'ui.toolhead', 'ui.gantry', 'ui.just_for_fun', 'ui.support_index']);
for (const contract of [/id="galleryStatus" role="status" aria-live="polite" aria-atomic="true"/u,
  /id="galleryError"[^>]*role="alert" hidden/u, /id="galleryEmpty"[^>]*hidden/u,
  /id="machineGrid"[^>]*aria-busy="true"/u, /<label[^>]*for="machineSearch"/u, /<label[^>]*for="machineFamily"/u]) assert.match(html, contract);
assert.match(css, /:root\[data-theme=dark\]/u); assert.match(css, /prefers-reduced-motion/u); assert.match(css, /:focus-visible/u);
assert.match(css, /@media\(max-width:480px\)/u); assert.match(css, /grid-template-columns:minmax\(0,1fr\)/u);
assert(!/\p{Extended_Pictographic}/u.test(html + css + moduleSource), 'No emoji UI icons');
assert(!/rel=["'](?:preload|modulepreload)["']/u.test(html), 'The gallery never preloads CAD or thumbnails');
assert(!/innerHTML|insertAdjacentHTML/u.test(moduleSource), 'Catalog strings use text nodes');

// Audit the actual import graph too: the small shared registry must not pull a
// model loader, controller, Three.js, or a workspace bootstrap into this page.
const visited = new Set();
async function imports(file) {
  if (visited.has(file)) return; visited.add(file);
  assert(!/(?:workspace-ui|workspace-router|three|model-loader|configuration-model|head-assembly|bootstrap)\.(?:m?js)$/u.test(file), 'No 3D preload: ' + file);
  const text = await fs.readFile(file, 'utf8');
  for (const match of text.matchAll(/(?:^(?:import|export)[^\n;]*?\bfrom\s*|^import\s*)(['"])([^'"]+)\1/gmu)) {
    if (!match[2].startsWith('.')) { assert(!/three|https?:/u.test(match[2]), file + ': ' + match[2]); continue; }
    const target = path.resolve(path.dirname(file), match[2].split('?')[0]);
    if (/\.(?:mjs|js)$/u.test(target)) await imports(target);
  }
}
await imports(path.join(root, 'site/viewer/machine-gallery.mjs'));
for (const loaded of ['i18n.mjs', 'display-preferences.mjs', 'locales/es.mjs', 'locales/ko.mjs', 'locales/ru.mjs'])
  await imports(path.join(root, 'site/viewer', loaded));

// Fixture records isolate source behavior. They are never written as assets,
// and a source-only pass explicitly does not qualify actual thumbnail delivery.
const fixture = {schema: gallerySchema, machines: available.map(row => {
  const reviewed = records.get(row.id), companions = reviewed.companion_sha256 || {};
  return {id: row.id, label: row.label, family: row.family, size: row.size, page: row.page, thumbnail: row.id + '.webp',
    width: 320, height: 240, thumbnail_bytes: 1, thumbnail_sha256: 'a'.repeat(64),
    model_pins: [{model_sha256: reviewed.model_sha256, stored_model_sha256: reviewed.stored_model_sha256,
      companion_sha256: companions, companions_sha256: canonicalHash(companions)}]};
})};
const rows = validateGallery(fixture), current = 'https://example.test/3d-print-rig/viewer/machines.html?lang=en&configuration=unrelated#gallery';
for (const row of rows) {
  assert.equal(row.familyLabel, machineFamilies[row.family]); assert.equal(row.vendorLabel, machineVendors[row.vendor]);
  for (const language of supportedLanguages) {
    const url = new URL(galleryMachineURL(row, current, language));
    assert.equal(url.pathname, new URL(row.page, current).pathname); assert.equal(url.searchParams.get('machine'), row.id);
    assert.equal(url.searchParams.get('lang'), language); assert.deepEqual([...url.searchParams.keys()].sort(), ['lang', 'machine']); assert.equal(url.hash, '');
    const imageURL = new URL(galleryThumbnailURL(row, current));
    assert.equal(imageURL.pathname, '/3d-print-rig/assets/machines/' + row.id + '.webp');
    assert.equal(imageURL.searchParams.get('v'), row.thumbnail_sha256.slice(0, 20), 'Image URL pins the current thumbnail revision');
    assert.deepEqual([...imageURL.searchParams.keys()], ['v']);
  }
  assert(filterMachines(rows, {query: row.id}).some(result => result.id === row.id));
  assert(filterMachines(rows, {query: String(row.size)}).some(result => result.id === row.id));
  assert(filterMachines(rows, {query: row.vendorLabel}).some(result => result.id === row.id));
}
assert.equal(filterMachines(rows, {query: 'not-a-registered-printer'}).length, 0);
for (const family of new Set(rows.map(row => row.family))) assert.deepEqual(filterMachines(rows, {family}), rows.filter(row => row.family === family));
const trident = rows.find(row => row.id === 'siboor_trident_350');
assert(filterMachines(rows, {query: '  SIBOOR   350 ', family: 'trident'}).includes(trident));
assert.equal(filterMachines(rows, {query: 'SIBOOR', family: 'annex_k1'}).length, 0);
assert.equal(filterMachines([{...trident, label: 'Máquina de prueba'}], {query: 'maquina'}).length, 1);
for (const language of supportedLanguages) {
  const remembered = new URL(trident.page, current); remembered.search = '?machine=' + trident.id + '&configuration=actual_saved_selection&rgb=1'; remembered.hash = '#assembly';
  const link = new URL(preferredPrinterURL(current, remembered.href, language));
  assert.equal(link.searchParams.get('lang'), language); assert.equal(link.searchParams.get('configuration'), 'actual_saved_selection');
  assert.equal(link.searchParams.get('rgb'), '1'); assert.equal(link.hash, '#assembly');
  for (const invalid of ['javascript:alert(1)', 'https://external.test/viewer/?machine=' + trident.id,
    './toolheads.html?machine=' + trident.id, './trident.html?machine=unknown', './?machine=' + unavailable[0].id,
    'https://user:pass@example.test/3d-print-rig/viewer/' + trident.page.slice(2) + '?machine=' + trident.id]) {
    const fallback = new URL(preferredPrinterURL(current, invalid, language));
    assert.equal(fallback.pathname, '/3d-print-rig/viewer/'); assert.equal(fallback.searchParams.get('lang'), language); assert(!fallback.searchParams.has('machine'));
  }
}
for (const mutate of [index => {index.schema = 'old'}, index => {index.machines.pop()}, index => {index.machines[1] = index.machines[0]},
  index => {index.machines[0].id = unavailable[0].id}, index => {index.machines[0].family = 'wrong'}, index => {index.machines[0].size += 1},
  index => {index.machines[0].page = 'javascript:alert(1)'}, index => {index.machines[0].thumbnail = '../other.webp'},
  index => {index.machines[0].thumbnail_bytes = 0}, index => {index.machines[0].thumbnail_sha256 = 'bad'},
  index => {index.machines[0].width = 1}, index => {index.machines[0].model_pins = []},
  index => {index.machines[0].model_pins[0].model_sha256 = 'bad'}]) {
  const index = structuredClone(fixture); mutate(index); assert.throws(() => validateGallery(index));
}
for (const value of ['https://external.test/model.webp', '//external.test/model.webp', 'data:image/png;base64,abc', '../evil.webp', 'x.webp?url=evil'])
  assert.throws(() => galleryThumbnailURL({...trident, thumbnail: value}, current));
assert.throws(() => galleryMachineURL({...trident, page: './trident.html?configuration=bogus'}, current));

class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.dataset = {}; this.value = ''; this._text = ''; this.hidden = false; }
  append(...children) { for (const child of children) this.children.push(...(child.tagName === 'FRAGMENT' ? child.children : [child])); }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  focus() { this.focused = true; }
}
const descendants = node => [node, ...node.children.flatMap(descendants)];
function environment(search = '') {
  const window = new EventTarget(); window.location = {href: current.split('?')[0] + search};
  window.history = {replaceState(_state, _title, url) { window.location.href = new URL(url, window.location.href).href; }};
  window.sessionStorage = {getItem() { return null; }};
  const ids = Object.fromEntries(['machineSearch', 'machineFamily', 'galleryReset', 'galleryStatus', 'galleryError', 'galleryEmpty', 'machineGrid',
    'galleryRetry', 'galleryEmptyReset', 'galleryFilters', 'workspacePrinterLink'].map(id => [id, new Element(id === 'machineGrid' ? 'ul' : 'div')]));
  const header = new Element('div'), nav = new Element('nav');
  const links = ['./machines.html', './toolheads.html', './gantries.html', '../fun/', '../support/', './art/credits.html'].map(href => {const link = new Element('a'); link.href = new URL(href, window.location.href).href; return link;});
  const document = {getElementById: id => ids[id], createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
    querySelector: selector => selector === '.header-actions' ? header : nav, querySelectorAll: () => links, title: ''};
  let language = chooseLanguage({query: new URL(window.location.href).searchParams.get('lang')});
  const lang = {get language() { return language; }, ready: Promise.resolve(),
    setLanguage(value) {language = value; window.location.href = languageURL(window.location.href, value); window.dispatchEvent(new Event('rig-language-change')); }};
  const theme = new Element('button');
  const services = [{setupLanguage: () => lang, translate: translator.translate, formatMessage: translator.formatMessage},
    {setupHeaderThemeToggle: () => theme, applyDisplay: () => {}, displayKey: '3d-print-rig-display-v1'}];
  return {window, document, ids, links, lang, theme, services};
}

for (const language of supportedLanguages) {
  const env = environment('?lang=' + language + '&q=SIBOOR&family=trident');
  let requests = 0, release;
  const response = new Promise(resolve => { release = resolve; });
  const mounted = mountGallery({...env, fetcher: async url => {requests++; assert.equal(url, '../assets/machines/index.json'); return response; }});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.ids.machineGrid.getAttribute('aria-busy'), 'true'); assert.equal(env.ids.machineSearch.disabled, true);
  assert.equal(env.ids.galleryStatus.textContent, translator.formatMessage('gallery.loading', {}, language));
  release({ok: true, json: async () => structuredClone(fixture)}); await mounted;
  assert.equal(requests, 1, 'Only the static index is fetched'); assert.equal(env.ids.machineGrid.getAttribute('aria-busy'), 'false');
  assert.equal(env.ids.machineSearch.disabled, false); assert.equal(env.ids.galleryEmpty.hidden, true);
  assert(env.ids.machineGrid.children.length > 0 && env.ids.machineGrid.children.length < 65);
  for (const card of env.ids.machineGrid.children) {
    const image = descendants(card).find(node => node.tagName === 'IMG');
    assert.equal(image.loading, 'lazy'); assert.equal(image.decoding, 'async'); assert.equal(image.width, 320); assert.equal(image.height, 240);
    assert(image.alt.includes('350') || image.alt.includes('300')); assert.equal(new URL(card.children[0].href).searchParams.get('lang'), language);
  }
  for (const link of env.links) assert.equal(new URL(link.href).searchParams.get('lang'), language);
  const image = descendants(env.ids.machineGrid.children[0]).find(node => node.tagName === 'IMG');
  image.dispatchEvent(new Event('error'));
  assert(descendants(env.ids.machineGrid.children[0]).some(node => node.textContent === translator.formatMessage('gallery.preview_error', {}, language)));
  assert(!descendants(env.ids.machineGrid.children[0]).some(node => node.tagName === 'IMG'), 'No substitute image after a preview error');
  env.ids.machineSearch.value = 'no-such-model'; env.ids.machineSearch.dispatchEvent(new Event('input'));
  assert.equal(env.ids.machineGrid.children.length, 0); assert.equal(env.ids.galleryEmpty.hidden, false);
  assert.equal(new URL(env.window.location.href).searchParams.get('q'), 'no-such-model');
  env.ids.galleryEmptyReset.dispatchEvent(new Event('click')); assert.equal(env.ids.machineGrid.children.length, 65);
  assert.equal(env.ids.machineSearch.focused, true); assert.equal(env.ids.galleryReset.disabled, true);
  assert(!new URL(env.window.location.href).searchParams.has('q')); assert(!new URL(env.window.location.href).searchParams.has('family'));
  for (const next of [...supportedLanguages, ...supportedLanguages.toReversed(), language]) {
    env.lang.setLanguage(next);
    assert.equal(env.ids.machineGrid.children.length, 65);
    for (const card of env.ids.machineGrid.children) assert.equal(new URL(card.children[0].href).searchParams.get('lang'), next);
    assert.equal(env.theme.getAttribute('aria-label'), translator.formatMessage('ui.dark_mode', {}, next));
  }
}
const failed = environment(); let failures = 0;
const originalWarn = console.warn; console.warn = () => {};
try {
  await mountGallery({...failed, fetcher: async () => {failures++; return failures === 1 ? {ok: false} : {ok: true, json: async () => fixture}; }});
  assert.equal(failed.ids.galleryError.hidden, false); assert.equal(failed.ids.machineGrid.getAttribute('aria-busy'), 'false');
  assert.equal(failed.ids.galleryRetry.disabled, false); assert.equal(failed.ids.machineGrid.children.length, 0);
  failed.ids.galleryRetry.dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures, 2); assert.equal(failed.ids.galleryError.hidden, true); assert.equal(failed.ids.machineGrid.children.length, 65);
} finally { console.warn = originalWarn; }
const hostile = createMachineCard({...trident, label: '<img src=x onerror=alert(1)>'}, {document: failed.document, current, language: 'en', translate: text => text, message: id => id});
assert.equal(descendants(hostile).filter(node => node.tagName === 'IMG').length, 1, 'Hostile catalog text cannot create markup');
assert(descendants(hostile).some(node => node.tagName === 'H3' && node.textContent === '<img src=x onerror=alert(1)>'));
console.log('Gallery source checks passed: exact65 registrations, 5 languages, all card routes, filters, lazy images, safe URLs, loading/error/retry/empty states and A-to-B-to-A language changes.');
if (sourceOnly) { console.log('SOURCE ONLY: actual thumbnail/index/support delivery is not audited by this mode.'); process.exit(0); }

// Current actual image/model evidence is mandatory for the asset phase. The
// repository intentionally does not store generated support detail catalogs.
const indexPath = path.join(site, 'assets/machines/index.json');
let index;
try { index = JSON.parse(await fs.readFile(indexPath, 'utf8')); }
catch (error) { throw Error('Actual machine gallery index is required at ' + indexPath + '. Parent thumbnail generation remains pending; this is not an asset pass.', {cause: error}); }
const actual = validateGallery(index);
assert.deepEqual(actual.map(row => row.id).sort(), [...records.keys()].sort());
function webpSize(bytes) {
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'Complete WebP container');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert(start + length <= bytes.length, 'Complete WebP chunk');
    if (chunk === 'VP8X') {
      assert(length >= 10); assert.equal(bytes[start] & 2, 0, 'Thumbnails are static');
      return [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    }
    if (chunk === 'VP8 ') {
      assert(length >= 10); assert.equal(bytes.toString('hex', start + 3, start + 6), '9d012a');
      return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    }
    if (chunk === 'VP8L') {
      assert(length >= 5); assert.equal(bytes[start], 0x2f);
      const bits = bytes.readUInt32LE(start + 1); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + length + (length % 2);
  }
  throw Error('Missing WebP image dimensions');
}
let imageBytes = 0;
for (const row of actual) {
  assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(row.label), row.id + ' index uses cleaned English descriptions');
  const reviewed = records.get(row.id);
  for (const pin of row.model_pins) {
    assert.equal(pin.model_sha256, reviewed.model_sha256, row.id + ' current decoded model');
    assert.equal(pin.stored_model_sha256, reviewed.stored_model_sha256, row.id + ' current stored model');
    assert.deepEqual(pin.companion_sha256, reviewed.companion_sha256, row.id + ' current exact companions');
    assert.equal(pin.companions_sha256, canonicalHash(reviewed.companion_sha256), row.id + ' canonical companion hash');
  }
  const image = await fs.readFile(path.join(site, 'assets/machines', row.thumbnail));
  assert.equal(image.length, row.thumbnail_bytes, row.id + ' image byte count'); assert.equal(digest(image), row.thumbnail_sha256, row.id + ' actual WebP hash');
  assert.equal(image.toString('ascii', 0, 4), 'RIFF'); assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  assert.deepEqual(webpSize(image), [320, 240], row.id + ' actual image dimensions'); imageBytes += image.length;
  const registeredPage = path.resolve(site, 'viewer', row.page === './' ? 'index.html' : row.page);
  assert((await fs.stat(registeredPage)).isFile(), row.id + ' registered viewer page exists');
}
const translationBytes = Buffer.byteLength(JSON.stringify(Object.fromEntries(galleryIDs.map(id => [id, source.entries[id]])))
  + ['es', 'ko', 'ru'].map(language => JSON.stringify(Object.fromEntries(galleryIDs.map(id => [id, dictionaries[language].messages[id]])))).join(''));
const sourceBytes = Buffer.byteLength(html + css + moduleSource), totalBytes = sourceBytes + translationBytes + imageBytes;
assert(totalBytes < 1_300_000, 'Gallery source + new translations + actual65 thumbnails exceed 1.3 MB: ' + totalBytes);
console.log('Actual gallery asset checks passed: current65 coverage model/stored/companion hashes, exact image hashes and registered routes; gallery payload ' + totalBytes + ' bytes.');
if (['--site', '--support-index'].includes(args[0])) {
  const supportPath = args[0] === '--support-index' ? path.resolve(args[1]) : path.join(site, 'support/data/index.json');
  const support = JSON.parse(await fs.readFile(supportPath, 'utf8'));
  const targets = new Map(support.targets.map(row => [row.id, row]));
  for (const row of actual) {
    const target = targets.get(row.id); assert(target, row.id + ' must be registered in the actual support index');
    assert(['supported', 'stock', 'available'].includes(target.status), row.id + ': ' + target.status);
    assert.equal(target.page, row.page); assert.equal(target.family, row.family); assert.equal(target.size, row.size);
    assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(row.label), row.id + ' index uses cleaned English descriptions');
    const identity = target.label.split(/[\u3040-\u30ff\u3400-\u9fff]/u)[0].trim();
    assert(row.label.toLocaleLowerCase().startsWith(identity.toLocaleLowerCase()),
      row.id + ' source printer label identity remains present; legacy descriptors can be translated');
  }
  assert.deepEqual(support.targets.filter(target => ['supported', 'stock', 'available'].includes(target.status) && records.has(target.id)).map(target => target.id).sort(), [...records.keys()].sort());
  for (const row of unavailable) { assert.equal(targets.get(row.id)?.status, 'missing'); assert(!actual.some(machine => machine.id === row.id)); }
  console.log('Actual support-index audit passed: exact65 coverage IDs/pages/families/sizes, including V0/community; all6 missing-CAD registrations excluded.');
} else console.log('Support delivery remains a separate required audit: run --site against the assembled release before publication.');
