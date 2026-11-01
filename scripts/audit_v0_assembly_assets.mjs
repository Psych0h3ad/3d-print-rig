// Actual exported stock assets and the production static-stage controller.
// Native-solid contacts and manual diagram review are separate evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {register} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,list)=>v.startsWith('--')?[...a,[v.slice(2),list[i+1]]]:a,[]));
assert(args.site&&args.report,'--site and --report required');
const site=path.resolve(args.site),viewer=pathToFileURL(site+'/viewer/');
const before=new Map();
async function pin(file){const b=await fs.readFile(file),digest=sha(b);if(before.has(file))assert.equal(digest,before.get(file),'Input changed between reads');else before.set(file,digest);return b;}
async function pinClosure(url){
 const clean=new URL(url);clean.search='';clean.hash='';const file=fileURLToPath(clean);if(before.has(file))return;
 const source=(await pin(file)).toString('utf8');
 assert(vm.SourceTextModule,'Use node --experimental-vm-modules for exact production import closure');
 for(const spec of new vm.SourceTextModule(source).dependencySpecifiers){
  if(spec.startsWith('node:'))continue;
  if(spec==='three'){await pinClosure(new URL('vendor/three.module.js',viewer));continue}
  assert(spec.startsWith('.'),'Unregistered audit dependency: '+spec);await pinClosure(new URL(spec,clean));
 }
}
const stages=JSON.parse(await pin(site+'/V0_ASSEMBLY_STAGES.json'));
await pinClosure(new URL('assembly-workbench-model.mjs',viewer));
const {createAssemblyIndex,createAssemblyProgress,validateAssemblyProgress}=await import(new URL('assembly-workbench-model.mjs',viewer));
assert.deepEqual(Object.keys(stages.machines).sort(),['voron_v02_120','voron_v02r1_120']);
const mapping=args.map?JSON.parse(await pin(path.resolve(args.map))):null;
if(mapping)assert.deepEqual(Object.keys(mapping.machines).sort(),Object.keys(stages.machines).sort());
const threeURL=new URL('vendor/three.module.js',viewer).href;
for(const name of ['vendor/GLTFLoader.js','v0_adapter.mjs','v0-assembly.mjs','v0-installations.mjs','v0-native-installed-gate.mjs','v0-app.js'])await pinClosure(new URL(name,viewer));
await pinClosure(new URL('./audit_v0_native_installation_assets.mjs',import.meta.url));
const {auditGeometry}=await import('./audit_v0_native_installation_assets.mjs');
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c)}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/GLTFLoader.js',viewer));
const {createV0Adapter}=await import(new URL('v0_adapter.mjs',viewer));
const {createV0AssemblyStages}=await import(new URL('v0-assembly.mjs',viewer));
const {createV0Installations}=await import(new URL('v0-installations.mjs',viewer));
const {v0NativeDependencyHash}=await import(new URL('v0-native-installed-gate.mjs',viewer));
const registryData=JSON.parse(await pin(site+'/V0_INSTALLATIONS.json'));
for(const name of ['v0-app.js','v0-assembly.mjs','v0_adapter.mjs','v0-belts.mjs','v0-chain.mjs','v0-door.mjs','v0-tophat.mjs','appearance-role.mjs'])await pin(site+'/viewer/'+name);
await pin(path.resolve(process.argv[1]));
const report={schema:'actual-v0-assembly-stages-v1',passed:false,workers:1,machines:[],source_sha256:{},
 scope:'Actual decoded stock GLBs, manifests and production adapters/controller; cumulative and reversed stages, native transform/material/geometry invariance and exact visibility restoration. Static final poses only. Native-solid contact review and manual diagram inspection are separate.',
 insertion_animation_verified:false,physical_clearance_certified:false};
function state(root){const rows=[];root.updateMatrixWorld(true);root.traverse(n=>{
 const materials=n.material?(Array.isArray(n.material)?n.material:[n.material]):[];
 rows.push({node:n,parent:n.parent,children:[...n.children],position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),matrix:n.matrixWorld.toArray(),geometry:n.geometry,
 materials:[...materials],values:materials.map(m=>[m.color?.getHex(),m.opacity,m.transparent,m.depthWrite,m.metalness,m.roughness,m.emissive?.getHex(),m.emissiveIntensity]),visible:n.visible});
});return rows;}
function unchanged(root,rows,checkVisibility=false,checkGeometryIdentity=true){root.updateMatrixWorld(true);let count=0;root.traverse(()=>count++);assert.equal(count,rows.length);
 for(const r of rows){const n=r.node;assert.equal(n.parent,r.parent);assert.deepEqual(n.children,r.children);assert.deepEqual(n.position.toArray(),r.position);assert.deepEqual(n.quaternion.toArray(),r.quaternion);assert.deepEqual(n.scale.toArray(),r.scale);assert.deepEqual(n.matrixWorld.toArray(),r.matrix);if(checkGeometryIdentity)assert.equal(n.geometry,r.geometry);
 const m=n.material?(Array.isArray(n.material)?n.material:[n.material]):[];assert.deepEqual(m,r.materials);assert.deepEqual(m.map(v=>[v.color?.getHex(),v.opacity,v.transparent,v.depthWrite,v.metalness,v.roughness,v.emissive?.getHex(),v.emissiveIntensity]),r.values);if(checkVisibility)assert.equal(n.visible,r.visible);}
}
function geometryPins(root){const values=[];root.traverse(n=>{if(!n.geometry)return;for(const[k,a]of Object.entries(n.geometry.attributes))values.push([n.uuid,k,sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))]);if(n.geometry.index){const a=n.geometry.index.array;values.push([n.uuid,'index',sha(Buffer.from(a.buffer,a.byteOffset,a.byteLength))])}});return values;}
// Manual/source-occurrence review established these exact slot-nut owners.
// A row count alone must not accept a different, already-visible extrusion.
const seatGroups={
 voron_v02_120:[['00004',['00560','00561','00562','00563'],'frame-preload'],['00012',['00568','00569','00570','00571'],'frame-preload'],['00003',['00564','00565','00566','00567','00631','00632'],'frame-preload'],['00008',['00662','00666','00667'],'upright-nut-check'],['00006',['00686','00690','00691'],'upright-nut-check']],
 voron_v02r1_120:[['00004',['00569','00570','00571','00572'],'frame-preload'],['00012',['00577','00578','00579','00580'],'frame-preload'],['00003',['00573','00574','00575','00576','00652','00653'],'frame-preload'],['00008',['00683','00687','00688'],'upright-nut-check'],['00006',['00707','00711','00712'],'upright-nut-check']],
};
function reviewedSeats(id){const prefix=id==='voron_v02_120'?'v02_':'v02r1_';return seatGroups[id].flatMap(([carrier,parts,preload])=>parts.map(part=>({part_key:prefix+part,carrier_key:prefix+carrier,preload_stage_id:preload}))).sort((a,b)=>a.part_key.localeCompare(b.part_key));}
function displayed(root){let present=false;root?.traverse(n=>{
 if(!n.isMesh||!n.geometry||n.geometry.drawRange.count===0)return;
 for(let p=n;p;p=p.parent)if(p.visible===false)return;
 present=true;
});return present;}
try{
 for(const[id,spec]of Object.entries(stages.machines)){
  const files=mapping?.machines[id]||{model:site+'/machines/'+id+'/model.glb.gz',manifest:site+'/machines/'+id+'/assembly_manifest.json',profile:site+'/machines/'+id+'/machine_profile.json'};
  for(const f of Object.values(files))assert(path.isAbsolute(f),'Explicit public asset paths required');
  const encoded=await pin(files.model),bytes=encoded[0]===0x1f&&encoded[1]===0x8b?gunzipSync(encoded,{maxOutputLength:100_000_000}):encoded;
  const manifestBytes=await pin(files.manifest),profileBytes=await pin(files.profile),manifest=JSON.parse(manifestBytes),profile=JSON.parse(profileBytes);
  assert.equal(sha(bytes),spec.model_sha256);assert.equal(sha(manifestBytes),spec.manifest_sha256);assert.equal(profile.machine_id,id);
  const alternatives=registryData.machines[id].native_alternatives;assert(alternatives,'Native alternatives must be registered');
  assert.equal(alternatives.model_sha256,sha(bytes));assert.equal(alternatives.manifest_sha256,sha(manifestBytes));
  if(spec.profile_sha256)assert.equal(sha(profileBytes),spec.profile_sha256);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));assert(!(glb.buffers||[]).some(b=>b.uri));assert(!(glb.images||[]).some(b=>b.uri));
  const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=new THREE.Scene();scene.add(loaded.scene);
  const geometry=auditGeometry(loaded.scene),adapter=createV0Adapter(loaded.scene,manifest,profile);
  adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
  adapter.setEnclosureVisible(true);adapter.setFlexibleVisible(true);adapter.setDoorAngle(0);adapter.setTophatAngle(0);
  const installed=await createV0Installations({scene,adapter,profile,registry:{...registryData.machines[id],sources:registryData.sources},loadModule:async name=>{
   assert.equal(name,'v0_carriage_display');const source=registryData.sources[name];
   const modelFile=mapping?.modules[name].model||site+'/'+source.glb+'.gz',metadataFile=mapping?.modules[name].metadata||site+'/'+source.metadata;
   const encoded=await pin(modelFile),metadataBytes=await pin(metadataFile);assert.equal(sha(metadataBytes),source.metadata_sha256);
   const decoded=encoded[0]===0x1f&&encoded[1]===0x8b?gunzipSync(encoded):encoded;assert.equal(sha(decoded),v0NativeDependencyHash(name));
   const result=await new GLTFLoader().parseAsync(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength),'');auditGeometry(result.scene);return result;
  }});
  const companions=[...installed.roots.values()].flat().filter(r=>r.wrapper.visible).map(r=>({node:r.wrapper,part_keys:r.option.replace_keys}));
  for(const key of alternatives.excluded_keys)assert.equal(adapter.nodes.get(key).visible,false,'Overlapping alternative remains hidden');
  assert.equal(companions.length,1,'Exact support-omitted stock carriage required');
  assert.deepEqual(spec.seat_display_dependencies?.map(s=>({part_key:s.part_key,carrier_key:s.carrier_key,preload_stage_id:s.preload_stage_id})).sort((a,b)=>a.part_key.localeCompare(b.part_key)),reviewedSeats(id),'Exact reviewed source frame-nut owners required');
  const shown=key=>displayed(adapter.nodes.get(key))||companions.some(c=>c.part_keys.includes(key)&&displayed(c.node));
  const original=state(scene),geometryBefore=geometryPins(scene),visibility=new Map([...adapter.nodes].map(([k,n])=>[k,n.visible]));
  const controller=createV0AssemblyStages({nodes:adapter.nodes,manifest,machine:stages,receipts:{'model.glb':sha(bytes),'assembly_manifest.json':sha(manifestBytes)},companions});
  const workbench=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':sha(bytes),'assembly_manifest.json':sha(manifestBytes),'assembly_stages.json':sha(await pin(site+'/V0_ASSEMBLY_STAGES.json'))}}),progress=createAssemblyProgress(workbench);
  for(const p of manifest.parts){const owner=workbench.owner(p.key);assert(owner.part_keys.includes(p.key));assert.equal(workbench.part(p.key).name,p.name)}
  for(const p of [manifest.parts[0],manifest.parts[Math.floor(manifest.parts.length/2)],manifest.parts.at(-1)])assert(workbench.search(p.key).some(s=>s.id===workbench.owner(p.key).id));
  const sequence=[...spec.stages.map((_,i)=>i),...spec.stages.map((_,i)=>spec.stages.length-1-i),spec.stages.length-1,0,Math.floor(spec.stages.length/2),spec.stages.length-1];
  const poses=[];
  for(const index of sequence){const r=controller.setStage(index),keys=new Set(spec.stages.slice(0,index+1).flatMap(s=>s.part_keys));
   for(const[k,n]of adapter.nodes)assert.equal(n.visible,visibility.get(k)&&keys.has(k),'Cumulative native stage visibility: '+k);
   for(const c of companions)assert.equal(c.node.visible,c.part_keys.some(k=>keys.has(k)),'Support-omitted carriage follows native stage');
   for(const seat of spec.seat_display_dependencies)assert(!shown(seat.part_key)||shown(seat.carrier_key),'Preloaded nut displayed without its receiving source member');
   assert.equal(r.total,spec.stages.length);assert.equal(r.added,spec.stages[index].part_keys.length);unchanged(scene,original);poses.push({index,id:r.id,added:r.added,visible:r.visible_count});
   const shownParts=controller.getDisplayedParts();assert.equal(shownParts.length,r.visible_count);assert.deepEqual(shownParts.map(p=>p.key),controller.getVisibleKeys());
   for(const p of shownParts){assert(keys.has(p.key));for(const n of p.nodes)assert(displayed(n))}
   for(const p of [shownParts[0],shownParts[Math.floor(shownParts.length/2)],shownParts.at(-1)].filter(Boolean))assert.deepEqual(controller.getPartNodes(p.key),p.nodes);
   progress.setStage(r.id);progress.toggle(r.id);assert.deepEqual(validateAssemblyProgress(workbench,JSON.parse(JSON.stringify(progress.snapshot()))),progress.snapshot());
  }
  controller.leave();unchanged(scene,original,true);assert.deepEqual(geometryPins(scene),geometryBefore);
  controller.setStage(0);controller.leave();unchanged(scene,original,true);
  // Source alternatives must not reappear when normal motion or a stock reset
  // recomputes visibility after leaving assembly mode.
  const nativePose=profile.display_reference_xyz_mm,alternativePoses=[];
  for(const axis of ['X','Y','Z']){
   const a=['X','Y','Z'].indexOf(axis),[min,max]=profile.display_limits_mm[axis];
   for(const value of [min,max,(min+max)/2,max,min]){
    const pose=[...nativePose];pose[a]=value;
    adapter.setPose(Object.fromEntries(['x','y','z'].map((key,i)=>[key,pose[i]])));installed.setPose(pose);
    for(const key of alternatives.excluded_keys)assert.equal(adapter.nodes.get(key).visible,false,'Motion exposed overlapping alternative: '+key);
    scene.updateMatrixWorld(true);scene.traverse(n=>assert(n.matrixWorld.elements.every(Number.isFinite),'Nonfinite transformed node'));
    alternativePoses.push({axis,pose});
   }
  }
  adapter.setPose(Object.fromEntries(['x','y','z'].map((key,i)=>[key,nativePose[i]])));installed.setPose(nativePose);
  assert.equal(await installed.setState(installed.getState()),true);unchanged(scene,original,true,false);
  assert.deepEqual(geometryPins(scene),geometryBefore,'Native reset must restore geometry content, including rebuilt belt meshes');
  report.machines.push({machine_id:id,parts:adapter.nodes.size,stages:spec.stages.length,workbench_source_parts:workbench.partCount,workbench_progress_identity:workbench.identity,geometry,model_sha256:sha(bytes),manifest_sha256:sha(manifestBytes),profile_sha256:sha(profileBytes),manual:spec.manual,poses,alternative_poses:alternativePoses,fastener_display_dependencies_checked:spec.seat_display_dependencies.length,restored:true});
  installed.dispose();adapter.belts.entries.forEach(e=>e.node.traverse(n=>n.geometry?.dispose()));
  loaded.scene.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose()});
 }
 for(const[file,pinValue]of before){assert.equal(sha(await fs.readFile(file)),pinValue,'Input changed during actual stage audit');report.source_sha256[path.relative(site,file).replaceAll('\\','/')]=pinValue;}
 report.passed=true;
}catch(e){report.failures=[e.stack||String(e)]}
await fs.mkdir(path.dirname(path.resolve(args.report)),{recursive:true});await fs.writeFile(args.report,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,machines:report.machines.map(m=>({id:m.machine_id,parts:m.parts,stages:m.stages,poses:m.poses.length})),failures:report.failures}));
if(!report.passed)process.exitCode=1;
