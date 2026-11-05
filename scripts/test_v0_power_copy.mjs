// Canonical message IDs, exact six-language entries and the production translator.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadLanguage,translate,messageIdFor} from '../site/viewer/i18n.mjs';
const root=new URL('../',import.meta.url),source=JSON.parse(await fs.readFile(new URL('localization/source.json',root),'utf8'));
const entries=Object.entries(source.entries).filter(([id])=>id.startsWith('v0.power.manual.'));assert.equal(entries.length,31);
const dictionaries=Object.fromEntries(await Promise.all(['de','es','ru','ko'].map(async l=>[l,JSON.parse(await fs.readFile(new URL('localization/'+l+'.json',root),'utf8'))])));
let comparisons=0;
for(const lang of ['en','ja','de','es','ru','ko']){
 await loadLanguage(lang);
 for(const[id,entry]of entries){const expected=['en','ja'].includes(lang)?entry[lang]:dictionaries[lang].messages[id].text;
  assert.equal(messageIdFor(entry.en),id);assert.equal(messageIdFor(entry.ja),id);
  for(const tag of [lang,lang+'-'+(lang==='ja'?'JP':'ZZ')]){assert.equal(translate(entry.en,tag),expected);assert.equal(translate(entry.ja,tag),expected);comparisons+=2;}
 }
}
const motors=entries.find(([,e])=>e.en==='Compare the A, B, Z and E motor positions');assert(motors);
for(const lang of ['de','es','ru','ko'])for(const label of ['A','B','Z','E'])assert(dictionaries[lang].messages[motors[0]].text.includes(label),'Keep all four original motor identities');
const app=await fs.readFile(new URL('site/viewer/v0-app.js',root),'utf8');assert(!app.includes('v0-power-copy.mjs'));assert(app.includes("language=document.documentElement.lang||'en')=>translateV0ManualCopy(text,language,sourceTranslate)"));
const viewer=new URL('site/viewer/',root),files=['v0-app.js','v0.html'];
for(const file of files){const text=await fs.readFile(new URL(file,viewer),'utf8');for(const match of text.matchAll(/['"](\.\/[^'"\s]+\.m?js)\?v=([a-f0-9]{20})['"]/g)){const target=await fs.readFile(new URL(match[1],viewer),'utf8'),pin=createHash('sha256').update(target.replaceAll('\r\n','\n')).digest('hex').slice(0,20);assert.equal(match[2],pin,'Current dependency cache '+match[1]);}}
console.log(JSON.stringify({passed:true,canonicalPowerEntries:31,productionTranslationComparisons:comparisons,motorIdentitiesRetained:true,sourceOnly:true,physicalFitQualified:false}));
