// Lifecycle/integration only: actual 508 packet owners and matrices, THREE Groups,
// THREE tiny triangles on TWO purchased prototypes and ONE printed skirt.
// No GLTFLoader, actual model buffers, shape/fit oracle or native-clearance claim.
// Run with node --max-old-space-size=128 --v8-pool-size=1; --report is optional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';

const args=process.argv.slice(2), option=name=>{
  const i=args.indexOf(name);if(i<0)return null;
  assert(args[i+1]&&!args[i+1].startsWith('--'),`Missing ${name} value`);return args[i+1];
};
for(let i=0;i<args.length;i+=2)assert(['--root','--report'].includes(args[i]),'Unknown option');
const root=path.resolve(option('--root')??fileURLToPath(new URL('../',import.meta.url)));
const reportPath=option('--report'),started=performance.now();
const hash=b=>createHash('sha256').update(b).digest('hex');
const runtime=relative=>pathToFileURL(path.join(root,'site/viewer',relative)).href;
registerHooks({resolve(specifier,context,next){return specifier==='three'
  ? {url:runtime('vendor-r180/three.module.js'),shortCircuit:true}:next(specifier,context);}});
const THREE=await import('three');
const {createAssembly}=await import(runtime('source-assembly-runtime/assembly.mjs'));
const {releaseRoot}=await import(runtime('source-assembly-runtime/resources.mjs'));
const {attachSourceMaterialDisplay}=await import(runtime('source-assembly-runtime/source-material-display.mjs'));
const {initialState,validateState}=await import(runtime('source-assembly-runtime/state.mjs'));
const {sourceControlBounds}=await import(runtime('source-control-bounds.mjs'));
const {e3ngInstallationModel,e3ngInstallationCorrections,correctedE3NGSourceWorlds}=
  await import(runtime('source-assembly-runtime/e3ng-installation-corrections.mjs'));
const {e3ngSkirtFasteners}=await import(runtime('source-assembly-runtime/e3ng-skirt-fastener-data.mjs'));
const {addE3NGSkirtFasteners}=await import(runtime('source-assembly-runtime/e3ng-skirt-fasteners.mjs'));

const packetFile=path.join(root,'site/source-assembly-assets/packet-rh3d_e3ng_v12_235.json');
assert(fs.statSync(packetFile).size<=2*1024*1024,'Bounded packet input required');
const packetBytes=fs.readFileSync(packetFile);
assert.equal(hash(packetBytes),'67703b976a5e3fb4c98453b99c12c56f81f6b6ab65ed949397930d8020c48ece','Fresh explicit 508 fixture review required');
const originalPacket=JSON.parse(packetBytes),packet=structuredClone(originalPacket);
assert.equal(packet.model.sha256,e3ngInstallationModel);assert.equal(packet.parts.length,508);
// Only these geometry controllers are excluded. Keep source_current_collision34,
// private_source_motion172 (including required_motion_axes_by_key), probe state,
// rigid mates, source profile fields and every unchanged source-owner record.
const excluded=['routes','belts191B','source_drive304','source_loom306',
  'source_flex181','source_GT2_189','source_GT2_186'];
const removed=excluded.filter(k=>Object.hasOwn(packet,k));
for(const k of excluded)delete packet[k];
for(const k of Object.keys(originalPacket))if(!excluded.includes(k))
  assert.deepEqual(packet[k],originalPacket[k],`Fixture changed retained source field ${k}`);
assert.deepEqual(Object.keys(packet).sort(),Object.keys(originalPacket).filter(k=>!excluded.includes(k)).sort());
const fixturePacketBefore=JSON.stringify(packet),records=new Map(packet.parts.map(r=>[r.key,r]));
assert.equal(records.size,508);assert.equal(e3ngInstallationCorrections.length,7);
assert.equal(e3ngSkirtFasteners.length,8);
const skirtKey='RH3D-original-front-skirt-190',donorKeys=[...new Set(e3ngSkirtFasteners.map(r=>r.source_key))];
assert.equal(donorKeys.length,2);
const skirtGroups=(packet.visibility_groups??[]).filter(g=>g.keys.includes(skirtKey));
assert(skirtGroups.length>0,'Source skirt group missing');

const inputFiles=['source-assembly-runtime/assembly.mjs','source-assembly-runtime/resources.mjs',
  'source-assembly-runtime/source-material-display.mjs','source-assembly-runtime/state.mjs',
  'source-assembly-runtime/source_current_collision34.mjs','source-assembly-runtime/source_profile_values509.mjs',
  'source-assembly-runtime/e3ng-installation-corrections.mjs','source-assembly-runtime/e3ng-skirt-fasteners.mjs',
  'source-assembly-runtime/e3ng-skirt-fastener-data.mjs'];
const inputHashes=Object.fromEntries(inputFiles.map(f=>[f,hash(fs.readFileSync(path.join(root,'site/viewer',f)))]));
let assertions=0;const events=[],resources=new Map();
function budget(){assert(performance.now()-started<45000,'45 s bounded integration budget');}
function watch(resource,label){assert(!resources.has(resource));const row={label,count:0};
  resources.set(resource,row);resource.addEventListener('dispose',()=>row.count++);return resource;}
function near(actual,expected,label){assert.equal(actual.length,expected.length,label);
  for(let i=0;i<actual.length;i++)assert(Number.isFinite(actual[i])&&Math.abs(actual[i]-expected[i])<2e-12,`${label}[${i}]`);
  assertions++;}
function oneMesh(node){const meshes=[];node.traverse(n=>{if(n.isMesh)meshes.push(n);});assert.equal(meshes.length,1);return meshes[0];}
function effectiveVisible(node){for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;}
function triangle(label){const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));g.setIndex([0,1,2]);
  g.computeBoundingBox();g.computeBoundingSphere();return watch(g,label);}

// A flattened owner scene retains each actual source WORLD matrix. The only
// invented leaves are identity-local lifecycle triangles, not source geometry.
const scene=new THREE.Group();scene.name='508 source-world owner lifecycle fixture';
const originalOwners=new Map(),sourceMeshes=new Map(),sourceMaterialStates=new Map();
const materialState=material=>({color:material.color.toArray(),metalness:material.metalness,
  roughness:material.roughness,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
for(const r of packet.parts){
  const group=new THREE.Group();group.name=THREE.PropertyBinding.sanitizeNodeName(r.node_name??r.key);
  group.userData={part_key:r.key,source_id:r.source_id,source_identity:r.source_identity,lifecycle_fixture:true};
  group.matrix.fromArray(r.matrix);group.matrixAutoUpdate=false;scene.add(group);originalOwners.set(r.key,group);
}
for(const [i,key] of [...donorKeys,skirtKey].entries()){
  const g=triangle(`source geometry ${key}`),m=watch(new THREE.MeshStandardMaterial({
    color:[0x617283,0x938271,0x315f72][i],metalness:i<2?.8:0,roughness:i<2?.24:.7
  }),`superseded source material ${key}`),mesh=new THREE.Mesh(g,m);
  mesh.name=`lifecycle triangle ${key}`;mesh.userData.lifecycle_fixture=true;
  originalOwners.get(key).add(mesh);sourceMeshes.set(key,mesh);sourceMaterialStates.set(key,materialState(m));
  // Model a completed progressive GPU upload: geometry/attributes/bounds remain
  // shared, while CPU arrays are unavailable. No WebGL renderer is constructed.
  if(i<2){for(const a of Object.values(g.attributes))a.array=null;g.index.array=null;}
}
scene.updateMatrixWorld(true);
for(const [key,node]of originalOwners)near(node.matrixWorld.toArray(),records.get(key).matrix,`native owner ${key}`);

// Prove the retained production guard remains live BEFORE building an assembly.
// These negative cases touch metadata only and instantiate no additional scene.
validateState(initialState(packet),packet);
for(const [label,mutate]of [
  ['collision evidence',p=>{delete p.source_current_collision34.evidence;}],
  ['required motion owners',p=>{delete p.private_source_motion172.target_axes_by_key[packet.parts[0].key];}],
  ['source profile values',p=>{p.source_current_collision34.axis_stops[0].UI_resolution_mm*=2;}]
]){const bad=structuredClone(packet);mutate(bad);assert.throws(()=>validateState(initialState(bad),bad),undefined,label);assertions++;}

let inner,assembly;
try{
  inner=createAssembly({scene},packet);assembly=attachSourceMaterialDisplay(inner);
  assert.equal(inner.parts.size,516);assert.equal(inner.rest.size,516);
  assert.equal(inner.installationCompanions.length,8);assert.equal(inner.sourceInstallations.size,7);
  assert.equal(inner.flex,null);assert.equal(inner.sourceBelts,null);assert.equal(inner.sourceDrive,null);
  assert.equal(inner.sourceCompanions,null);assert.equal(inner.sourceHeadLoom,null);assert.equal(inner.routes.length,0);
  for(const {material,key}of inner.materials)watch(material,`isolated runtime material ${key}`);
  assert.equal(inner.materials.length,11,'Three original and eight clone mesh materials');
  assert.equal(new Set(inner.materials.map(r=>r.material)).size,11,'No purchased/printed material aliases');
  assert.equal(assembly.ownedGeometries,inner.ownedGeometries,'Wrapper lost live ownership set');
  assert.equal(assembly.parts,inner.parts);assert.equal(assembly.dispose,inner.dispose);
  for(const [key,node]of originalOwners){assert.equal(inner.parts.get(key).node,node);assert.deepEqual(inner.parts.get(key).record,records.get(key));}
  const groups=[];scene.traverse(n=>{if(n.isGroup&&n.userData.part_key)groups.push(n);});
  assert.equal(groups.length,516);assert.equal(new Set(groups).size,516);
  for(const [key,{node}]of inner.parts)assert.equal(groups.filter(n=>n===node&&n.userData.part_key===key).length,1,`Missing/duplicate registered owner ${key}`);
  const purchased=inner.materials.filter(r=>r.role==='native');assert.equal(purchased.length,10);
  const nativeMaterialState=r=>materialState(r.material);
  const purchasedBaselines=new Map(purchased.map(r=>[r.material,nativeMaterialState(r)]));
  for(const r of purchased){const sourceKey=e3ngSkirtFasteners.find(s=>s.key===r.key)?.source_key??r.key;
    assert.deepEqual(nativeMaterialState(r),sourceMaterialStates.get(sourceKey),'Assembly changed original purchased appearance');}
  const skirtMaterial=inner.materials.find(r=>r.key===skirtKey);assert.equal(skirtMaterial.role,'M');
  const sourceSkirtColor=skirtMaterial.color.toArray();
  for(const spec of e3ngSkirtFasteners){const row=inner.parts.get(spec.key),mesh=oneMesh(row.node),donor=sourceMeshes.get(spec.source_key);
    assert.equal(row.record.kind,'purchased');assert.equal(row.record.material_role,'native');
    assert.deepEqual(row.record.motion_axes,[]);assert.equal(row.node.parent,scene);
    assert.equal(mesh.geometry,donor.geometry,'Must reuse existing GPU geometry');
    assert.equal(mesh.geometry.attributes.position.array,null);assert.equal(mesh.geometry.index.array,null);
    assert.notEqual(mesh.material,donor.material,'Clone material aliases donor');
    assert(inner.materials.some(r=>r.key===spec.key&&r.material===mesh.material&&r.role==='native'));
    near(inner.rest.get(spec.key).world.toArray(),spec.world_m,`clone rest ${spec.key}`);
  }
  function invariant(label){budget();const state=assembly.snapshot();scene.updateMatrixWorld(true);
    assert.equal(inner.parts.size,516);assert.equal(inner.rest.size,516);
    for(const spec of e3ngSkirtFasteners){const node=inner.parts.get(spec.key).node,skirt=inner.parts.get(spec.parent_key).node;
      near(node.matrixWorld.toArray(),spec.world_m,`${label}: fixed clone ${spec.key}`);
      assert.equal(node.visible,skirt.visible,`${label}: clone visible iff skirt`);
      assert.equal(effectiveVisible(node),effectiveVisible(skirt));
      assert.equal(oneMesh(node).geometry,sourceMeshes.get(spec.source_key).geometry);
    }
    for(const correction of e3ngInstallationCorrections){const expected=correction.installed_world_m.slice();
      // Independent translation composition from unchanged source host metadata.
      for(const axis of packet.private_source_motion172.target_axes_by_key[correction.key])
        for(let j=0;j<3;j++)expected[12+j]+=state.review_axes[axis]*packet.private_source_motion172.axes[axis].world_direction[j]*.001;
      near(inner.parts.get(correction.key).node.matrixWorld.toArray(),expected,`${label}: corrected ${correction.key}`);
    }
    for(const r of purchased)assert.deepEqual(nativeMaterialState(r),purchasedBaselines.get(r.material),`${label}: purchased material changed`);
    for(const {count,label:resourceLabel}of resources.values())assert.equal(count,0,`${label}: premature dispose ${resourceLabel}`);
    assert.equal(JSON.stringify(packet),fixturePacketBefore,'Production mutated source packet');
    events.push({label,axes:state.review_axes,probe:state.probe_state,source_material_display:state.source_material_display});
  }
  function apply(state,label){assembly.apply(state);invariant(label);}
  invariant('native corrected source');
  assert.deepEqual(skirtMaterial.material.color.toArray(),sourceSkirtColor);
  for(const palette of [{M:'#00ff40',A:'#f000cc'},{M:'#f000cc',A:'#00ff40'},{M:'#00ff40',A:'#f000cc'}]){
    apply({...assembly.snapshot(),palette,source_material_display:'palette'},'contrasting/reversed palette');
    near(skirtMaterial.material.color.toArray(),new THREE.Color(palette.M).toArray(),'printed skirt palette applied');
  }
  apply({...assembly.snapshot(),source_material_display:'source'},'source color reversal');
  assert.deepEqual(skirtMaterial.material.color.toArray(),sourceSkirtColor);
  for(const group of skirtGroups){
    apply({...assembly.snapshot(),groups:{...assembly.snapshot().groups,[group.id]:false}},`hide ${group.id}`);
    for(const spec of e3ngSkirtFasteners)assert.equal(inner.parts.get(spec.key).node.visible,false);
    const hiddenSaved=JSON.parse(JSON.stringify(assembly.snapshot()));
    apply({...assembly.snapshot(),groups:{...assembly.snapshot().groups,[group.id]:true}},`show ${group.id}`);
    for(const spec of e3ngSkirtFasteners)assert.equal(inner.parts.get(spec.key).node.visible,true);
    apply(hiddenSaved,`saved hidden ${group.id}`);assembly.reset();invariant(`reset visibility ${group.id}`);
    for(const spec of e3ngSkirtFasteners)assert.equal(inner.parts.get(spec.key).node.visible,true);
  }
  for(const probe of ['attached','parked']){
    assembly.reset();invariant(`reset before ${probe}`);
    apply({...assembly.snapshot(),probe_state:probe},`probe ${probe}`);
    for(const axis of ['x','y','z']){
      const base=assembly.snapshot(),bounds=sourceControlBounds(packet,base,axis);
      assert(Number.isFinite(bounds.min)&&Number.isFinite(bounds.max)&&bounds.min<=0&&bounds.max>=0&&bounds.min<bounds.max);
      // Exercise limits, an interior pose and reversal, with other axes zero.
      for(const [event,value]of [['min',bounds.min],['max',bounds.max],['mid',(bounds.min+bounds.max)/2],['reverse-max',bounds.max],['reverse-min',bounds.min],['native',0]])
        apply({...assembly.snapshot(),review_axes:{x:0,y:0,z:0,[axis]:value}},`${probe}/${axis}/${event}`);
    }
    const moved=assembly.snapshot();moved.review_axes.z=sourceControlBounds(packet,moved,'z').max;
    moved.palette={M:'#8800ff',A:'#00ffaa'};moved.source_material_display='palette';
    apply(moved,`saved pose prepare ${probe}`);const saved=JSON.parse(JSON.stringify(assembly.snapshot()));
    assembly.reset();invariant(`native reset ${probe}`);
    assert.deepEqual(assembly.snapshot().review_axes,{x:0,y:0,z:0});
    assert.equal(assembly.snapshot().source_material_display,'source');
    assert.deepEqual(skirtMaterial.material.color.toArray(),sourceSkirtColor);
    apply(saved,`saved pose restore ${probe}`);assert.deepEqual(assembly.snapshot(),saved);
    near(skirtMaterial.material.color.toArray(),new THREE.Color(saved.palette.M).toArray(),'saved printed palette restored');
    assembly.reset();invariant(`final native ${probe}`);
  }
  // Separate helper no-op checks; deliberately DO NOT forge the full collision
  // profile to make an invalid foreign-model/head packet pass createAssembly.
  for(const [label,project]of [['head',p=>{p.head_only_subset=true;}],['other model',p=>{p.model.sha256='0'.repeat(64);}]] ){
    const p=structuredClone(packet);project(p);const noOpRoot=new THREE.Group(),parts=new Map(),rest=new Map(),all=[];
    assert.deepEqual(addE3NGSkirtFasteners({root:noOpRoot,packet:p,parts,rest,all}),[]);
    assert.equal(correctedE3NGSourceWorlds(p).size,0);assert.equal(noOpRoot.children.length,0);
    assert.equal(parts.size,0);assert.equal(rest.size,0);assert.equal(all.length,0);assertions++;events.push({label:`helper no-op: ${label}`});
  }
}finally{
  // Production teardown contract: never call adapter.dispose separately here.
  releaseRoot(scene,assembly??inner);
}
for(const {label,count}of resources.values())assert.equal(count,1,`Resource leak or double disposal: ${label}`);
assert.equal([...resources.keys()].filter(r=>r.isBufferGeometry).length,3);
assert.equal([...resources.keys()].filter(r=>r.isMaterial).length,14);
for(const [relative,expected]of Object.entries(inputHashes))assert.equal(hash(fs.readFileSync(path.join(root,'site/viewer',relative))),expected,'Runtime changed during integration run');
assert.equal(hash(fs.readFileSync(packetFile)),hash(packetBytes));budget();
const report={schema:'e3ng-scene-integration-lifecycle-v1',passed:true,
  source_owners:508,registered_parts:516,corrected_worlds:7,fixed_purchased_clones:8,
  input_packet_sha256:hash(packetBytes),input_hashes:inputHashes,test_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  excluded_geometry_controller_fields:removed,owner_hierarchy:'flattened actual source world-matrix Groups',
  fixture_meshes:3,cpu_released_purchased_prototypes:2,source_guard_negative_cases:3,
  assertion_batches:assertions,events,disposed_geometry_count:3,disposed_material_count:14,
  elapsed_ms:performance.now()-started,
  scope:{production_createAssembly:true,production_source_material_wrapper:true,production_releaseRoot:true,
    full_source_profiles_retained:true,real_model_buffers:false,GPU_rendering:false,geometry_fit:false,
    native_clearance:false,flex_drive_loom_controllers:false,illustrative_latch_wrapper:false,physical_complete:false}};
if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,source_owners:508,registered_parts:516,events:events.length,
  disposed_geometry_count:3,disposed_material_count:14,scope:report.scope}));
