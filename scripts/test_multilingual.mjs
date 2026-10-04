import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {translate,loadLanguage,formatMessage,languageURL,chooseLanguage,supportedLanguages} from '../site/viewer/i18n.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
import {sourceRevision,validateTranslations} from './build_locales.mjs';
import {definitions} from '../site/viewer/locales/manifest.mjs';
import {printerWorkspaceURL} from '../site/viewer/workspace-return.mjs';

const root=new URL('../localization/',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name+'.json',root),'utf8'));
const source=await read('source'),dictionaries=Object.fromEntries(await Promise.all(['es','ko','ru'].map(async language=>[language,await read(language)])));
const glossary=await read('glossary');
assert.deepEqual(validateTranslations(source,dictionaries,glossary),[]);
assert.deepEqual(supportedLanguages,['ja','en','es','ko','ru']);
assert.equal(chooseLanguage({query:'es-MX',stored:'ko',languages:['ru-RU']}),'es');
assert.equal(chooseLanguage({stored:'ko-KR',languages:['ru-RU']}),'ko');
assert.equal(chooseLanguage({languages:['fr-FR','ru-RU','en']}),'ru');
assert.equal(chooseLanguage({languages:['fr-FR']}),'en');
await Promise.all(['es','ko','ru'].map(loadLanguage));
let checked=0;
for(const language of ['es','ko','ru']){
 for(const[id,e]of Object.entries(source.entries)){
  assert.equal(translate(e.ja,language),dictionaries[language].messages[id].text,language+':'+id);
  assert.equal(translate(e.en,language).trim(),dictionaries[language].messages[id].text.trim(),language+': English alias '+id);
  assert.equal(formatMessage(id,{},language),dictionaries[language].messages[id].text);
  checked++;
 }
 for(const raw of ['constructor','__proto__','G1 X10  Y20\n; hello','NH36','sherpa_mini_v2.step','d2488dcc768d199c23d44d81c242d526accdba6a'])assert.equal(translate(raw,language),raw);
 const counts=translate('Stealthburner · 24構成',language);assert(counts.includes('Stealthburner')&&counts.includes('24'));assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(counts));
 const href='https://example.test/viewer/toolheads.html?configuration=kept&bank=three#mount';
 const url=new URL(languageURL(href,language));assert.equal(url.searchParams.get('lang'),language);assert.equal(url.searchParams.get('configuration'),'kept');assert.equal(url.searchParams.get('bank'),'three');assert.equal(url.hash,'#mount');
 const back=new URL(printerWorkspaceURL(url.href,'https://example.test/viewer/v24-reference.html?machine=voron_v24_250_printed&configuration=kept'));
 assert.equal(back.searchParams.get('lang'),language);assert.equal(back.searchParams.get('machine'),'voron_v24_250_printed');assert.equal(back.searchParams.get('configuration'),'kept');
}
assert.equal(translate('未検証','es'),'Sin verificar');assert.equal(translate('未検証','ko'),'미검증');assert.equal(translate('未検証','ru'),'Не проверено');
const motorStatusId=Object.keys(source.entries).find(id=>source.entries[id].ja==='3D切替済み · {0}モーター · {1} mmベルト');
for(const language of supportedLanguages){
 const status=formatMessage(motorStatusId,{0:4,1:9},language);
 assert.equal(translate('3D切替済み · 4モーター · 9 mmベルト ／ 未検証',language),status+' ／ '+translate('未検証',language));
 if(language!=='ja')assert.equal(translate('3D assembly switched · 4 motors · 9 mm belts ／ Unverified',language),status+' ／ '+translate('未検証',language));
}

// Revising a message keeps its ID and legacy source alias. An old translation
// must not silently state the previous clearance when the source has changed.
const old={kind:'template',ja:'間隔 {0} mm。',en:'Gap {0} mm.'},oldRevision=sourceRevision(old);
const newer={...old,ja:'最小間隔 {0} mm。',en:'Minimum gap {0} mm.',aliases:[old.ja]};
const fixture={clearance:{...newer,revision:sourceRevision(newer)}};
const translator=createTranslator(fixture,{dictionaries:new Map([['es',{clearance:[oldRevision,'Separación {0} mm.']}],['ko',{}]])});
assert.equal(translator.formatMessage('clearance',{0:'2.8'},'es'),'Minimum gap 2.8 mm.');
assert.equal(translator.translate('間隔 2.8 mm。','es'),'Minimum gap 2.8 mm.');
assert.equal(translator.translate('間隔 2.8 mm。','ja'),'最小間隔 2.8 mm。');
assert.equal(translator.translate('間隔 2.8 mm。 ／ 原寸','ja'),'最小間隔 2.8 mm。 ／ 原寸');
assert.equal(translator.formatMessage('clearance',{0:'2.8'},'ko'),'Minimum gap 2.8 mm.');
assert(translator.diagnostics().fallbacks.includes('es:clearance'));
const changed=structuredClone(source);changed.entries['ui.configuration'].en='Printer configuration';
assert(validateTranslations(changed,dictionaries).some(e=>e.id==='ui.configuration'&&e.issue==='stale'));
const missing=structuredClone(dictionaries);delete missing.ko.messages['ui.configuration'];
assert(validateTranslations(source,missing).some(e=>e.language==='ko'&&e.issue==='missing'));
const placeholderId=Object.keys(source.entries).find(id=>source.entries[id].en.includes('{0}'));
const broken=structuredClone(dictionaries);broken.es.messages[placeholderId].text=broken.es.messages[placeholderId].text.replace('{0}','{1}');
assert(validateTranslations(source,broken).some(e=>e.issue==='placeholders'&&e.id===placeholderId));
const numberId=Object.keys(source.entries).find(id=>source.entries[id].en.includes('0.73'));
const wrongNumber=structuredClone(dictionaries);wrongNumber.ru.messages[numberId].text=wrongNumber.ru.messages[numberId].text.replace('0.73','7.3');
assert(validateTranslations(source,wrongNumber).some(e=>e.issue==='numeric_value'&&e.id===numberId));
const extraLine=structuredClone(dictionaries);extraLine.es.messages['ui.configuration'].text+='\nUnrelated text';
assert(validateTranslations(source,extraLine).some(e=>e.issue==='unexpected_line_break'&&e.id==='ui.configuration'));
const commandId=Object.keys(source.entries).find(id=>source.entries[id].en.includes('ACTIVATE_EXTRUDER'));
const alteredCommand=structuredClone(dictionaries);alteredCommand.ko.messages[commandId].text=alteredCommand.ko.messages[commandId].text.replace('ACTIVATE_EXTRUDER','ACTIVAR_EXTRUSOR');
assert(validateTranslations(source,alteredCommand).some(e=>e.issue==='command_identifier'&&e.id===commandId));
const wrongContext=structuredClone(dictionaries);wrongContext.ko.messages['text.1364'].text='도구 은행';
assert(validateTranslations(source,wrongContext,glossary).some(e=>e.issue==='technical_context'&&e.id==='text.1364'));
assert.equal(definitions['ui.configuration'].revision,sourceRevision(source.entries['ui.configuration']));
console.log(`Multilingual checks passed: ${checked} complete translations; stable revisions, source aliases, fallback, measurements and configuration links preserved.`);
