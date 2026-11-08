import assert from'node:assert/strict';import fs from'node:fs/promises';
import{receiveManualSourceFixture}from'./v0_manual_source_fixture.mjs';
const{bundle,api,requests,bodies}=await receiveManualSourceFixture();assert.equal(requests,14);
const{translateV0ManualCopy}=await import('../site/viewer/v0-current-manual-copy.mjs');
const dict=JSON.parse(await fs.readFile(new URL('../site/viewer/data/v0-reference-copy.source.json',import.meta.url),'utf8'));
assert.deepEqual(bundle.data['v0-reference-copy'],dict);assert.equal(Object.keys(dict).length,21);
let translations=0;for(const[text,row]of Object.entries(dict)){
 assert.deepEqual(Object.keys(row).sort(),['de','es','ja','ko','ru']);
 for(const lang of['en','ja','es','de','ko','ru']){const expected=lang==='en'?text:row[lang];assert(expected.trim());assert.equal(translateV0ManualCopy(text,lang),expected);assert.equal(translateV0ManualCopy(text,lang+'-XX'),expected);translations++;}
}
for(const[id,spec]of Object.entries(bundle.data['v0-assembly-stages'].machines)){
 const stages=spec.stages,at=id=>stages.findIndex(s=>s.id===id),top=stages[at('reference-tophat-profiles')],r1=id==='voron_v02r1_120';
 assert(at('reference-belt-paths')<at('carriage-body'));assert(at('reference-tophat-profiles')<at('tophat-long-front-prep'));assert(at('reference-startup-docs')<at('complete'));assert.equal(stages.at(-1).id,'complete');
 assert.equal(top.page_start,r1?236:229);assert(top.note.includes(r1?'four reserved B profiles and four J profiles':'four J profiles and four K profiles'));assert.equal(stages[at('reference-startup-docs')].page_start,r1?250:243);
 for(const stage of stages.filter(s=>s.id.startsWith('reference-'))){assert(dict[stage.title]);assert(dict[stage.note]);assert.equal(stage.part_keys.length,0);assert(!Object.hasOwn(stage,'operation_part_keys'),'Reference must not claim source part ownership');}
 assert.equal(stages[at('reference-drilling')].page_start,12);assert(stages[at('reference-drilling')].note.includes('Skip drilling'));
}
assert.equal(translateV0ManualCopy('Unknown reference phrase','ja',()=> 'retained-fallback'),'retained-fallback');
const before=api.checkedV0ManualBundle(bundle);let missingReferenceRequested=false;
await assert.rejects(api.loadV0ManualData({fetchImpl:async target=>{const[name,pin]=Object.entries(api.v0ManualDelivery).find(([,pin])=>String(target).includes(pin.gzip.sha256.slice(0,20)))||[];assert(pin);if(name==='v0-reference-copy'){missingReferenceRequested=true;return new Response('',{status:404});}return new Response(Buffer.from(bodies[name],'base64'),{headers:{'Content-Length':String(pin.gzip.bytes)}});}}));assert(missingReferenceRequested);assert.equal(api.checkedV0ManualBundle(bundle),before);
console.log(JSON.stringify({passed:true,actualTranslatorPath:true,translations,models:2,nineReferencesEach:true,versionSpecificJKVersusBJPreserved:true,missingReferenceDeliveryRejected:true,sourceGeometryOrPhysicalFitQualified:false}));
