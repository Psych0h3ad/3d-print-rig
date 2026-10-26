import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {supportedLanguages} from '../site/viewer/languages.mjs';
import {funMessages} from '../site/viewer/locales/fun.mjs';
import {funWords,formatFunMessage} from '../site/fun/fun-language.mjs';
import {compileFunMessages,sourceRevision} from './build_locales.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const source=await read('localization/source.json'),bindings=await read('localization/fun.json');
const dictionaries=Object.fromEntries(await Promise.all(supportedLanguages.filter(language=>!['en','ja'].includes(language)).map(async language=>[language,await read('localization/'+language+'.json')])));
assert.deepEqual(Object.keys(funMessages),supportedLanguages);
let checked=0;
for(const language of supportedLanguages){
 assert.deepEqual(Object.keys(funMessages[language]),Object.keys(bindings.messages));
 for(const[id,sourceId]of Object.entries(bindings.messages)){
  const entry=source.entries[sourceId],record=dictionaries[language]?.messages[sourceId];
  assert.equal(funMessages[language][id],record?record.text:entry[language]);
  if(record)assert.equal(record.source_revision,sourceRevision(entry));checked++;
 }
 assert.equal(formatFunMessage('count',{0:39},language).includes('39'),true);
 assert.throws(()=>formatFunMessage('count',{},language),TypeError);
 assert.throws(()=>formatFunMessage('unknown-key',{},language),RangeError);
}
assert.equal(funWords('de-DE').language,'Sprache');
assert.equal(funWords('de').heroFirst,'Zum');assert.equal(funWords('de').heroSecond,'Spaß');
assert.match(funWords('de').embedInfo,/Alphatest/);
assert.equal(funWords('unsupported').language,funWords('en').language);
const generated=await fs.readFile(path.join(root,'site/viewer/locales/fun.mjs'),'utf8');
assert.equal(generated,compileFunMessages(source,dictionaries,bindings));
assert(Buffer.byteLength(generated)<60000,'Wallpaper messages must remain a small page-specific subset');
assert.throws(()=>compileFunMessages(source,dictionaries,{schema_version:1,messages:{'fun.bad':'missing.source'}}));

// These controls run the actual page/DOM fixture and reproduce both parts of
// the old bug: a German picker with English html.lang or with English copy.
const body=await fs.readFile(path.join(root,'site/fun/fun.mjs'),'utf8');
const defects=[body.replace('document.documentElement.lang=language;',"document.documentElement.lang=ja?'ja':'en';"),
 body.replace('const words=funWords(language)',"const words=funWords(language==='ja'?'ja':'en')")];
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'rig-fun-language-'));
try{
 for(let i=0;i<defects.length;i++){
  assert.notEqual(defects[i],body);const file=path.join(temporary,'fixture-'+i+'.mjs');await fs.writeFile(file,defects[i]);
  const result=spawnSync(process.execPath,['scripts/test_workspace_destinations.mjs','--fun-source',file],{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0,'The real destination fixture missed English fallback '+i);
  assert.match(result.stderr,/AssertionError/);
 }
}finally{
 const resolved=await fs.realpath(temporary),base=await fs.realpath(os.tmpdir());
 assert.equal(path.dirname(resolved),base);assert(path.basename(resolved).startsWith('rig-fun-language-'));
 await fs.rm(resolved,{recursive:true,force:true});
}
const helper=await fs.readFile(path.join(root,'site/fun/fun-language.mjs'),'utf8');
assert(!/from\s*['"][^'"]*(?:i18n\.mjs|manifest\.mjs|three|model-loader|bootstrap)/u.test(body+'\n'+helper),'No full viewer dictionary engine or CAD preload for wallpaper localization');
console.log(JSON.stringify({passed:true,languages:supportedLanguages,checked_messages:checked,subset_bytes:Buffer.byteLength(generated),negative_controls:2,scope:'Generated wallpaper messages and real page URL/DOM localization; no model-fit claim.'}));
