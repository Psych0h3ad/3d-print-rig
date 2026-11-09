import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {compileCatalog,sourceRevision} from './build_locales.mjs';
import {definitions} from '../site/viewer/locales/catalog.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
const source=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
const expected=Object.fromEntries(Object.entries(source.entries).map(([id,e])=>[id,JSON.parse(JSON.stringify({...e,revision:sourceRevision(e)}))]));
assert.equal(JSON.stringify(definitions),JSON.stringify(expected),'Every value, alias, revision, ID and own-field order must match the original JSON module');
const fixture={entries:{first:{kind:'message',ja:'一',en:'One',aliases:['旧一'],extra:{v:[1,null,'x']}},second:{en:'Second',ja:'二',kind:'template',aliases:[]},third:{kind:'message',en:'Third',ja:'三',omitted:undefined}}};
const fixtureCode=compileCatalog(fixture),fixtureModule=await import('data:text/javascript;base64,'+Buffer.from(fixtureCode).toString('base64'));
const fixtureExpected=Object.fromEntries(Object.entries(fixture.entries).map(([id,e])=>[id,JSON.parse(JSON.stringify({...e,revision:sourceRevision(e)}))]));
assert.equal(JSON.stringify(fixtureModule.definitions),JSON.stringify(fixtureExpected));assert(!Object.hasOwn(fixtureModule.definitions.third,'omitted'));
assert(!/^(?:const|let|var)\s+(?:layouts|rows)=/m.test(compileCatalog(source)),'Do not retain a redundant packed input alongside the exported catalog');
const dictionaries=new Map();for(const lang of ['es','ko','ru','de'])dictionaries.set(lang,(await import(new URL('../site/viewer/locales/'+lang+'.mjs',import.meta.url))).default);
const before=createTranslator(expected,{dictionaries}),after=createTranslator(definitions,{dictionaries});let formats=0,lookups=0;
for(const[id,e]of Object.entries(expected)){
 for(const text of [e.ja,e.en,...e.aliases||[]]){assert.equal(after.messageIdFor(text),before.messageIdFor(text));lookups++}
 for(const lang of ['en','ja','es','ko','ru','de']){assert.equal(after.formatMessage(id,['A','B','C','D'],lang),before.formatMessage(id,['A','B','C','D'],lang));formats++}
}
assert.equal(compileCatalog(source),await fs.readFile(new URL('../site/viewer/locales/catalog.mjs',import.meta.url),'utf8'));
console.log(JSON.stringify({sourceEntries:Object.keys(expected).length,formattedLanguageCases:formats,sourceAliasLookups:lookups,fixtureCases:3,fullRuntimeObjectAndFieldOrderExact:true,scope:'Lossless generated message catalog representation; no UI text, model or physical-fit change'}));
