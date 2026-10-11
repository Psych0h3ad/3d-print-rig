// Pinned native-source contract + software fixtures, not a CAD clearance test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {v0NativeInstalledId,v0NativeModelHash,v0NativeDependencyHash,v0NativeDisplayLimits,v0NativeRangeText,v0NativeStateProfile,assertV0NativeInstalledSelection,guardV0NativeInstallations,guardV0NativeAdapter,assertV0NativePlayback} from '../site/viewer/v0-native-installed-gate.mjs';
import {installationsModule,stateModule} from './v0-state-test-runtime.mjs';
import * as THREE from '../site/viewer/vendor/three.module.js';
const {createV0Installations}=installationsModule;
const {stockV0Mods,validateV0State,v0ConfigurationSchema,createV0StateRestorer}=stateModule;
const catalog=JSON.parse(await fs.readFile(new URL('../site/V0_INSTALLATIONS.json',import.meta.url),'utf8'));
// An explicit frozen patch permits pre-catalog integration tests without editing
// production catalogs. Normal no-argument source/release checks require the row.
if(process.argv[2]){const patch=JSON.parse(await fs.readFile(process.argv[2],'utf8'));Object.assign(catalog.sources,patch.append_sources);catalog.machines[patch.machine_id].options=catalog.machines[patch.machine_id].options.filter(o=>o.id!==v0NativeInstalledId).concat(patch.append_options);}
const registry=catalog.machines.voron_v02r1_120,option=registry.options.find(o=>o.id===v0NativeInstalledId);
assert(option,'Missing mandatory native V0 installed option');
const profile=structuredClone(option.runtime_gate.source_profile_snapshot),mods={...stockV0Mods(),...option.requires,toolhead:option.id};
const keys=new Set([...option.replace_keys,...option.runtime_gate.mandatory_preserved_stock_keys,option.installation.source_carriage_key]);
for(const key of registry.native_alternatives?.excluded_keys||[])keys.add(key);
const manifest={machine_id:profile.machine_id,parts:[...keys].map(key=>({key}))};
const receipts=Object.fromEntries(Object.entries(option.runtime_gate.machine_files).filter(([k])=>k.endsWith('.json')).map(([k,v])=>[k,v.sha256]));
receipts['model.glb']=v0NativeModelHash(profile.machine_id);
for(const [name,dep]of Object.entries(option.runtime_gate.source_dependencies))receipts['module:'+name]=dep.model.decoded_sha256;
const context={registry:{...registry,sources:catalog.sources},manifest,stockProfile:structuredClone(profile),receipts};
assert.equal(v0NativeModelHash('voron_v02_120'),'da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9');
assert.equal(v0NativeModelHash('unknown_machine'),undefined);
assert.equal(v0NativeDependencyHash('missing'),undefined);
const checked=assertV0NativeInstalledSelection({...context,mods});
assert.deepEqual(checked.display_limits_mm,option.installation.display_limits_mm);assert.deepEqual(checked.display_limits_mm.X,[30,90]);assert.deepEqual(checked.display_limits_mm.Y,[20,100]);const maxZ=checked.display_limits_mm.Z[1];assert(maxZ>0&&maxZ<=120);
assert.equal(v0NativeRangeText(checked.display_limits_mm),'X 30–90.00 / Y 20–100.00 / Z 0–116.76','Display labels use the source-reviewed registered region rather than the old Z120');
assert.equal(v0NativeRangeText({...checked.display_limits_mm,Z:[0,55.125]},', '),'X 30–90.00, Y 20–100.00, Z 0–55.13','Range formatting derives values without changing installation geometry or proof');
assert.equal(checked.verified_physical_printer,false);assert.equal(checked.continuous_clearance_verified,false);
assert.equal(assertV0NativeInstalledSelection({...context,mods:stockV0Mods()}),null);
let negatives=0;
function reject(mutator){const value=structuredClone({...context,mods});mutator(value);assert.throws(()=>assertV0NativeInstalledSelection(value));negatives++;}
for(const name of ['assembly_manifest.json','machine_profile.json','model.glb','module:v0_carriage_display'])reject(c=>{c.receipts[name]='0'.repeat(64)});
for(const key of ['nozzle_tip_mm','source_to_world_translation_mm','display_reference_xyz_mm','bed_surface_min_xy_mm'])reject(c=>{c.stockProfile[key][0]+=.01});
reject(c=>{c.manifest.machine_id='voron_v02_120'});
reject(c=>{c.stockProfile.xy_belt_width_mm=9});
reject(c=>{c.registry.sources[option.attachments[0].module].files['model.glb'].decoded_sha256='0'.repeat(64)});
reject(c=>{c.registry.sources[option.attachments[0].module].files['parts.json'].sha256='0'.repeat(64)});
reject(c=>{c.registry.sources.v0_carriage_display.metadata_sha256='0'.repeat(64)});
const row=c=>c.registry.options.find(o=>o.id===option.id);
reject(c=>{row(c).attachments[0].keys.pop()});
reject(c=>{row(c).attachments[0].translation_mm[2]+=.01});
reject(c=>{row(c).attachments[0].roles.fan_3010='accent'});
reject(c=>{row(c).attachments[0].preserve_optical_materials=false});
reject(c=>{row(c).replace_keys.pop()});
reject(c=>{row(c).nozzle_tip_mm[2]+=.01});
reject(c=>{row(c).installation.display_limits_mm.Y=[0,120]});
reject(c=>{row(c).runtime_gate.display_limits_mm.X=[0,120]});
reject(c=>{row(c).runtime_gate.verified_physical_printer=true});
reject(c=>{row(c).runtime_gate.display_region_evidence.head_PTFE_harness_complete=true});
reject(c=>{row(c).runtime_gate.native_body_review.continuous_clearance=true});
reject(c=>{row(c).hardware_assembled=false});
reject(c=>{c.mods.accelerometer='stock'});
reject(c=>{c.manifest.parts=c.manifest.parts.filter(p=>p.key!==option.runtime_gate.mandatory_preserved_stock_keys[0])});
reject(c=>{c.registry.options.find(o=>o.slot==='carriage'&&o.id==='stock').attachments[0].translation_mm[0]+=.01});
const limits=v0NativeDisplayLimits(mods,profile.display_limits_mm);limits.X[0]=0;
assert.deepEqual(v0NativeDisplayLimits(mods,profile.display_limits_mm).X,[30,90]);assert.deepEqual(profile.display_limits_mm.X,[0,120]);
// Real production composition and restorer with keyed material/movement fixtures.
const scene=new THREE.Scene(),nodes=new Map(),records=new Map();
for(const key of keys){const node=new THREE.Group();node.userData.part_key=key;node.add(new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshStandardMaterial({color:'#778899'})));scene.add(node);nodes.set(key,node);records.set(key,{motion:'xy',group:'V0_Toolhead',source:{assembly_path:[]}});}
let pose=[...profile.display_reference_xyz_mm];
const adapter={nodes,records,getPose:()=>[...pose],setPose:value=>{pose=Array.isArray(value)?[...value]:['x','y','z'].map(a=>value[a]);return pose},setTophatAngle:()=>{},tophat:{getAngle:()=>0}};
function moduleFixture(module){const root=new THREE.Group(),all=new Set(registry.options.flatMap(o=>o.attachments.filter(a=>a.module===module).flatMap(a=>a.keys)));for(const key of all){const group=new THREE.Group();group.userData.part_key=key;const nested=new THREE.Group();nested.add(new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshStandardMaterial({color:'#778899',transparent:key==='logo_diffuser',opacity:key==='logo_diffuser'?.42:1})));group.add(nested);root.add(group);}return {scene:root};}
const controller=await createV0Installations({scene,adapter,profile,registry,loadModule:async module=>moduleFixture(module)});
guardV0NativeInstallations(controller,context);guardV0NativeAdapter(adapter,controller);
const saved=(selection,xyz)=>({schema:v0ConfigurationSchema,machine_id:profile.machine_id,mods:selection,pose:xyz,palette:{base:'#ff0033',accent:'#00ffcc',frame:null},enclosure:true,belts:true,grid:false,door_angle_deg:0,tophat_angle_deg:0});
profile.stock_display_limits_mm=structuredClone(profile.display_limits_mm);
const restorer=createV0StateRestorer({profile:structuredClone(profile),registry,installations:controller,commit:value=>{profile.display_limits_mm=v0NativeDisplayLimits(controller.getState(),option.runtime_gate.source_profile_snapshot.display_limits_mm);profile.display_reference_xyz_mm=[...(controller.getState().toolhead===option.id?option.installation.display_reference_xyz_mm:option.runtime_gate.source_profile_snapshot.display_reference_xyz_mm)];if(value){adapter.setPose(value.pose);controller.setPose(value.pose);controller.setPalette(value.palette);}}});
async function restore(value){const checked=validateV0State({profile:v0NativeStateProfile(option.runtime_gate.source_profile_snapshot,value?.mods),registry},value);return restorer.restore(checked);}
await restore(saved(mods,[30,20,0]));assert.throws(()=>assertV0NativePlayback(controller));
for(const xyz of [[90,100,maxZ],[60,60,maxZ/2],[30,100,0],[90,20,maxZ],option.installation.display_reference_xyz_mm]){adapter.setPose(xyz);controller.setPose(xyz);const delta=xyz.map((n,i)=>n-profile.display_reference_xyz_mm[i]);const r=controller.roots.get(option.id)[0];assert(r.wrapper.position.distanceTo(r.origin.clone().add(new THREE.Vector3(delta[0]/1000,0,-delta[1]/1000)))<1e-12);}
for(const xyz of [[0,20,0],[30,0,0],[91,20,0],[30,101,0],[30,20,maxZ+1],[30,20,NaN],[30,20,'0']]){const before=adapter.getPose();assert.throws(()=>adapter.setPose(xyz));assert.deepEqual(adapter.getPose(),before);assert.throws(()=>validateV0State({profile:option.runtime_gate.source_profile_snapshot,registry},saved(mods,xyz)));negatives++;}
assert.deepEqual(validateV0State({profile,registry},saved(stockV0Mods(),[120,0,120])).pose,[120,0,120],'Stock file validation uses its original limits while candidate is displayed');
const r=controller.roots.get(option.id)[0],findMesh=key=>{let mesh;r.model.traverse(n=>{if(!n.isMesh)return;let p=n;while(p&&!p.userData.part_key)p=p.parent;if(p?.userData.part_key===key)mesh=n});return mesh};
for(const palette of [{base:'#ff0033',accent:'#00ffcc'},{base:'#00ffcc',accent:'#ff0033'},{base:'#ff0033',accent:'#00ffcc'},{}]){controller.setPalette(palette);assert.equal(findMesh('fan_3010').material.color.getHexString(),'778899');assert.equal(findMesh('logo_diffuser').material.opacity,.42);if(palette.base)assert.equal(findMesh('hotend_mount').material.color.getHexString(),palette.base.slice(1));}
assert.equal(r.wrapper.visible,true);for(const key of option.replace_keys)assert.equal(nodes.get(key).visible,false);
await restore(saved(stockV0Mods(),[120,0,120]));assert.equal(controller.getNativeInstallationGate(),null);assert.doesNotThrow(()=>assertV0NativePlayback(controller));assert.equal(r.wrapper.visible,false);assert.deepEqual(profile.display_limits_mm,{X:[0,120],Y:[0,120],Z:[0,120]});
await restore(JSON.parse(JSON.stringify(saved(mods,[30,20,0]))));assert.equal(r.wrapper.visible,true);
await restore(saved(mods,option.installation.display_reference_xyz_mm));assert(r.wrapper.position.distanceTo(r.origin)<1e-12,'Native reset returns the original installed transform');
// A rejected stale source leaves the existing candidate/stock state intact.
const before=controller.getState();const stale=context.receipts['model.glb'];context.receipts['model.glb']='0'.repeat(64);await assert.rejects(controller.setState(mods));context.receipts['model.glb']=stale;assert.deepEqual(controller.getState(),before);
await controller.setState(stockV0Mods());assert.equal(controller.getNativeInstallationGate(),null);controller.dispose();
console.log(JSON.stringify({passed:true,negative_cases:negatives,scope:'Pinned source contract and production controller/material/save fixtures only; no source-solid, full-route, browser or continuous-fit certification.'}));
