import assert from 'node:assert/strict';
import {register} from 'node:module';
import fs from 'node:fs/promises';
register(new URL('./three-test-loader.mjs',import.meta.url),import.meta.url);
const {createTridentMotion}=await import('../site/viewer/trident-motion.mjs');
const {Group,Mesh,BoxGeometry,MeshBasicMaterial}=await import('../site/viewer/vendor/three.module.js');
const beltFixtures=JSON.parse(await fs.readFile(new URL('./fixtures/trident-custom-bed-joint-belts.json',import.meta.url),'utf8'));
const frontFixture=JSON.parse(await fs.readFile(new URL('./fixtures/trident-front-registration-350.json',import.meta.url),'utf8'));

function fixture(machine){
 const custom=machine.endsWith('_custom')||machine.endsWith('_half_z'),size=machine.includes('500')?500:Number(machine.match(/_(250|300|350)/)[1]);
 const prefix=custom?'voron_trident_350_base':machine+'_base';
 const profile={machine_id:machine,size_mm:size,kinematics:'trident',display_reference_xyz_mm:[size/2,size/2,0],display_limits_mm:{X:[0,size],Y:[0,size],Z:[0,machine.endsWith('_half_z')?125:250]}};
 const metadata={id:custom?'trident_r2_gantry_'+size:prefix,parts:[
  {key:prefix+'_1167',source_leaf:'1167',name:'M5x16 BHCS',source_component:'Frame:1/Frame_Hardware:1/Screws:1/M5x16 BHCS:19',motion:'fixed',motion_axes:[]},
  {key:prefix+'_1038',source_leaf:'1038',name:'Bed cross extrusion',source_component:'Frame:1/Bed Extrusions:1/2020:1',motion:'z'},
  {key:prefix+'_1039',source_leaf:'1039',name:'Bed stem extrusion',source_component:'Frame:1/Bed Extrusions:1/2020:2',motion:'z'},
  {key:'fixed_rail',motion:'fixed'}]};
 if(machine==='voron_trident_350')metadata.parts.push(...structuredClone(frontFixture.parts));
 if(custom){
  Object.assign(metadata,{machine_id:machine,source_baseline:'voron_trident_350',belt_width_mm:6});
  metadata.parts[0].bounds_mm=structuredClone(beltFixtures[machine].joint_bounds_mm);
  // Custom models are a whole gantry+base root. Keep its belt validation active
  // using exact pinned native datum rows, while testing only the bed joint.
  metadata.parts.push(...structuredClone(beltFixtures[machine].parts));
 }
 const root=new Group(),meshes=new Map();
 for(const [i,row]of metadata.parts.entries()){
  const mesh=new Mesh(new BoxGeometry(.001,.001,.001),new MeshBasicMaterial());
  mesh.userData.part_key=row.key;mesh.position.set(.04+i*.002,.12+i*.005,-.18+i*.003);root.add(mesh);meshes.set(row.key,mesh);
 }
 return {profile,metadata,root,meshes,prefix,custom};
}

for(const machine of ['voron_trident_250','voron_trident_300','voron_trident_350','voron_trident_500_custom','voron_trident_350_half_z']){
 const f=fixture(machine),motion=createTridentMotion(f.profile),source=JSON.stringify(f.metadata);
 motion.register(f.root,f.metadata);assert.equal(JSON.stringify(f.metadata),source,'Registration must not rewrite native metadata');
 const origins=new Map([...f.meshes].map(([key,mesh])=>[key,mesh.position.clone()])),limit=f.profile.display_limits_mm.Z[1];
 const relative=f.meshes.get(f.prefix+'_1167').position.clone().sub(f.meshes.get(f.prefix+'_1039').position);
 for(const z of [0,limit/4,limit/2,limit,limit/2,0]){
  motion.setPose({x:f.profile.size_mm/2,y:f.profile.size_mm/2,z});
  for(const leaf of [1167,1038,1039]){
   const key=f.prefix+'_'+leaf,actual=f.meshes.get(key).position,origin=origins.get(key);
   assert(Math.abs(actual.y-origin.y+z/1000)<1e-12,'Bed joint must follow its actual bed mates: '+machine+'/'+key);
   assert.equal(actual.x,origin.x);assert.equal(actual.z,origin.z);
  }
  assert(f.meshes.get(f.prefix+'_1167').position.clone().sub(f.meshes.get(f.prefix+'_1039').position).distanceTo(relative)<1e-12,'Joint separates during reversed Z travel');
  assert.deepEqual(f.meshes.get('fixed_rail').position.toArray(),origins.get('fixed_rail').toArray());
 }
 for(const [key,mesh]of f.meshes)assert.deepEqual(mesh.position.toArray(),origins.get(key).toArray(),'Reset changes native placement');
 // Corrected manifests may already classify the joint as Z; registration is
 // idempotent and still preserves the pinned source rows.
 const corrected=structuredClone(f.metadata);corrected.parts[0].motion='z';
 assert.doesNotThrow(()=>createTridentMotion(f.profile).register(f.root,corrected));
 const badRows=[
  m=>{m.parts[0].name='M5x20 BHCS'},m=>{m.parts[0].source_leaf='1168'},
  m=>{m.parts[0].source_component='Frame:1/Other:1'},m=>{m.parts[0].motion='xy'},
  m=>{m.parts=m.parts.filter(p=>p.source_leaf!=='1167')},m=>{m.parts[1].motion='fixed'},
  m=>{m.parts[2].source_leaf='1040'},m=>{m.parts[2].source_component='Frame:1/Rails:1/2020:2'}];
 if(f.custom)badRows.push(
  m=>{m.source_baseline='voron_trident_300'},m=>{delete m.source_baseline},
  m=>{m.machine_id='voron_trident_350'},m=>{delete m.machine_id},
  m=>{m.id='trident_r2_gantry_300'},m=>{m.parts[0].key=machine+'_base_1167'});
 for(const mutate of badRows){
  const bad=structuredClone(f.metadata);mutate(bad);const adapter=createTridentMotion(f.profile);
  assert.throws(()=>adapter.register(f.root,bad),/identity\/mates changed|source identity changed|size mismatch/);
  assert.equal(adapter.entries.size,0,'Failed registration partially installs a bed joint');
 }
}
console.log('Native Trident bed joint: three stock and two custom source identities, reversed/reset Z, immutable metadata and rejected wrong/missing mates PASS. Fixture motion scope only.');
