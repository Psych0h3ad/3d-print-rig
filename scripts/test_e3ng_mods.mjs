import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const THREE=await import('three');
const {attachE3NGMods,defaultE3NGMods,validateE3NGMods}=await import('../site/viewer/source-assembly-runtime/e3ng-mods.mjs');
import {e3ngModParts,e3ngModModel} from '../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs';

const root=new THREE.Group(),parts=new Map(),rest=new Map(),materials=[],ownedGeometries=new Set();
for(const spec of e3ngModParts){
 const node=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:spec.control==='base'?'#ab2200':'#113399'}));node.matrixAutoUpdate=false;node.matrix.fromArray(spec.host_world);root.add(node);
 const record={source_id:spec.host_source_sha256};parts.set(spec.host,{node,record});rest.set(spec.host,{world:node.matrix.clone()});materials.push({key:spec.host,material:node.material,color:node.material.color.clone(),role:spec.control==='base'?'A':'M'});
}
const companion=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#999999',metalness:1}));root.add(companion);const purchasedColor=companion.material.color.clone();
let state={palette:{M:'#0011ee',A:'#ee2200'},pose:0,hidden:false};
const normal={root,packet:{model:{sha256:e3ngModModel}},parts,rest,materials,ownedGeometries,snapshot:()=>structuredClone(state),apply:s=>{assert(Number.isFinite(s.pose));state=structuredClone(s);for(const spec of e3ngModParts){const n=parts.get(spec.host).node;n.matrix.fromArray(spec.host_world);n.matrix.elements[12]+=s.pose;n.visible=!s.hidden;}for(const r of materials)r.material.color.set(s.palette[r.role]);root.updateMatrixWorld(true);},reset(){this.apply({palette:{M:'#0011ee',A:'#ee2200'},pose:0,hidden:false});},dispose(){}};
normal.apply(state);
const replacement=new THREE.Group();
for(const spec of e3ngModParts){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(9),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(spec.triangles*3),1));const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.userData={e3ng_mod:spec.id,source_sha256:spec.source_sha256};replacement.add(mesh);}
const adapter=attachE3NGMods(normal,{scene:replacement});
assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
const alternatives=[{base:'stock',cable:'stock'},{base:'reinforced',cable:'stock'},{base:'reinforced',cable:'cable-hole'},{base:'stock',cable:'cable-hole'},{base:'stock',cable:'stock'}];
let checks=0;
for(const choice of alternatives)for(const pose of [0,.05,-.05,.025,0]){
 const s={...adapter.snapshot(),pose,e3ng_mods:{schema:'e3ng-mods-v1',...choice}};adapter.apply(s);
 for(const {spec,mesh,host}of adapter.e3ngMods.entries){const selected=choice[spec.control]===spec.choice;assert.equal(mesh.visible,selected);assert.equal(host.node.visible,!selected);assert(mesh.matrixWorld.elements.every((x,i)=>Math.abs(x-host.node.matrixWorld.elements[i])<1e-12));assert(mesh.material.color.equals(new THREE.Color(s.palette[spec.control==='base'?'A':'M'])));}
 assert(companion.visible&&companion.material.color.equals(purchasedColor));checks++;
 const saved=JSON.parse(JSON.stringify(adapter.snapshot()));adapter.reset();adapter.apply(saved);assert.deepEqual(adapter.snapshot(),saved);
}
adapter.apply({...adapter.snapshot(),hidden:true,e3ng_mods:{schema:'e3ng-mods-v1',base:'reinforced',cable:'cable-hole'}});assert(adapter.e3ngMods.entries.every(r=>!r.mesh.visible&&!r.host.node.visible));
for(const bad of [null,[],{schema:'e3ng-mods-v1',base:'reinforced',cable:'stock',unknown:true},{schema:'wrong',base:'stock',cable:'stock'},{schema:'e3ng-mods-v1',base:'missing',cable:'stock'}]){
 const before=adapter.snapshot();assert.throws(()=>adapter.apply({...before,e3ng_mods:bad}));assert.deepEqual(adapter.snapshot(),before);
}
adapter.reset();assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
const old={...adapter.snapshot()};delete old.e3ng_mods;adapter.apply(old);assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
assert.throws(()=>attachE3NGMods({...normal,packet:{model:{sha256:'0'.repeat(64)}}},{scene:new THREE.Group()}));assert.throws(()=>validateE3NGMods({schema:'e3ng-mods-v1',base:'stock',cable:'no'}));
// A late inner failure occurs after native pose/visibility and palette writes.
// The outer source-color adapter can display source RGB while storing a custom
// palette, so restoring only the snapshot cannot restore the displayed colors.
const {attachSourceMaterialDisplay}=await import('../site/viewer/source-assembly-runtime/source-material-display.mjs');
const display=attachSourceMaterialDisplay(adapter),innerApply=normal.apply;
let lateRejectChecks=0;
for(const colorMode of ['source','palette'])for(const choice of alternatives.slice(0,4)){
 display.reset();
 display.apply({...display.snapshot(),pose:.025,hidden:false,palette:{M:'#22eec1',A:'#c12eee'},source_material_display:colorMode,e3ng_mods:{schema:'e3ng-mods-v1',...choice}});
 const before=display.snapshot(),beforeInner=normal.snapshot(),beforeColors=materials.map(r=>r.material.color.toArray());
 const beforeEntries=adapter.e3ngMods.entries.map(({mesh,host})=>({
  geometry:mesh.geometry,hostGeometry:host.node.geometry,visible:mesh.visible,hostVisible:host.node.visible,
  matrix:mesh.matrix.elements.slice(),world:mesh.matrixWorld.elements.slice(),
  hostMatrix:host.node.matrix.elements.slice(),hostWorld:host.node.matrixWorld.elements.slice()
 }));
 if(colorMode==='source')assert(materials.some(r=>!r.material.color.equals(new THREE.Color(before.palette[r.role]))),'Source RGB must differ from the stored custom palette for this regression');
 const lateError=Error('Injected late native-mate rejection');let innerCalls=0,sawMutatedPose=false,sawRestoredOriginal=false,sawMutatedColors=false;
 const attempted={...before,pose:-.04,palette:{M:'#eecc00',A:'#0055ff'},source_material_display:colorMode==='source'?'palette':'source',e3ng_mods:{schema:'e3ng-mods-v1',base:choice.base==='stock'?'reinforced':'stock',cable:choice.cable==='stock'?'cable-hole':'stock'}};
 normal.apply=next=>{
  innerApply(next);innerCalls++;
  if(innerCalls===1){
   // The original fixture commits pose and writes all current materials before
   // this throw. The replacement adapter has not run its visibility update yet.
   sawMutatedPose=normal.snapshot().pose===attempted.pose&&adapter.e3ngMods.entries.every(({host},i)=>host.node.matrix.elements[12]!==beforeEntries[i].hostMatrix[12]);
   sawRestoredOriginal=adapter.e3ngMods.entries.every(({host})=>host.node.visible);
   sawMutatedColors=materials.every((r,i)=>r.material.color.toArray().some((v,k)=>v!==beforeColors[i][k]));
   throw lateError;
  }
 };
 try{assert.throws(()=>display.apply(attempted),error=>error===lateError,'Preserve the initial rejection after a successful rollback');}
 finally{normal.apply=innerApply;}
 assert(sawMutatedPose&&sawRestoredOriginal&&sawMutatedColors,'Failure injection must happen after native visibility, pose and material mutation');
 assert.equal(innerCalls,2,'Reapply exactly the last accepted inner state');
 assert.deepEqual(normal.snapshot(),beforeInner,'Restore inner pose/palette snapshot');
 assert.deepEqual(display.snapshot(),before,'Restore selected mods, pose, palette and outer source-color mode');
 assert.deepEqual(materials.map(r=>r.material.color.toArray()),beforeColors,'Restore exact displayed RGB, including hidden stock and replacement materials');
 for(const [i,{spec,mesh,host}]of adapter.e3ngMods.entries.entries()){
  const previous=beforeEntries[i],selected=choice[spec.control]===spec.choice;
  assert.equal(mesh.geometry,previous.geometry);assert.equal(host.node.geometry,previous.hostGeometry);
  assert.equal(mesh.visible,selected);assert.equal(mesh.visible,previous.visible);
  assert.equal(host.node.visible,!selected);assert.equal(host.node.visible,previous.hostVisible,'Selected replacement must keep its original hidden after rejection');
  assert.deepEqual(mesh.matrix.elements,previous.matrix);assert.deepEqual(mesh.matrixWorld.elements,previous.world);
  assert.deepEqual(host.node.matrix.elements,previous.hostMatrix);assert.deepEqual(host.node.matrixWorld.elements,previous.hostWorld);
 }
 assert(root.visible,'Successful rollback must leave the previous assembly displayed');
 assert(companion.visible&&companion.material.color.equals(purchasedColor),'Purchased companion must remain untouched');
 lateRejectChecks++;
}
display.reset();assert.deepEqual(display.snapshot().e3ng_mods,defaultE3NGMods());
console.log(JSON.stringify({passed:true,late_reject_transactions:lateRejectChecks,color_modes:['source','palette'],restored:['inner state','mod selections','stock/replacement visibility','pose matrices','geometry identity','exact displayed material colors','purchased companion'],scope:'Small synthetic controller fixture; no asset loading, model parsing or native job.'}));
console.log(JSON.stringify({passed:true,combinations:4,forward_reverse_pose_transactions:checks,save_load:true,native_reset:true,scope:'Source-bound replacement selection, companion preservation, motion ownership and state validation. Actual geometry and browser inspections are separate.'}));
