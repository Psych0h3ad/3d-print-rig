import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import * as THREE from '../site/viewer/vendor/three.module.js';
const moduleURL=new URL('../site/viewer/v0-installations.mjs',import.meta.url);
const code=(await fs.readFile(moduleURL,'utf8')).replace("from 'three'",`from '${new URL('../site/viewer/vendor/three.module.js',import.meta.url).href}'`).replace(/from '\.\/v0_adapter\.mjs[^']*'/u,`from '${new URL('../site/viewer/v0_adapter.mjs',import.meta.url).href}'`);
const {validateV0Mods,installationMatrix,createV0Installations,v0Slots}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const catalog=JSON.parse(await fs.readFile(new URL('../site/V0_INSTALLATIONS.json',import.meta.url),'utf8'));
let combinations=0,rejected=0;
for(const registry of Object.values(catalog.machines)){
 const choices=Object.fromEntries(v0Slots.map(([k])=>[k,['stock',...(k==='accelerometer'?['none']:[]),...registry.options.filter(o=>o.slot===k&&o.id!=='stock').map(o=>o.id)]]));
 function* states(i=0,state={}){if(i===v0Slots.length){yield state;return}const slot=v0Slots[i][0];for(const id of choices[slot])yield*states(i+1,{...state,[slot]:id})}
 for(const state of states()){const incompatible=registry.options.some(o=>state[o.slot]===o.id&&(Object.entries(o.requires||{}).some(([k,v])=>state[k]!==v)||Object.entries(o.conflicts||{}).some(([k,v])=>v.includes(state[k]))));if(incompatible){assert.throws(()=>validateV0Mods(registry,state),/取付条件/);rejected++}else{assert.deepEqual(validateV0Mods(registry,state),state);combinations++}}
 const older={accelerometer:'stock',strain_relief:'stock',handles:'stock',tophat:'stock'};assert.deepEqual(validateV0Mods(registry,older),{toolhead:'stock',bed:'stock',carriage:'stock',...older});
 for(const o of registry.options){assert.equal(new Set(o.replace_keys).size,o.replace_keys.length);for(const a of o.attachments){assert(Math.abs(installationMatrix(a).determinant()-1)<1e-12);if(a.module)assert(catalog.sources[a.module].metadata_sha256.match(/^[a-f0-9]{64}$/))}}
 assert.throws(()=>validateV0Mods(registry,{accelerometer:'made-up',strain_relief:'stock',handles:'stock',tophat:'stock'}));
}
assert.equal(combinations,864);assert.equal(rejected,576);
// Matrix orientation is checked against native CAD coordinates, including bolts.
const v=new THREE.Vector3(.0115,0,-.0125).applyMatrix4(installationMatrix({rotation_xyz_deg:[0,90,0],translation_mm:[119,-12.5,252]}));
assert(v.distanceTo(new THREE.Vector3(.119,.2405,0))<1e-12);
const scene=new THREE.Scene(),bolt=new THREE.Group();bolt.userData.part_key='bolt';bolt.visible=false;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshStandardMaterial({color:'#aaaaaa'}));bolt.add(mesh);scene.add(bolt);
const adapter={nodes:new Map([['bolt',bolt]]),records:new Map([['bolt',{motion:'xy',group:'V0_Toolhead',source:{assembly_path:['MiniSB ADXL Mount - Generic:1']}}]]),getPose:()=>[0,0,0]},profile={display_reference_xyz_mm:[0,0,0]};
const registry={options:[{id:'handle',slot:'handles',replace_keys:['bolt'],attachments:[{stock_key:'bolt',rotation_xyz_deg:[0,0,0],translation_mm:[1,2,3],motion:'fixed',role:'hardware'}]}]};
const controller=await createV0Installations({scene,adapter,profile,registry,loadModule:async()=>{throw Error('unused')}});
const state={accelerometer:'none',strain_relief:'stock',handles:'handle',tophat:'stock'};await controller.setState(state);assert(!bolt.visible);const rows=controller.roots.get('handle');assert.equal(rows.length,1);assert(rows[0].model.children[0].visible,'A hidden source bolt must still appear in its new mounting location');
controller.setPose([100,80,50]);assert(rows[0].wrapper.visible);assert.equal(rows[0].wrapper.position.x,.001);controller.setPalette({base:'#ff0000'});assert.equal(rows[0].model.children[0].children[0].material.color.getHexString(),'aaaaaa');assert.equal(mesh.material.color.getHexString(),'aaaaaa');
await Promise.all([controller.setState(state),controller.setState({...state,handles:'stock'})]);assert.equal(controller.getState().handles,'stock');assert(!rows[0].wrapper.visible);assert.equal(controller.roots.size,1);controller.dispose();assert.equal(controller.roots.size,0);
console.log('V0 installations: 864 valid / 576 rejected configurations, saved-state migration, native rotations, hidden-source bolt copies, motion, hardware colors and rapid selection recovery passed.');
