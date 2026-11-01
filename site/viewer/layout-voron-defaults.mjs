// The eight default startup recipes extracted from the frozen normal viewers.
// No UI, optional configuration, replacement geometry or alternate-head load.
import * as THREE from './vendor-r180/three.module.js';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=319442cce47f582793a9';
import {loadExternalComponent} from './component-assets.mjs?v=a912f0a87d5f3993e9ad';
import {appearanceRole} from './appearance-role.mjs?v=977c4d1e134e7fe27a0e';
import {layoutDefaultSourcePins} from './layout-default-source-pins.mjs?v=40ec0e1e7e69deb4b586';
const site=new URL('../',import.meta.url),point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
function release(root){const g=new Set(),m=new Set(),t=new Set();root.traverse(n=>{if(n.isMesh){g.add(n.geometry);for(const a of [].concat(n.material)){m.add(a);for(const v of Object.values(a))if(v?.isTexture)t.add(v)}}});for(const v of [...g,...m,...t])v.dispose();root.removeFromParent();root.clear()}
function cloneMaterials(root){root.traverse(n=>{if(!n.isMesh)return;const source=[].concat(n.material);n.material=Array.isArray(n.material)?source.map(m=>m.clone()):n.material.clone();for(const m of [].concat(n.material)){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}})}
function colorRows(root,meta,palette){const rows=new Map(meta.parts.map(p=>[String(p.key),p]));root.traverse(n=>{if(!n.isMesh)return;let q=n;while(q&&!rows.has(String(q.userData?.part_key)))q=q.parent;const key=q?.userData?.part_key??n.userData?.partKey??n.name.match(/^P(.+?)__/)?.[1]??n.name,row=rows.get(String(key));if(!row)throw Error('Layout default part identity missing: '+key);const role=appearanceRole(row);n.userData.layoutMaterialAudit={key:String(key),role,palette,roleRule:'appearanceRole exact source meta',sourceName:row.name};if(palette[role])for(const m of [].concat(n.material))m.color.set(palette[role])})}
export async function loadVoronDefaultLayout(id,{signal,onProgress=()=>{}}={}){
 const root=new THREE.Group();root.name='validated_default_'+id;const assets=[],components=[],cleanups=[],progressOptions={document:null,navigator:null,onUpdate:onProgress,preferPublicAssets:true};
 const options={signal,progressOptions};let manifest,profile,configuration,details={},active=true;
 async function json(rel){
  signal?.throwIfAborted();const expected=layoutDefaultSourcePins[rel];if(!expected)throw Error('Unpinned default metadata: '+rel);
  const r=await fetch(new URL(rel,site),{signal,cache:'no-cache'});if(!r.ok)throw Error('Default metadata unavailable: '+rel);
  const bytes=new Uint8Array(await r.arrayBuffer()),sha256=await hash(bytes);
  if(bytes.length!==expected.bytes||sha256!==expected.sha256)throw Error('Default metadata changed: '+rel);
  assets.push({path:rel,bytes:bytes.length,sha256});return JSON.parse(new TextDecoder().decode(bytes));
 }
 async function asset(spec){
  if(!spec)throw Error('Missing registered default asset');signal?.throwIfAborted();let meta,gltf;
  if(spec.external){const loaded=await loadExternalComponent(new GLTFLoader(),spec,import.meta.url,options);meta=loaded.meta;gltf=loaded.gltf;assets.push({component:spec.component_id,files:spec.files,external:spec.external})}
  else {
   meta=await json(spec.meta);const parser=new GLTFLoader();
   gltf=await loadModel({parseAsync:async(buffer,path)=>{assets.push({path:spec.glb,bytes:buffer.byteLength,sha256:await hash(buffer)});const g=await parser.parseAsync(buffer,path);root.add(g.scene);return g}},new URL(spec.glb,site).href,onProgress,{...options,...(spec.modelOptions||{})});
  }
  root.add(gltf.scene);cloneMaterials(gltf.scene);signal?.throwIfAborted();
  if(!spec.external)components.push(Object.freeze({path:spec.meta,root:gltf.scene,meta,metadata:Object.freeze({...assets.find(a=>a.path===spec.meta)}),model:Object.freeze({...assets.find(a=>a.path===spec.glb)})}));
  return {root:gltf.scene,meta,gltf};
 }
 try{
  if(id==='siboor_v24_350'){
   const {createV24Adapter}=await import('./v24_adapter.mjs?v=c1618d21979653eb97f2'),{alphaNativeHostModelOptions}=await import('./trinity-alpha-host-extensions.mjs?v=f7582b68d6b42495a896'),{ProbeMountSelection}=await import('./probe-mounts.js?v=517d139912b21c017b1b');
   manifest=await json('machines/'+id+'/assembly_manifest.json');profile=await json('machines/'+id+'/machine_profile.json');
   const base=await asset({meta:'machines/'+id+'/assembly_manifest.json',glb:'machines/'+id+'/model.glb',modelOptions:alphaNativeHostModelOptions(id)}),adapter=createV24Adapter(base.root,manifest,profile),probes=await json('V24_PROBES.json');
   if(probes.probes[0].id!=='stock_panasonic'||probes.probes[0].module)throw Error('V24 native default probe changed');
   const selection=new ProbeMountSelection(probes,async()=>{throw Error('Default must not request an alternate probe')},(keys,hidden)=>{for(const key of keys){const n=adapter.nodes.get(key);if(!n)throw Error('V24 default probe identity missing');n.visible=!hidden}});await selection.apply('stock_panasonic');
   adapter.setFlexibleVisible(true);adapter.setEnclosureVisible(true);adapter.setPalette({});const out=adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
   if(!out.atReference)throw Error('V24 native reference mismatch');configuration=(profile.available_configurations?.[0]?.id||'stock')+'__stock_panasonic';details={reference:profile.display_reference_xyz_mm,nativeHead:true,defaultDiscoInstalled:false};
  } else if(/^voron_trident_(250|300|350)$/.test(id)){
   const {createTridentMotion}=await import('./trident-motion.mjs?v=77312c6bfbf6c7e7563d'),{headPlan}=await import('./head-assembly.js?v=workspace-belts-1'),{baselineReference,baselineLimits,baselineResetPose,NATIVE_BASELINE_SOURCE}=await import('./baseline-native-datum.mjs?v=b86b6ff7d71bab3c1117'),{stockGantryVisibility}=await import('./monolith-machine.js?v=df2e59657f9bfb35dd9e');
   profile=await json('machines/'+id+'/machine_profile.json');const catalog=await json('machines/'+id+'/configurations.json'),heads=await json('TOOLHEAD_CONFIGURATIONS.json'),datum=await json(NATIVE_BASELINE_SOURCE.file),v=structuredClone(catalog.variants[0]);
   const binding=datum.baselines.find(r=>r.machine===id&&r.source_variant===v.id);if(!binding)throw Error('Missing accepted native default head datum');v.native_reference_92=binding;v.fit={...v.fit,nozzle_mm:[...binding.nozzle_native_machine_mm]};configuration=v.id;
   const motion=createTridentMotion(profile),base=await asset(profile.base_assets);manifest=base.meta;motion.register(base.root,base.meta);
   const plan=headPlan(v),gantryId='trident_r2_gantry_'+profile.size_mm,cache=new Map(),entries=[];
   async function part(key){if(cache.has(key))return cache.get(key);const a=await asset(heads.base_assets[key]??catalog.assets[key]??heads.assets[key]);motion.register(a.root,a.meta);cache.set(key,a);return a}
   const gantry=await part(gantryId);gantry.root.visible=true;
   const head=await part(plan.base);head.root.position.copy(point(plan.translation));const hide=new Set(plan.hidden);head.root.traverse(n=>{if(n.isMesh){const key=n.userData.part_key??n.name;n.visible=!hide.has(key)}});
   for(const m of plan.modules){const a=await part(m.id);a.root.position.copy(point(m.translation_mm));const hidden=new Set(m.hidden_keys??[]);a.root.traverse(n=>{if(n.isMesh)n.visible=!hidden.has(n.userData.part_key??n.name)})}
   for(const a of [base,...cache.values()]){colorRows(a.root,a.meta,{base:'#24272c',accent:'#e32636',frame:'#25282d'});a.root.traverse(n=>{if(n.isMesh)entries.push([String(n.userData.part_key??n.name),n])})}
   const visibility=stockGantryVisibility(new Map(entries));visibility.install(v);
   const reference=baselineReference(profile,v),stockReference=[...profile.display_reference_xyz_mm],drop=v.fit.bed_reference_drop_mm||0;
   profile.display_limits_mm=baselineLimits(profile.display_limits_mm,stockReference,reference,v);motion.setReference(reference);motion.setBedReferenceDrop(drop);
   const reset=baselineResetPose(reference,drop),out=motion.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,reset[i]])),{flexibleVisible:true,toolheadReference:true});visibility.update();
   details={reference,reset,bedReferenceDrop:drop,pose:out,headPlan:{base:plan.base,translation:plan.translation,hidden:[...plan.hidden],modules:plan.modules},nativeDatum:binding,defaultDiscoInstalled:false};
  } else if(/^siboor_trident_(300|350)$/.test(id)){
   const {loadSiboorAssembly}=await import('./siboor-machine.mjs?v=6798640b4fb7f0a4815f'),{createBedChain}=await import('./bed-chain.mjs?v=5c6ddd46ac13e6974c73'),{setupFlexible}=await import('./flexible.js?v=37fd0f2d1bdfe5ac356f'),{createPrinterBelts}=await import('./printer-gantry.mjs');
   const [meta,routes,g,endstops,colors,catalog]=await loadSiboorAssembly(id,options);manifest=meta;root.add(g.scene);g.scene.add(endstops.scene);cloneMaterials(g.scene);profile={machine_id:id,source:meta.source};
   const v=catalog.variants[0];if(v.gantry!=='siboor_awd'||v.toolhead!=='stealthburner'||v.hotend!=='rapido2_uhf'||v.extruder!=='cw2'||v.modules.length||v.head_translation_mm.some(x=>x!==0))throw Error('SIBOOR native default recipe changed');configuration=v.id;
   const rows=new Map(meta.parts.map(p=>[String(p.key),p])),parts=new Map(),meshes=[];const removed=new Set(v.removed_stock_keys);
   const membership=new Map(['base','accent','frame'].flatMap(role=>colors.groups[role].map(key=>[String(key),role]))),palette={base:'#24272c',accent:'#e32636',frame:'#25282d'},cnc=new Set(colors.cnc_keys??[]),drop=v.fit.bed_reference_drop_mm||0;
   g.scene.traverse(n=>{if(!n.isMesh)return;const key=String(n.userData.part_key??n.name.slice(1).split('__')[0]),row=rows.get(key);n.userData.partKey=key;n.userData.originalKey=key;n.userData.stock=true;parts.set(key,n);meshes.push(n);n.visible=!removed.has(key)&&!['P480__Switch_Housing','P408__Switch_Housing'].includes(n.name);if(row?.motion==='z')n.position.y=-drop/1000;const role=n.userData.appearance_role??membership.get(key);n.userData.layoutMaterialAudit={key,role:role??(cnc.has(key)?'cnc':null),palette,roleRule:'COLOR_OPTIONS source membership and explicit per-leaf role',sourceName:row?.name??null};if(palette[role])for(const m of [].concat(n.material))m.color.set(palette[role]);else if(cnc.has(key))for(const m of [].concat(n.material)){m.color.set('#24272c');m.metalness=.75;m.roughness=.32}});
   const bedChain=createBedChain(g.scene,meta);for(const e of bedChain.entries)e.mesh.userData.bedChain=true;
   const flexible=setupFlexible(root,meshes,meta,routes),route=flexible.update(0,0,drop,true),chain=bedChain.update(drop,true),belts=createPrinterBelts(parts);belts.update(v,0,0,true);
   const registration=meta.motion_preview.endstop_registration,reference=[registration.switches.X.cad_reference_display_coordinate_mm,registration.switches.Y.cad_reference_display_coordinate_mm,0];
   details={reference,bedReferenceDrop:drop,route,chain,nativeHead:true,defaultDiscoInstalled:false};
  } else throw Error('Unknown extracted Voron default: '+id);
  signal?.throwIfAborted();root.updateMatrixWorld(true);
  return {root,manifest,profile,inspection:Object.freeze({components:Object.freeze(components),active:()=>active}),source:{normalSourceRevision:'182cf109acf3fa867927bb017b9705e8b7dac68143e322197a4e3cf517d42391',machineId:id,configuration,assets,details,recipe:'Frozen normal viewer default, source-derived modules/visibility/native pose; optional accessories and alternate heads unloaded',source:manifest.source??profile.source},dispose:()=>{active=false;for(const f of cleanups)f();release(root)}};
 }catch(error){release(root);throw error}
}
