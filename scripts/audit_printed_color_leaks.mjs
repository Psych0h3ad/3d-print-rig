// Focused current-controller audit. Inputs are explicit public export paths and
// current-catalog hashes, supplied by the caller; never search model folders.
// node --max-old-space-size=384 --v8-pool-size=1 --expose-gc
//   --loader ./scripts/three-test-loader.mjs scripts/audit_printed_color_leaks.mjs PLAN REPORT
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {createV24Adapter} from '../site/viewer/v24_matrix_adapter.mjs';
import {createMicronAdapter} from '../site/viewer/micron-adapter.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {partKey} from '../site/viewer/head-assembly.js';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {createCrossantAdapter} from '../site/viewer/crossant-adapter.mjs';
import {machineChoices} from '../site/viewer/machines.js';
import {printedColorSourceContracts,assertPrintedColorSourceRegistrations,assertPrintedColorSourceAsset} from './printed-color-source-contracts.mjs';

// Independent, frozen leaf census from Voron-Trident a8628f48. Do not derive
// these expectations from appearanceRole or use a null classifier as a pass.
export const tridentColorLeakLeaves={
 base:'568 650 722 737 742 831 832 904 925 953 956 965 977 980 983 998 1000 1006 1011 1016 1021 1024 1046 1047 1048 1049 1050 1051 1052 1053 1054 1055 1362 1365 1370 1375 1376 1377 1378 1379 1380 1381 1393 1194 1199 1202 1207 1210 1213 1218 1222 1229 1241 1244 1263 1266 1271 1276 1281 1284 1287 1290 1297 1300 1305 1310 1315 1318 1321 1324 1331 1334 1339 1342 1347 1350 1353 1358'.split(' '),
 accent:['837'],
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const defaultPalette=profile=>profile.appearance?.palette_defaults||profile.palette_defaults||{base:'#24272c',accent:'#e32636',frame:'#25282d'};
async function checked(spec){
 assert(spec?.path&&/^[a-f0-9]{64}$/.test(spec.sha256),'Missing explicit path/hash');
 const b=await fs.readFile(spec.path);assert.equal(sha(b),spec.sha256,spec.path+' changed bytes');return b;
}
function catalogPins(value,pins=new Set()){
 if(value&&typeof value==='object'){
  if(/^[a-f0-9]{64}$/.test(value.sha256))pins.add(value.sha256);
  for(const child of Object.values(value))catalogPins(child,pins);
 }
 return pins;
}
function materialState(m){const j=m.toJSON();delete j.uuid;delete j.metadata;delete j.color;return j;}
function poses(profile){
 if(profile.axes){
  const ref=Object.fromEntries(Object.keys(profile.axes).map(a=>[a,0])),forward=[ref];
  for(const [axis,[lo,hi]]of Object.entries(profile.axes))for(const n of [lo,hi,(lo+hi)/2])forward.push({...ref,[axis]:n});
  return [...forward,...forward.toReversed(),ref];
 }
 const ref=profile.display_reference_xyz_mm,forward=[ref];
 for(let i=0;i<3;i++)for(const n of [profile.display_limits_mm['XYZ'[i]][0],profile.display_limits_mm['XYZ'[i]][1],profile.display_limits_mm['XYZ'[i]].reduce((a,b)=>a+b)/2]){
  const p=[...ref];p[i]=n;forward.push(p);
 }
 forward.push(['X','Y','Z'].map(a=>profile.display_limits_mm[a][0]),['X','Y','Z'].map(a=>profile.display_limits_mm[a][1]));
 return [...forward,...forward.toReversed(),ref];
}
export async function auditPrintedColorLeaks(plan,reportPath){
 const code={};for(const file of ['appearance-role.mjs','source-printed-roles.mjs','palette-controller.mjs','micron-native-materials.mjs','appearance.js','v24_matrix_adapter.mjs','micron-adapter.mjs','trident-motion.mjs','vanilla-trident.js','custom-voron.js','community-adapter.mjs','crossant-adapter.mjs'])code[file]=sha(await fs.readFile(new URL('../site/viewer/'+file,import.meta.url)));
 code['audit_printed_color_leaks.mjs']=sha(await fs.readFile(new URL(import.meta.url)));
 code['printed-color-source-contracts.mjs']=sha(await fs.readFile(new URL('./printed-color-source-contracts.mjs',import.meta.url)));
 code['audit_source_printed_colors.mjs']=sha(await fs.readFile(new URL('./audit_source_printed_colors.mjs',import.meta.url)));
 code['test_source_printed_color_roles.mjs']=sha(await fs.readFile(new URL('./test_source_printed_color_roles.mjs',import.meta.url)));
 const report={schema:'printed-color-leaks/1',passed:false,node:process.version,node_arguments:process.execArgv,code_sha256:code,
  scope:'Selected actual exported leaf/material slots with current production classification/motion; independent frozen expectations for 79 Trident leaves per size, the V2.4 spool body, five source-pinned Crossant CPAP parts and eight source-pinned VzBot endcaps. Other printed roles are checked for response, not independently certified against all author STLs. No GPU, browser, native-solid or full-combination certification.',
  catalogs:[],results:[],failures:[],visual_review:false,native_solid_review:false};
 globalThis.ProgressEvent??=class {constructor(type,fields){Object.assign(this,{type},fields)}};
 try{
  assert(Array.isArray(plan.assets)&&plan.assets.length,'No actual assets requested');
  assertPrintedColorSourceRegistrations(machineChoices);
  assert.equal(new Set(plan.assets.map(s=>s.id)).size,plan.assets.length,'Duplicate actual machine');
  const registered=new Set(machineChoices.filter(m=>m.available!==false).map(m=>m.id)),pins=new Set();
  for(const c of plan.catalogs||[]) {catalogPins(JSON.parse(await checked(c)),pins);report.catalogs.push(c);}
  for(const spec of plan.assets){
   let root;
   const result={id:spec.id,passed:false,kind:spec.kind,inputs:{manifest:spec.manifest,profile:spec.profile,model:spec.model}};report.results.push(result);
   try{
    assert(registered.has(spec.id),'Unregistered actual machine '+spec.id);
    for(const pin of [spec.manifest,spec.profile,spec.model,...(spec.additional_models||[]),...(spec.buffers||[]),...(spec.belt_bindings?[spec.belt_bindings]:[])])assert(pins.has(pin.sha256),'Asset is not pinned in supplied current catalogs: '+pin.path);
    const manifest=JSON.parse(await checked(spec.manifest)),profile=JSON.parse(await checked(spec.profile));
    assert.equal(manifest.machine_id,spec.id);assert.equal(profile.machine_id,spec.id);
    let stored=await checked(spec.model),raw=spec.model.path.endsWith('.gz')?gunzipSync(stored):stored;stored=null;
    result.model_sha256=sha(raw);assert.equal(result.model_sha256,spec.model.decoded_sha256);
    const sourceContract=printedColorSourceContracts[spec.id]?assertPrintedColorSourceAsset(spec.id,spec.manifest.sha256,result.model_sha256,manifest):null;
    if(sourceContract)result.source_color_contract=sourceContract;
    let buffer=raw.byteOffset===0&&raw.byteLength===raw.buffer.byteLength?raw.buffer:raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);raw=null;
    if(spec.model.path.endsWith('.gltf')){
     // The production loader uses checked blob URLs for its seven buffers.
     const gltf=JSON.parse(new TextDecoder().decode(buffer)),urls=new Map();
     try{
      assert.equal(gltf.buffers.length,spec.buffers.length);
      for(const pin of spec.buffers){const bytes=await checked(pin);urls.set(path.basename(pin.path),URL.createObjectURL(new Blob([bytes])));}
      const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{const name=url.split('/').at(-1);assert(urls.has(name),'Unregistered glTF buffer');return urls.get(name)});
      root=(await new GLTFLoader(manager).parseAsync(JSON.stringify(gltf),'')).scene;
     }finally{for(const url of urls.values())URL.revokeObjectURL(url);}
    }else root=(await new GLTFLoader().parseAsync(buffer,'')).scene;buffer=null;
    result.additional_models=[];
    for(const pin of spec.additional_models||[]){
     let bytes=await checked(pin);if(pin.path.endsWith('.gz'))bytes=gunzipSync(bytes);
     assert.equal(sha(bytes),pin.decoded_sha256,'Supplement decoded hash');
     root.add((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
     result.additional_models.push(pin);
    }
    const records=new Map(manifest.parts.map(p=>[p.key,p])),source=[],nodes=new Map();
    root.traverse(mesh=>{
     if(!mesh.isMesh)return;let key=partKey(mesh);for(let n=mesh;!records.has(key)&&n;n=n.parent)key=n.userData?.part_key||key;assert(records.has(key),'Unregistered actual leaf '+key);
     if(!nodes.has(key))nodes.set(key,mesh);
     for(const [slot,m]of [].concat(mesh.material).entries())source.push({key,mesh,slot,sourceMaterial:m,color:m.color.clone(),pbr:materialState(m)});
    });
    assert.equal(nodes.size,records.size,'Missing actual model leaves');
    let adapter,setPose,setPalette,roleFor=key=>appearanceRole(records.get(key));
    const trident=spec.kind.startsWith('trident');
    if(trident){
     const revision=manifest.source_commit||manifest.source_repositories?.find(s=>s.repository==='VoronDesign/Voron-Trident')?.commit;
     assert.equal(revision,'a8628f48546948ce1fc15511b7765b7f31f80722');
     // This is the vanilla-trident register/palette path: isolate materials,
     // derive the role per exact source leaf, and drive createTridentMotion.
     root.traverse(mesh=>{if(!mesh.isMesh)return;
      const row=records.get(partKey(mesh));mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
      for(const material of [].concat(mesh.material)){
       if(spec.kind==='trident'){material.side=THREE.DoubleSide;if(row.color?.[3]!=null){material.opacity=row.color[3];material.transparent=row.color[3]<1;}}
       if(material.transparent)material.depthWrite=false;
      }
     });
     adapter=createTridentMotion(profile);adapter.register(root,manifest);setPose=p=>adapter.setPose(p);
     setPalette=palette=>{for(const r of source){const c=palette[appearanceRole(records.get(r.key))];if(c)[].concat(r.mesh.material)[r.slot].color.set(c)}};
    }else if(spec.kind==='v24'){
     // v24-reference isolates every material before constructing its adapter.
     root.traverse(m=>{if(m.isMesh)m.material=Array.isArray(m.material)?m.material.map(x=>x.clone()):m.material.clone()});
     adapter=createV24Adapter(root,manifest,profile);setPose=p=>adapter.setPose(p);setPalette=p=>adapter.setPalette(p);
    }else if(spec.kind==='micron'){
     adapter=createMicronAdapter(root,manifest,profile);setPose=p=>adapter.setPose(p);setPalette=p=>adapter.setPalette(p);
    }else if(spec.kind==='community'){
     adapter=createCommunityAdapter(root,manifest,profile);setPose=p=>adapter.setAxes(p);setPalette=p=>adapter.setPalette(p);roleFor=key=>adapter.records.get(key).appearance_role;
    }else if(spec.kind==='crossant'){
     root.traverse(m=>{if(m.isMesh)m.material=Array.isArray(m.material)?m.material.map(x=>x.clone()):m.material.clone()});
     adapter=createCrossantAdapter(root,manifest,profile,JSON.parse(await checked(spec.belt_bindings)));setPose=p=>adapter.setPose(p);setPalette=p=>adapter.setPalette(p);roleFor=key=>adapter.records.get(key).appearance_role;
    }else throw Error('Unreviewed adapter '+spec.kind);
    const misses=[];
    if(trident)for(const [role,leaves]of Object.entries(tridentColorLeakLeaves))for(const leaf of leaves){
     const key=(spec.kind==='trident_custom'?'voron_trident_350':spec.id)+'_base_'+leaf,p=records.get(key);assert(p&&p.source_leaf===leaf,'Missing frozen printed identity '+key);
     if(appearanceRole(p)!==role)misses.push({key,name:p.name,source_component:p.source_component,expected:role,actual:appearanceRole(p)});
    }
    if(spec.kind==='v24'){
     const p=records.get('v24_01392');assert(p&&p.name==='SOLID'&&p.source.source_key==='01392','Missing original spool holder leaf');
     if(appearanceRole(p)!=='base')misses.push({key:p.key,name:p.name,source_path:p.source_path,expected:'base',actual:appearanceRole(p)});
    }
    const printedExpectations=sourceContract?Object.entries(sourceContract.printed).map(([key,name])=>({key,name,role:'base'})):spec.printed_expectations||[];
    for(const e of printedExpectations){
     const p=records.get(e.key);assert(p&&p.name===e.name,'Missing reviewed source identity '+e.key);
     if(roleFor(e.key)!==e.role)misses.push({...e,actual:roleFor(e.key)});
    }
    result.classification_misses=misses;
    result.printed_leak_witnesses=[];
    result.reviewed_printed_palette_checks=[];
    // Capture attached materials after declared adapter policy, including the
    // fixed Micron purchased-color repairs and procedural cable materials.
    const attached=source.map(r=>({...r,role:roleFor(r.key),material:[].concat(r.mesh.material)[r.slot]}));
    for(const r of attached){r.original=r.material.color.clone();r.initial=materialState(r.material);}
    assert.equal(new Set(attached.map(r=>r.material)).size,attached.length,'Actual leaves share mutable materials');
    const origins=new Map([...(adapter.nodes||nodes)].map(([key,n])=>[key,{n,position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone(),matrix:n.matrix.clone()}]));
    const a={base:'#00e5ff',accent:'#ff2095',frame:'#b9bec4'},b={base:a.accent,accent:a.base,frame:'#202326'};
    const palettes=[a,b,JSON.parse(JSON.stringify(a)),defaultPalette(profile)];
    const sourceColorReset=['micron','community','crossant'].includes(spec.kind);
    if(sourceColorReset)palettes.push({},b,{});
    const sampled=poses(profile);let checks=0;
    for(const palette of palettes){
     setPalette(palette);
     for(const e of printedExpectations)result.reviewed_printed_palette_checks.push({key:e.key,palette,slots:attached.filter(r=>r.key===e.key).map(r=>({slot:r.slot,expected_color:palette[e.role]||'#'+r.original.getHexString(),actual_color:'#'+[].concat(r.mesh.material)[r.slot].color.getHexString()}))});
     for(const miss of misses)result.printed_leak_witnesses.push({key:miss.key,expected_role:miss.expected||miss.role,expected_color:palette[miss.expected||miss.role],actual_slots:attached.filter(r=>r.key===miss.key).map(r=>({slot:r.slot,color:'#'+[].concat(r.mesh.material)[r.slot].color.getHexString()}))});
     for(const xyz of sampled){
      setPose(profile.axes?xyz:Object.fromEntries(['x','y','z'].map((a,i)=>[a,xyz[i]])));root.updateMatrixWorld(true);
      for(const r of attached){
       const material=[].concat(r.mesh.material)[r.slot],expected=r.role&&palette[r.role]?new THREE.Color(palette[r.role]):r.original;
       assert(material.color.equals(expected),spec.id+'/'+r.key+' attached material color leak');checks++;
      }
      for(const n of nodes.values())assert(n.matrixWorld.elements.every(Number.isFinite),'Nonfinite posed part');
     }
     for(const r of attached){
      const current=materialState([].concat(r.mesh.material)[r.slot]),expected=structuredClone(r.initial);
      if(spec.kind==='v24'&&['base','accent'].includes(r.role)){expected.metalness=0;expected.roughness=.72;}
      assert.deepEqual(current,expected,spec.id+'/'+r.key+' purchased/printed PBR policy changed');
     }
    }
    const ref=profile.display_reference_xyz_mm;setPose(profile.axes?Object.fromEntries(Object.keys(profile.axes).map(a=>[a,0])):{x:ref[0],y:ref[1],z:ref[2]});
    if(sourceColorReset)setPalette({});else setPalette(defaultPalette(profile));
    for(const [key,{n,position,quaternion,scale,matrix}]of origins){
     // Procedural belt/tube owners have a separate routing reset scope.
     if(spec.kind==='micron'&&(adapter.flexible.keys.has(key)||adapter.belts.keys.has(key)))continue;
     assert(n.position.distanceTo(position)<1e-8&&n.quaternion.angleTo(quaternion)<1e-7&&n.scale.equals(scale),'Rigid native pose reset');
     if(spec.kind==='community')assert.deepEqual(n.matrix.elements,matrix.elements,'Community native matrix reset');
    }
    for(const r of source){assert(r.sourceMaterial.color.equals(r.color),'Source shared color mutated');assert.deepEqual(materialState(r.sourceMaterial),r.pbr,'Source shared PBR mutated');}
    if(sourceColorReset)for(const r of attached)assert([].concat(r.mesh.material)[r.slot].color.equals(r.original),spec.id+'/'+r.key+' native color reset');
    Object.assign(result,{passed:misses.length===0,parts:records.size,material_slots:attached.length,independently_expected_printed_leaves:trident?79:spec.kind==='v24'?1:printedExpectations.length,
     protected_slots:attached.filter(r=>!['base','accent','frame'].includes(r.role)).length,poses_per_palette:sampled.length,palettes,poses_xyz_mm:sampled,attached_color_checks:checks,
     native_color_reset:sourceColorReset?'exact source colors checked via empty palette':'production UI default palette; empty palette does not restore source colors in this family',serialized_palette_A_B_A:true,rigid_pose_reset:true});
    if(misses.length)throw Error(misses.length+' source-bound printed leaves remain uncolored');
   }catch(error){result.error=error.message;report.failures.push({id:spec.id,message:error.message});}
   finally{root?.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const mat of [].concat(m.material))mat.dispose()}});root=null;globalThis.gc?.();}
   console.log(JSON.stringify({id:result.id,passed:result.passed,error:result.error,material_slots:result.material_slots}));
  }
 }catch(error){report.failures.push({id:'plan',message:error.message});}
 report.passed=report.failures.length===0&&report.results.length===plan.assets.length;
 if(reportPath)await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await auditPrintedColorLeaks(JSON.parse(await fs.readFile(process.argv[2],'utf8')),process.argv[3]);process.exitCode=report.passed?0:1;
}
