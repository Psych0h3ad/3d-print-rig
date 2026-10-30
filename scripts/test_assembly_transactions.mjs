import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const TARGET={module:'transaction_gantry_fixture'};
const source=new URL('../site/viewer/',import.meta.url);
const {createToolheadLedRig}=await import(new URL('toolhead-lighting.mjs',source));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),clone=v=>structuredClone(v);
globalThis.location={href:new URL('review.html?analytics=off',source).href};
const {createMachineHeads}=await import(new URL('machine-heads.js',source));
const {createMonolithGantry}=await import(new URL('monolith-machine.js',source));

const routes=JSON.parse(fs.readFileSync(new URL('../site/MONOLITH_BELT_ROUTES.json',import.meta.url),'utf8'));
// Explicit synthetic triangles are injection fixtures, never replacement model parts.
const pos=Buffer.from(new Float32Array([0,0,0,.01,0,0,0,.01,0]).buffer),idx=Buffer.from(new Uint32Array([0,1,2]).buffer);

function glb(key,positions=pos,indices=idx){
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:key,mesh:0}],meshes:[{name:key,extras:{part_key:key},primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.25,.3,1]}}],buffers:[{byteLength:positions.length+indices.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length},{buffer:0,byteOffset:positions.length,byteLength:indices.length}],accessors:[{bufferView:0,componentType:5126,count:positions.length/12,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]},{bufferView:1,componentType:5125,count:indices.length/4,type:'SCALAR'}]};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const binary=Buffer.concat([positions,indices]),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,binHeader,binary]);
}
const fixtures=new Map(),specs={};
for(const id of ['fixture_A','fixture_B','fixture_D','fixture_fail','fixture_slow','stealthburner']){
 const key=id==='stealthburner'?'423':'transaction_triangle';let model;
 if(key==='423'){const positions=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),indices=Buffer.from(new Uint32Array([0,1,2,...Array(14).fill([0,0,0]).flat()]).buffer);model=glb(key,positions,indices)}else model=glb(key);
 const meta=Buffer.from(JSON.stringify({id:id+'_transaction_fixture',parts:[{key,name:'Explicit test fixture',component:'tool',appearance_role:'accent'}]}));
 fixtures.set(id,{model,meta});specs[id]={component_id:id+'_transaction_fixture',meta:'transaction-fixtures/'+id+'.json',glb:'transaction-fixtures/'+id+'.glb',metadata_sha256:sha(meta),decoded_model_sha256:sha(model)};
}
const exactTarget=glb('fixture_rail'),exactMeta=Buffer.from(JSON.stringify({parts:[{key:'fixture_rail',name:'Synthetic gantry test mesh',component:'frame',appearance_role:'base'}]}));
let failures=new Set(),block=null,requests=[];
globalThis.fetch=async input=>{
 const u=new URL(input,location.href),name=u.pathname.split('/').pop();requests.push(u.href);
 if(name==='transaction_gantry_fixture.glb')return new Response(exactTarget);
 if(name==='transaction_gantry_fixture.json')return new Response(exactMeta);
 if(name.startsWith('ASSET_BUNDLE.json'))return new Response('{}');
 if(u.pathname.includes('/transaction-fixtures/')){
  const id=name.replace(/\.(json|glb)$/,'');if(id==='fixture_slow'&&block&&name.endsWith('.glb'))await block.promise;
  if(failures.has(name))return new Response('fixture failure',{status:503});
  const f=fixtures.get(id);assert(f,'Known fixture only '+id);return new Response(name.endsWith('.json')?f.meta:f.model);
 }
 throw Error('Unexpected transport '+u.href);
};
const targetSpec={meta:'transaction-fixtures/transaction_gantry_fixture.json',glb:'transaction-fixtures/transaction_gantry_fixture.glb'},host=[0,0,220],beltId='monolith_belts_vt_6_2wd_350';
function variant(id,base='fixture_'+id,translation=[0,0,0]){return {id,source_head_configuration:id,toolhead:base,mount:'stealthchanger',gantry:'transaction_fixture',machine_head:{base,translation,translation_delta_mm:host,hidden:[],modules:[]},machine_gantry:{family:'VT',size_mm:350,translation_mm:host,modules:[TARGET.module,beltId]}}}
function setup(){
 const A=variant('A'),B=variant('B'),scene=new THREE.Scene(),catalog={machine_id:'transaction_fixture_machine',base_assets:{...specs},assets:{[TARGET.module]:targetSpec,...specs},variants:[A,B],monolith:{belt_routes:routes},bank_data:{machines:{transaction_fixture_machine:{capacity:3,translation_mm:[0,100,200],center_x_mm:0}},pitch_mm:100,fixture_assets:[],profiles:[{selection:{toolhead:'fixture_A'},dock:'fixture_D',park_translation_mm:[0,0,0]},{selection:{toolhead:'fixture_B'},dock:'fixture_D',park_translation_mm:[0,0,0]}]}};
 let hook=()=>{};const heads=createMachineHeads(scene,catalog,{render:()=>hook()});return {heads,catalog,A,B,scene,setHook:f=>hook=f};
}
const bank=active=>({enabled:true,active,tools:['A','B']});
const activeRoots=h=>[...h.cache].filter(([,p])=>p.loaded?.root.visible).map(([id])=>id).sort();
function snapshot(h){return {active:h.active,gantry:h.gantry.active,belts:[...h.gantry.belts],bank:[...h.bankRig.children],bankState:clone(h.bankState),activeRoots:activeRoots(h),rig:h.rig.matrixWorld.toArray(),target:h.gantry.cache.get(TARGET.module).loaded.entries.map(e=>e.mesh.matrixWorld.toArray()),roots:[...h.cache.values()].filter(p=>p.loaded?.root.visible).map(p=>({root:p.loaded.root,matrix:p.loaded.root.matrix.toArray(),auto:p.loaded.root.matrixAutoUpdate,visible:p.loaded.entries.map(e=>e.mesh.visible)}))}}
function unchanged(h,s){assert.equal(h.active,s.active);assert.equal(h.gantry.active,s.gantry);assert.deepEqual(h.gantry.belts,s.belts);assert.deepEqual(h.bankRig.children,s.bank);assert.deepEqual(h.bankState,s.bankState);assert.deepEqual(activeRoots(h),s.activeRoots);assert.deepEqual(h.rig.matrixWorld.toArray(),s.rig);assert.deepEqual(h.gantry.cache.get(TARGET.module).loaded.entries.map(e=>e.mesh.matrixWorld.toArray()),s.target);for(const r of s.roots){assert.deepEqual(r.root.matrix.toArray(),r.matrix);assert.equal(r.root.matrixAutoUpdate,r.auto);assert.deepEqual(h.cache.get(h.active.machine_head.base).loaded.entries.map(e=>e.mesh.visible),r.visible)}}
const result={scope:'Production controller and loader with explicit synthetic GLB head/dock/gantry fixtures and existing belt-route construction. Asset and browser reviews are separate.',groups:[]};
async function test(name,fn){failures=new Set();block=null;try{await fn();result.groups.push({name,pass:true})}catch(e){result.groups.push({name,pass:false,error:e.stack})}finally{block?.release?.();block=null}}
await test('Fresh current-API controller initial head+target+2belts and bank',async()=>{const {heads:h,A}=setup();await h.install(A,bank(0));assert.equal(h.active,A);assert.equal(h.gantry.belts.length,2);assert.equal(h.bankRig.children.length,3);result.actual_target_leaves=h.gantry.cache.get(TARGET.module).loaded.entries.length;result.actual_belt_meshes=h.gantry.belts.length});
await test('Required head fetch failure leaves old head/target/belts/bank untouched',async()=>{const {heads:h,A}=setup();await h.install(A,bank(0));const s=snapshot(h);let disposed=0;for(const b of s.belts)b.mesh.geometry.addEventListener('dispose',()=>disposed++);failures.add('fixture_fail.glb');await assert.rejects(()=>h.install(variant('bad','fixture_fail'),{enabled:false}),/503/);await unchanged(h,s);assert.equal(disposed,0)});
{
await test('Bank validation failure happens before gantry commit',async()=>{const {heads:h,A,B}=setup();await h.install(A,bank(0));const s=snapshot(h);await assert.rejects(()=>h.install(B,bank(0)),/一致/);await unchanged(h,s)});
await test('Internal commit failure restores actual target, exact old belts and bank resources',async()=>{const env=setup(),h=env.heads;await h.install(env.A,bank(0));const s=snapshot(h);let disposed=0;for(const b of s.belts)for(const r of [b.mesh.geometry,b.mesh.material])r.addEventListener('dispose',()=>disposed++);for(const root of s.bank)root.traverse(m=>{if(m.isMesh)m.material.addEventListener('dispose',()=>disposed++)});const move=h.gantry.setDelta;h.gantry.setDelta=d=>{move(d);h.gantry.setDelta=move;throw Error('Injected commit motion failure')};await assert.rejects(()=>h.install(env.B,bank(1)),/Injected/);await unchanged(h,s);assert.equal(disposed,0)});
await test('Successful A-B-A, reset and belt disposal only after commit',async()=>{const {heads:h,A,B}=setup();await h.install(A,bank(0));const old=h.gantry.belts.map(b=>b.mesh.geometry);let disposed=0;old.forEach(g=>g.addEventListener('dispose',()=>disposed++));await h.install(B,bank(1));assert.equal(h.active,B);assert.equal(disposed,2);await h.install(A,bank(0));await h.install(null);assert.equal(h.active,null);assert.equal(h.gantry.active,null);assert.equal(h.bankRig.children.length,0);assert.equal(h.gantry.root.visible,false)});
await test('Gantry resource-build failure disposes new routes and preserves active resources',async()=>{const {heads:h,A,B,catalog}=setup();await h.install(A,bank(0));const s=snapshot(h);B.machine_gantry.modules.push('monolith_belts_missing_350');await assert.rejects(()=>h.install(B,bank(1)),/未登録/);await unchanged(h,s)});
await test('Stale gantry preparation after motion cannot overwrite active pose',async()=>{const {heads:h,A}=setup();await h.install(A);const staged=await h.gantry.prepare(A);h.setDelta([12,-9,0]);assert.throws(()=>staged.commit(),/Stale/);staged.rollback();h.setDelta([0,0,0])});
await test('Latest completed request wins while earlier asset load remains pending',async()=>{const {heads:h,A,B}=setup();await h.install(A,bank(0));let release;block={promise:new Promise(r=>release=r),release:()=>release()};const slow=variant('slow','fixture_slow');const pending=h.install(slow,{enabled:false});const observed=pending.then(()=>({ok:true}),error=>({error}));await new Promise(r=>setTimeout(r,0));await h.install(B,bank(1));block.release();const r=await observed;assert(r.error&&/Superseded/.test(r.error.message));assert.equal(h.active,B);assert.equal(h.gantry.active,B);});
await test('Mutating request while source loads rejects without visible changes',async()=>{const {heads:h,A}=setup();await h.install(A);const s=snapshot(h);let release;block={promise:new Promise(r=>release=r),release:()=>release()};const slow=variant('slow','fixture_slow'),pending=h.install(slow);const observed=pending.then(()=>({ok:true}),error=>({error}));await new Promise(r=>setTimeout(r,0));slow.machine_head.translation[0]=25;block.release();const r=await observed;assert(r.error&&/changed/.test(r.error.message));await unchanged(h,s)});
await test('Rapido X UHF index bytes and draw state restored after failed switch',async()=>{const env=setup(),h=env.heads,sb=variant('sb','stealthburner');sb.cover_source={kind:'original_uhf'};await h.install(sb);const e=h.cache.get('stealthburner').loaded.entries[0],source=e.mesh.geometry.index.array.slice(),draw={...e.mesh.geometry.drawRange},surface=e.uhfSurface,old=snapshot(h);const move=h.gantry.setDelta;h.gantry.setDelta=d=>{move(d);h.gantry.setDelta=move;throw Error('UHF rollback injection')};await assert.rejects(()=>h.install(env.A),/UHF/);assert.deepEqual(e.mesh.geometry.index.array,source);assert.deepEqual(e.mesh.geometry.drawRange,draw);assert.equal(e.uhfSurface,surface);await unchanged(h,old)});
await test('New UHF helper state removed if activation rolls back',async()=>{const env=setup(),h=env.heads,standard=variant('sb','stealthburner');await h.install(standard);const e=h.cache.get('stealthburner').loaded.entries[0],source=e.mesh.geometry.index.array.slice(),draw={...e.mesh.geometry.drawRange};assert.equal(e.uhfSurface,undefined);const uhf={...standard,id:'uhf',cover_source:{kind:'original_uhf'}};const move=h.gantry.setDelta;h.gantry.setDelta=d=>{move(d);h.gantry.setDelta=move;throw Error('new UHF rollback')};await assert.rejects(()=>h.install(uhf),/new UHF/);assert.deepEqual(e.mesh.geometry.index.array,source);assert.deepEqual(e.mesh.geometry.drawRange,draw);assert.equal(e.uhfSurface,undefined);assert.equal(h.active,standard)});
await test('Prepared belts take the latest flexibility visibility at commit',async()=>{const {heads:h,A}=setup();await h.install(A);const staged=await h.gantry.prepare(A);h.gantry.setFlexibleVisible(false);staged.commit();staged.finish();assert(h.gantry.belts.every(b=>b.mesh.visible===false));h.gantry.setFlexibleVisible(true);assert(h.gantry.belts.every(b=>b.mesh.visible===true))});
await test('Post-success belt disposal error cannot reject coherent new configuration',async()=>{const {heads:h,A,B}=setup();await h.install(A,bank(0));h.gantry.belts[0].mesh.geometry.addEventListener('dispose',()=>{throw Error('Injected old belt dispose failure')});await h.install(B,bank(1));assert.equal(h.active,B);assert.equal(h.gantry.active,B);assert(h.gantry.cleanupErrors.some(s=>s.includes('dispose failure')));});
await test('Bank-only commit failure restores old bank and actual head/gantry resources',async()=>{const env=setup(),h=env.heads;await h.install(env.A,bank(0));const old=snapshot(h);let disposed=0;for(const root of old.bank)root.traverse(m=>{if(m.isMesh)m.material.addEventListener('dispose',()=>disposed++)});const palette=h.gantry.setPalette;h.gantry.setPalette=v=>{palette(v);h.gantry.setPalette=palette;throw Error('Injected bank-only palette failure')};await assert.rejects(()=>h.setBank({enabled:true,active:0,tools:['A','B','A']}),/bank-only/);await unchanged(h,old);assert.equal(disposed,0)});
await test('Review TX-01 bank sibling remains protected until every source load settles',async()=>{
 const {heads:h,A,catalog}=setup();await h.install(A);const old=snapshot(h),priorReport=h.cachePolicy.report;
 catalog.bank_data.profiles[0].dock='fixture_fail';catalog.bank_data.profiles[1].dock='fixture_slow';failures.add('fixture_fail.glb');let release;block={promise:new Promise(r=>release=r),release:()=>release()};
 let settled=false;const pending=h.setBank(bank(0)).then(()=>{settled=true;return null},error=>{settled=true;return error});
 await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));assert.equal(settled,false);assert.equal(h.cachePolicy.report,priorReport);block.release();const error=await pending;assert(error&&/503/.test(error.message));await unchanged(h,old);
 assert.notEqual(h.cachePolicy.report,priorReport);assert.equal(h.cachePolicy.report.pending.length,0);assert(h.cachePolicy.report.inactiveBytes>0);assert(h.cachePolicy.report.withinLimit);assert(h.cache.get('fixture_slow').loaded.root.visible===false);
});
await test('Review TX-02 actual LED discovery can retire old bank after coherent success',async()=>{
 const env=setup(),h=env.heads;await h.install(env.A,bank(0));const oldBank=[...h.bankRig.children];let ledMesh;oldBank[0].traverse(m=>{if(m.isMesh&&!ledMesh)ledMesh=m});
 // Explicit synthetic lens fixture for lifecycle only, no replacement CAD.
 ledMesh.geometry=new THREE.BoxGeometry(.003,.003,.001);ledMesh.material=new THREE.MeshStandardMaterial({color:'#fff'});
 const led=createToolheadLedRig(env.scene,{identify:m=>m===ledMesh?{id:'transaction-lens-fixture',kind:'nozzle',normal:[0,0,1]}:null,apertureFor:()=>null,guideFor:()=>null});env.scene.userData.toolheadLedController=led;led.discover();assert.equal(led.emitters.length,1);
 const oldDerived=ledMesh.geometry,surface=ledMesh.userData.ledSurface;let retired=0;oldDerived.addEventListener('dispose',()=>retired++);
 env.setHook(()=>{led.discover();throw Error('Injected postcommit after LED retirement')});await h.install(env.B,bank(1));
 assert.equal(h.active,env.B);assert.equal(h.gantry.active,env.B);assert.equal(retired,1);assert.equal(ledMesh.userData.ledSurface,undefined);assert.equal(led.emitters.length,0);assert(h.cleanupErrors.some(s=>s.includes('after LED retirement')));assert(oldBank.every(r=>!h.bankRig.children.includes(r)));led.dispose();delete env.scene.userData.toolheadLedController;
});
}
assert.equal(result.groups.length,16);assert.deepEqual(result.groups.filter(g=>!g.pass),[]);console.log('Assembly transactions: '+result.groups.length+' production-controller failure, rollback, cleanup, race, bank and UHF lifecycle checks passed.');
