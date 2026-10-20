// Headless layout message contract. No browser, model fetch or generated-locale writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const argument = process.argv.indexOf('--site');
const site = argument >= 0 ? path.resolve(process.argv[argument + 1]) : fileURLToPath(new URL('../site/', import.meta.url));
const directory = path.join(site, 'layout');
const {messages, messageKeys, supportedLanguages, hasMessage, t, chooseLanguage, languageURL} =
  await import(pathToFileURL(path.join(directory, 'layout-i18n.mjs')).href);
assert.deepEqual(supportedLanguages, ['en', 'ja', 'es', 'ko', 'ru']);
assert.equal(new Set(messageKeys).size, messageKeys.length, 'Duplicate message IDs');
const placeholders = text => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map(m => m[1]).sort();
let rendered = 0;
for (const language of supportedLanguages) {
  assert.deepEqual(Object.keys(messages[language]).sort(), [...messageKeys].sort());
  for (const key of messageKeys) {
    const text = messages[language][key];
    assert.equal(typeof text, 'string'); assert(text.trim(), 'Empty text: ' + key);
    assert.deepEqual(placeholders(text), placeholders(messages.en[key]), key + ' / ' + language);
    const values = Object.fromEntries(placeholders(text).map(name => [name, name === 'name' ? '<literal name>' : '3']));
    assert.notEqual(t(key, values, language), key);
    assert(!/\p{Extended_Pictographic}/u.test(text), 'Emoji in UI: ' + key);
    rendered++;
  }
}

const consumers = [], used = new Set(), missing = [];
function scan(folder) {
  for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(?:mjs|js|html)$/u.test(entry.name) || entry.name === 'layout-i18n.mjs') continue;
    const bytes = fs.readFileSync(file), source = bytes.toString('utf8');
    consumers.push({file:path.relative(site,file).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')});
    for (const match of source.matchAll(/['"]((?:layout|common|nav)\.[a-zA-Z0-9_.]+)['"]/gu)) {
      const key = match[1]; if (key.endsWith('.')) continue;
      used.add(key); if (!hasMessage(key)) missing.push({file:path.relative(site,file),key});
    }
  }
}
scan(directory);
const state = fs.readFileSync(path.join(directory,'layout-state.mjs'),'utf8');
const geometry = fs.readFileSync(path.join(directory,'layout-geometry.mjs'),'utf8');
const errors = new Set(), warnings = new Set();
for (const match of state.matchAll(/(?:issue\(errors,\s*|fail\(|code:\s*)'([A-Z][A-Z0-9_]+)'/gu)) errors.add(match[1]);
for (const match of geometry.matchAll(/'(POLYGON_[A-Z_]+|SIMPLE_POLYGON_TRIANGULATION_FAILED)'/gu)) errors.add(match[1]);
for (const match of state.matchAll(/warn\('([A-Z_]+)'/gu)) warnings.add(match[1]);
for (const code of errors) {
  const key = 'layout.error.' + code;
  if (!hasMessage(key)) missing.push({key});
  for (const language of supportedLanguages) assert.doesNotThrow(() => t(key,{},language));
}
for (const code of warnings) for (const prefix of ['layout.warning.','layout.issue.']) {
  const key = prefix + code;
  if (!hasMessage(key)) missing.push({key});
  for (const language of supportedLanguages) assert.doesNotThrow(() => t(key,{},language));
}
for (const key of ['layout.tool.orbit','layout.tool.move','layout.hint.orbit','layout.hint.move',
  'layout.view.perspective','layout.view.top','layout.view.front','layout.view.fit',
  'layout.desktopOnlyTitle','layout.desktopOnlyText','layout.openViewer',
  'layout.error.ROOM_OUT_OF_BOUNDS','layout.error.SURFACE_OVERHANG','layout.repairBounds',
  'layout.error.RENDER_UNSUPPORTED','layout.error.RENDER_SHADER_FAILED','layout.error.SVG_NO_OUTLINE']) assert(hasMessage(key), key);
assert.deepEqual(missing, [], JSON.stringify(missing));
assert.equal(chooseLanguage({query:'ja',stored:'ko'}),'ja');
assert.equal(chooseLanguage({query:'unsupported',stored:'ru-RU'}),'ru');
assert.equal(chooseLanguage({}),'en');
const link = new URL(languageURL('https://example.test/layout/?plan=x#room','es'));
assert.equal(link.searchParams.get('lang'),'es'); assert.equal(link.searchParams.get('plan'),'x'); assert.equal(link.hash,'#room');
assert.throws(() => t('layout.unknown_test_key'), RangeError);
assert.throws(() => t('layout.render.progress'), TypeError);
console.log(JSON.stringify({status:'PASS',scope:'Headless message contract and actual source-key coverage; no browser/GPU or machine-fit claim.',
  languages:supportedLanguages,keys:messageKeys.length,rendered,literalKeys:used.size,errorCodes:errors.size,warningCodes:warnings.size,missing,consumers}));
