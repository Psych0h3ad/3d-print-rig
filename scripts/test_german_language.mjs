import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {supportedLanguages,languageNames,normalizeLanguage,chooseLanguage,languageURL} from '../site/viewer/languages.mjs';
import {supportedLanguages as layoutLanguages,languageNames as layoutNames,messages,t} from '../site/layout/layout-i18n.mjs';
import {sourceMessages,sourceLanguages,sourceText} from '../site/viewer/source-assembly-messages.mjs';
import {initialState,validateState} from '../site/viewer/source-assembly-runtime/state.mjs';
import {sourceXYMessage} from '../site/viewer/source-assembly-runtime/source_XY309.mjs';

assert.deepEqual(layoutLanguages,supportedLanguages,'Layout and viewer must offer the same languages');
assert.deepEqual([...sourceLanguages].sort(),[...supportedLanguages].sort(),'Source views must not fall back to English for a supported language');
assert.equal(languageNames.de,'Deutsch');assert.equal(layoutNames.de,'Deutsch');
for(const region of ['de','de-DE','de-AT','de-CH','DE-de'])assert.equal(normalizeLanguage(region),'de');
assert.equal(chooseLanguage({query:'de-DE',stored:'ja'}),'de');
assert.equal(chooseLanguage({stored:'de-AT'}),'de');
assert.equal(chooseLanguage({languages:['de-DE']}),'en','The default remains English');
const linked=new URL(languageURL('https://example.test/layout/?plan=kept&analytics=off#room','de-DE'));
assert.equal(linked.searchParams.get('lang'),'de');assert.equal(linked.searchParams.get('plan'),'kept');
assert.equal(linked.searchParams.get('analytics'),'off');assert.equal(linked.hash,'#room');

for(const language of supportedLanguages)assert.deepEqual(Object.keys(sourceMessages[language]).sort(),Object.keys(sourceMessages.en).sort(),language+' source control completeness');
const source=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
const german=JSON.parse(await fs.readFile(new URL('../localization/de.json',import.meta.url),'utf8'));
const english=new Map();for(const[id,entry]of Object.entries(source.entries))if(!english.has(entry.en))english.set(entry.en,id);
let sourceBindings=0;
for(const[key,text]of Object.entries(sourceMessages.en)){
 const id=english.get(text);if(!id)continue;
 assert.equal(sourceText(key,'de'),german.messages[id].text,key+' German source controls must match the reviewed central catalog');sourceBindings++;
}
for(const key of ['layout.openings.title','layout.openings.sliding','layout.clipboard.help','layout.render.progress','layout.manufacturer.message']){
 assert(messages.de[key]?.trim(),key);assert.notEqual(messages.de[key],messages.en[key],key+' needs German copy');
}
assert(t('layout.render.progress',{current:1,total:2,percent:50},'de').includes('50'));

// The real saved source-state validator accepts all UI languages. This used to
// keep a separate language allowlist, losing new languages on save/load.
const packet={id:'language-only-source-fixture',model:{sha256:'a'.repeat(64)},inventory:{sha256:'b'.repeat(64)},
 default_variant:'default',variants:[{id:'default',visible_keys:[]}],visibility_groups:[]};
for(const language of supportedLanguages){
 const state=initialState(packet);state.language=language;
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(state)),packet),state);
}
assert.throws(()=>validateState({...initialState(packet),language:'unsupported'},packet));
const endpoint=sourceXYMessage({code:'SOURCE_FIXED_XY_ENDPOINT',message:'raw failure'},'de');
const path=sourceXYMessage({code:'SOURCE_FIXED_XY_PATH',message:'raw failure'},'de');
assert.match(endpoint,/Druckkopf/);assert.notEqual(path,'raw failure');assert.notEqual(path,endpoint);
assert.equal(sourceXYMessage({code:'UNRELATED',message:'original'},'de'),'original');
console.log(JSON.stringify({passed:true,languages:supportedLanguages,source_copy_bindings:sourceBindings,
 scope:'German registry/region/link behavior, complete source control text, Layout messages and saved-language validation; no new model-fit qualification.'}));
