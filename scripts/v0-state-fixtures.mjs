// State/selection fixtures only: these small keyed meshes do not prove CAD fit.
import * as THREE from '../site/viewer/vendor/three.module.js';
import {poseDelta} from '../site/viewer/v0_adapter.mjs';
import {tophatTransform} from '../site/viewer/v0-tophat.mjs';
export function fixtureProfile(machine_id){return {machine_id,display_reference_xyz_mm:[60,67,4],display_limits_mm:{X:[0,120],Y:[0,120],Z:[0,120]},sampled_clearance_limits_mm:{X:[0,119],Y:[0,118],Z:[0,119]},nozzle_tip_mm:[0,-25,174],bed_top_world_z_mm:170,bed_surface_min_xy_mm:[-60,-92],head_group:'V0_Toolhead',appearance:{storage_key:'v0-test-'+machine_id,palette_defaults:{base:'#101113',accent:'#cc0a0d',frame:'#0e0f11'}}}}
export function makeV0Fixture(registry,profile){
 const scene=new THREE.Scene(),nodes=new Map(),records=new Map(),modules=new Map(),geometry=new THREE.BoxGeometry(.001,.001,.001);
 const part=key=>{const node=new THREE.Group();node.userData.part_key=key;node.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#888888'})));return node};
 for(const o of registry.options)for(const key of [...o.replace_keys,...o.attachments.flatMap(s=>s.stock_key?[s.stock_key]:[])])if(!nodes.has(key)){const node=part(key);nodes.set(key,node);records.set(key,{motion:'fixed',group:'V0_Frame',source:{assembly_path:[]}});scene.add(node)}
 // Distinguish an accelerometer removal from replacement and ordinary stock.
 const sensor=part('fixture-stock-adxl');nodes.set(sensor.userData.part_key,sensor);records.set(sensor.userData.part_key,{motion:'xy',group:'V0_Toolhead',source:{assembly_path:['MiniSB ADXL Mount - Generic:1']}});scene.add(sensor);
 for(const o of registry.options)for(const s of o.attachments)if(s.module){if(!modules.has(s.module))modules.set(s.module,{scene:new THREE.Group()});const model=modules.get(s.module);for(const key of s.keys)if(!model.scene.children.some(n=>n.userData.part_key===key))model.scene.add(part(key))}
 let pose=[...profile.display_reference_xyz_mm],doorAngle=0,tophatAngle=0,flexible=true,enclosure=true,chainShift=[0,0,0];
 const adapter={nodes,records,getPose:()=>[...pose],setPose(value){poseDelta(profile,value);pose=['x','y','z'].map(a=>Number(value[a]));return {belts_visible:flexible,chain_visible:flexible,within_sampled_clearance_envelope:profile.sampled_clearance_limits_mm?true:null}},door:{getAngle:()=>doorAngle},tophat:{getAngle:()=>tophatAngle},setDoorAngle:v=>{doorAngle=v},setTophatAngle(v,pivot){tophatTransform(v,pivot);tophatAngle=v},setFlexibleVisible:v=>{flexible=v},setEnclosureVisible:v=>{enclosure=v},setPalette:()=>{},setChainEndpointShift:v=>{chainShift=[...v]},getFlags:()=>({flexible,enclosure,chainShift})};
 return {scene,adapter,modules,loadModule:async id=>{if(!modules.has(id))throw Error('Missing fixture module: '+id);return modules.get(id)},dispose(){geometry.dispose();for(const n of nodes.values())n.traverse(c=>c.material?.dispose());for(const m of modules.values())m.scene.traverse(c=>c.material?.dispose())}};
}
export function* modStates(registry,slots,index=0,value={}){
 if(index===slots.length){yield value;return}
 const slot=slots[index][0],choices=['stock',...(slot==='accelerometer'?['none']:[]),...registry.options.filter(o=>o.slot===slot&&o.id!=='stock').map(o=>o.id)];
 for(const choice of choices)yield*modStates(registry,slots,index+1,{...value,[slot]:choice});
}
export function conflicts(registry,state){return registry.options.some(o=>state[o.slot]===o.id&&(Object.entries(o.requires||{}).some(([k,v])=>state[k]!==v)||Object.entries(o.conflicts||{}).some(([k,v])=>v.includes(state[k]))))}
