import assert from 'node:assert/strict';
import fs from 'node:fs';
import {componentViews,resolveComponentView,componentViewKeys} from '../site/viewer/v0-mod-library.mjs';
import {loadExternalComponent} from '../site/viewer/component-assets.mjs';
const additions=JSON.parse(fs.readFileSync(new URL('../site/COMPONENT_ADDITIONS.json',import.meta.url)));
const item=additions.items[0],parts=item.views.flatMap(v=>v.parts.map(key=>({key,name:key})));
const views=componentViews(item,parts);
for(const p of parts){const selected=resolveComponentView(views,{part:p.key});assert.deepEqual(componentViewKeys(selected.view,selected.part),[p.key])}
assert(views.every(v=>!v.assembly));
assert.throws(()=>componentViews(item,parts.slice(1)),/Missing component part/);
assert.throws(()=>componentViews({...item,views:[...item.views,item.views[0]]},parts),/Invalid component view/);
assert.throws(()=>componentViews(item,[...parts,{key:'unregistered',name:'unregistered'}]),/Unregistered component part/);
assert.throws(()=>componentViewKeys(views[0],'all'),/このバリエーション/);
const original=globalThis.fetch;let parsed=false;
globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));
try{await assert.rejects(loadExternalComponent({parseAsync:async()=>{parsed=true}},additions.assets[item.module],'https://example.test/viewer/components.html'),/checksum mismatch/);assert.equal(parsed,false)}finally{globalThis.fetch=original}
console.log('External components: all HYDRA source parts reachable individually; missing parts, duplicate views, fake assemblies and corrupt downloads rejected.');
