// Actual materials with frozen source-identity expectations. This regression
// census does not prove every native leaf against every author's STL. The eight
// corrected anonymous rail stops bind f76aa287 [a]_railstops_x8.stl to 120 R1.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createMicronAdapter} from '../site/viewer/micron-adapter.mjs';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {micronHardwareColors} from '../site/viewer/micron-native-materials.mjs';
import {machineChoices} from '../site/viewer/machines.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const micronRoleContract={
 'micron_r1_120':{manifest_sha256:'0fd62cc618db12a608123368ee063fe72a556138d8761f88beeaa02789a7d577',parts:1074,roles:{
  base:[
   'm120_00000','m120_00001','m120_00002','m120_00003','m120_00029','m120_00074','m120_00075','m120_00076',
   'm120_00077','m120_00103','m120_00148','m120_00149','m120_00150','m120_00151','m120_00218','m120_00221',
   'm120_00222','m120_00223','m120_00224','m120_00291','m120_00302','m120_00313','m120_00324','m120_00335',
   'm120_00342','m120_00373','m120_00404','m120_00435','m120_00518','m120_00519','m120_00520','m120_00523',
   'm120_00524','m120_00525','m120_00548','m120_00571','m120_00635','m120_00636','m120_00679','m120_00680',
   'm120_00691','m120_00694','m120_00695','m120_00716','m120_00719','m120_00720','m120_00758','m120_00759',
   'm120_00783','m120_00784','m120_00796','m120_00807','m120_00818','m120_00829','m120_00836','m120_00837',
   'm120_00838','m120_00839','m120_00871','m120_00872','m120_00877','m120_00882','m120_00887','m120_00894',
   'm120_00897','m120_00900','m120_00903','m120_00906','m120_00909','m120_00912','m120_00915','m120_00918',
   'm120_00921','m120_00924','m120_00927','m120_00930','m120_00933','m120_00936','m120_00941','m120_00946',
   'm120_00951','m120_00956','m120_00961','m120_00966','m120_00971','m120_00976','m120_00981','m120_00986',
   'm120_00991','m120_00996','m120_01001','m120_01006','m120_01011','m120_01016','m120_01025','m120_01027',
   'm120_head_01323','m120_head_01417','m120_head_01418','m120_head_01419','m120_head_01420','m120_head_01421','m120_head_01442','m120_head_01443',
   'm120_head_01444','m120_head_01446','m120_head_01449','m120_head_01450',
  ],
  accent:[
   'm120_00058','m120_00132','m120_00178','m120_00251','m120_00304','m120_00306','m120_00315','m120_00317',
   'm120_00326','m120_00328','m120_00337','m120_00339','m120_00345','m120_00348','m120_00376','m120_00379',
   'm120_00407','m120_00410','m120_00438','m120_00441','m120_00517','m120_00522','m120_00634','m120_00637',
   'm120_00638','m120_00641','m120_00683','m120_00684','m120_00685','m120_00686','m120_00687','m120_00688',
   'm120_00689','m120_00690','m120_00692','m120_00693','m120_00711','m120_00712','m120_00713','m120_00714',
   'm120_00715','m120_00717','m120_00718','m120_00835','m120_00840','m120_00861','m120_head_01354','m120_head_01355',
   'm120_head_01441','m120_head_01447','m120_head_01448',
  ],
  frame:[
   'm120_00341','m120_00372','m120_00403','m120_00434','m120_00464','m120_00465','m120_00466','m120_00467',
   'm120_00468','m120_00469','m120_00470','m120_00471','m120_00484','m120_00499','m120_00526','m120_00549',
   'm120_00572','m120_00573',
  ],
 }},
 'micron_plus_r1_180':{manifest_sha256:'d135e8c7d7f3b0f1f7d69b863e9836905e21cdc2193e0eaa9cde15798cb08a64',parts:1512,roles:{
  base:[
   'm180_00030','m180_00031','m180_00070','m180_00071','m180_00110','m180_00111','m180_00150','m180_00151',
   'm180_00268','m180_00276','m180_00278','m180_00280','m180_00285','m180_00287','m180_00289','m180_00292',
   'm180_00316','m180_00317','m180_00318','m180_00319','m180_00323','m180_00324','m180_00325','m180_00326',
   'm180_00334','m180_00335','m180_00336','m180_00337','m180_00340','m180_00341','m180_00344','m180_00345',
   'm180_00354','m180_00361','m180_00367','m180_00416','m180_00421','m180_00446','m180_00447','m180_00456',
   'm180_00465','m180_00470','m180_00475','m180_00477','m180_00478','m180_00484','m180_00494','m180_00502',
   'm180_00514','m180_00538','m180_00549','m180_00557','m180_00559','m180_00564','m180_00570','m180_00576',
   'm180_00620','m180_00621','m180_00628','m180_00629','m180_00636','m180_00637','m180_00644','m180_00645',
   'm180_00652','m180_00657','m180_00662','m180_00667','m180_00672','m180_00673','m180_00680','m180_00681',
   'm180_00688','m180_00689','m180_00696','m180_00697','m180_00704','m180_00709','m180_00714','m180_00719',
   'm180_00720','m180_00727','m180_00728','m180_00735','m180_00736','m180_00743','m180_00744','m180_00751',
   'm180_00756','m180_00761','m180_00766','m180_00771','m180_00772','m180_00779','m180_00780','m180_00787',
   'm180_00788','m180_00795','m180_00796','m180_00803','m180_00808','m180_00813','m180_00818','m180_00830',
   'm180_00831','m180_00847','m180_00849','m180_00855','m180_00856','m180_00857','m180_00858','m180_00861',
   'm180_00906','m180_00918','m180_00919','m180_00920','m180_00921','m180_00922','m180_00968','m180_00981',
   'm180_00982','m180_00983','m180_00984','m180_00985','m180_01031','m180_01044','m180_01045','m180_01046',
   'm180_01047','m180_01050','m180_01095','m180_01120','m180_01147','m180_01174','m180_01201','m180_01251',
   'm180_01252','m180_01285','m180_01286','m180_01323','m180_01417','m180_01418','m180_01419','m180_01420',
   'm180_01421','m180_01442','m180_01443','m180_01444','m180_01446','m180_01449','m180_01450','m180_01493',
   'm180_01494','m180_01527','m180_01536','m180_01542','m180_01565','m180_01589','m180_01597','m180_01605',
   'm180_01613','m180_01657','m180_01658','m180_01661','m180_01662','m180_01712','m180_01713','m180_01716',
   'm180_01717','m180_01749','m180_01765','m180_01766',
  ],
  accent:[
   'm180_00036','m180_00039','m180_00076','m180_00079','m180_00116','m180_00119','m180_00156','m180_00159',
   'm180_00265','m180_00266','m180_00267','m180_00271','m180_00272','m180_00273','m180_00277','m180_00279',
   'm180_00281','m180_00282','m180_00286','m180_00290','m180_00291','m180_00293','m180_00320','m180_00321',
   'm180_00338','m180_00339','m180_00348','m180_00349','m180_00355','m180_00356','m180_00368','m180_00622',
   'm180_00630','m180_00638','m180_00646','m180_00653','m180_00658','m180_00663','m180_00668','m180_00674',
   'm180_00682','m180_00690','m180_00698','m180_00705','m180_00710','m180_00715','m180_00721','m180_00729',
   'm180_00737','m180_00745','m180_00752','m180_00757','m180_00762','m180_00767','m180_00773','m180_00781',
   'm180_00789','m180_00797','m180_00804','m180_00809','m180_00814','m180_00819','m180_00832','m180_00846',
   'm180_00848','m180_01117','m180_01118','m180_01144','m180_01145','m180_01171','m180_01172','m180_01198',
   'm180_01199','m180_01354','m180_01355','m180_01441','m180_01447','m180_01448','m180_01533','m180_01537',
   'm180_01538','m180_01539','m180_01540','m180_01541','m180_01543','m180_01544','m180_01560','m180_01561',
   'm180_01562','m180_01563','m180_01564','m180_01566','m180_01567','m180_01617','m180_01618','m180_01619',
   'm180_01667','m180_01668','m180_01669','m180_01670','m180_01742','m180_01745',
  ],
  frame:[
   'm180_00033','m180_00073','m180_00113','m180_00153','m180_00160','m180_00161','m180_00162','m180_00163',
   'm180_00164','m180_00165','m180_00166','m180_00167','m180_00369','m180_00370','m180_00395','m180_00396',
   'm180_00397','m180_00398','m180_01219','m180_01220','m180_01254','m180_01310',
  ],
 }},
};
const ids=['micron_r1_120','micron_plus_r1_180'];
const codePaths=['scripts/audit_micron_colors.mjs','scripts/test_appearance_roles.mjs',
 'site/viewer/appearance-role.mjs','site/viewer/palette-controller.mjs',
 'site/viewer/micron-adapter.mjs','site/viewer/micron-native-materials.mjs',
 'site/viewer/micron-belts.mjs','site/viewer/micron-flexible.mjs',
 'site/viewer/micron-flexible-pins.mjs','site/viewer/micron-tube-routes.mjs',
 'site/viewer/v0-belts.mjs','site/viewer/bed-chain.mjs',
 'site/viewer/vendor/GLTFLoader.js','site/viewer/vendor/three.module.js'];
const umbilicalKey='m180_01768';

export function expectedMicronRoles(id){
 const contract=micronRoleContract[id];assert(contract,`Unreviewed Micron registration ${id}`);
 const expected=new Map();
 for(const [role,keys]of Object.entries(contract.roles))for(const key of keys){
  assert(!expected.has(key),`Duplicate source expectation ${id}/${key}`);expected.set(key,role);
 }
 return expected;
}

// A classifier returning null must not make an uncolored printed leaf pass.
export function assertMicronRoles(manifest,records){
 const contract=micronRoleContract[manifest.machine_id],expected=expectedMicronRoles(manifest.machine_id);
 assert.equal(manifest.parts.length,contract.parts,'Changed source census requires exact leaf review');
 assert.equal(new Set(manifest.parts.map(p=>p.key)).size,manifest.parts.length,'Duplicate source leaf');
 assert.equal(records.size,manifest.parts.length,'Missing or unregistered actual source leaves');
 const counts={base:0,accent:0,frame:0,protected:0},partKeys=new Set(manifest.parts.map(p=>p.key));
 for(const p of manifest.parts){
  assert(records.has(p.key),`Missing actual source leaf ${manifest.machine_id}/${p.key}`);
  const role=expected.get(p.key)||null;
  assert.equal(records.get(p.key).appearance_role||null,role,`${manifest.machine_id}/${p.key} source role must be ${role||'protected'}`);
  counts[role||'protected']++;
 }
 for(const key of expected.keys())assert(records.has(key)&&partKeys.has(key),`Missing reviewed printed/frame leaf ${key}`);
 return counts;
}

// Compare every serialized PBR field and exact linear color, including alpha,
// side, normals policy and emissive properties. Only explicit policy changes
// below may differ from the exported source material.
export function materialState(material){
 const json=material.toJSON();delete json.uuid;delete json.metadata;
 return {json,color:material.color.toArray()};
}
export function assertMaterialState(material,expected,label){assert.deepEqual(materialState(material),expected,label);}
function withAppearance(state,{color,metalness,roughness,depthWrite}={}){
 const result=structuredClone(state);
 if(color){result.color=[...color];result.json.color=new THREE.Color().fromArray(color).getHex();}
 if(metalness!==undefined)result.json.metalness=metalness;
 if(roughness!==undefined)result.json.roughness=roughness;
 if(depthWrite!==undefined){if(depthWrite===true)delete result.json.depthWrite;else result.json.depthWrite=depthWrite;}
 return result;
}
function meshKey(mesh){for(let n=mesh;n;n=n.parent)if(n.userData?.part_key)return n.userData.part_key;throw Error('Mesh has no source identity');}
function auditNormals(scene,seen=new WeakSet()){
 let vertices=0,geometries=0,maxUnitError=0,flatShadedWithoutVertexNormals=0;
 scene.traverse(mesh=>{
  if(!mesh.isMesh||seen.has(mesh.geometry))return;seen.add(mesh.geometry);geometries++;
  const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
  assert(p,`${meshKey(mesh)} missing vertices`);
  assert(p.array.every(Number.isFinite),`${meshKey(mesh)} nonfinite geometry`);
  if(!n){
   assert([].concat(mesh.material).every(m=>m.flatShading===true),`${meshKey(mesh)} missing normals without source flat shading`);
   flatShadedWithoutVertexNormals++;return;
  }
  assert.equal(p.count,n.count,`${meshKey(mesh)} missing complete normals`);
  for(let i=0;i<n.count;i++){
   const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i)),error=Math.abs(length-1);
   assert(Number.isFinite(length)&&error<2e-4,`${meshKey(mesh)} nonunit normal ${i}: ${length}`);
   maxUnitError=Math.max(maxUnitError,error);vertices++;
  }
 });return {vertices,geometries,max_unit_error:maxUnitError,flat_shaded_geometries_without_vertex_normals:flatShadedWithoutVertexNormals};
}
function posesFor(profile){
 const ref=profile.display_reference_xyz_mm,axisSamples=['X','Y','Z'].map((a,i)=>{
  const [lo,hi]=profile.display_limits_mm[a];return [...new Set([lo,(lo+hi)/2,ref[i],hi])];
 });
 const forward=[];for(const x of axisSamples[0])for(const y of axisSamples[1])for(const z of axisSamples[2])forward.push([x,y,z]);
 return [ref,...forward,...forward.toReversed(),ref];
}

export async function auditMicronColors(root,outputPath){
 assert(typeof root==='string'&&root.length,'An actual assembled-site root is required');root=path.resolve(root);
 const code_sha256={};for(const relative of codePaths)code_sha256[relative]=sha(await fs.readFile(new URL('../'+relative,import.meta.url)));
 const report={schema:'micron-actual-materials/105',all_passed:false,results:[],failures:[],code_sha256,
  classification_runtime_function_sha256:sha(appearanceRole.toString()),adapter_runtime_function_sha256:sha(createMicronAdapter.toString()),
  node_version:process.version,loader_arguments:process.execArgv,
  scope:'Current GLBs and exact reviewed census; attached materials, purchased PBR, anonymous printed roles, contrasting/reverse palettes, XYZ min/max/mid/reference and rigid native reset. Frozen role census is not a complete source STL/native-solid proof.',
  visual_review:false,cross_browser_rendering_verified:false,native_solid_review:false,full_physical_fit_certified:false,
  remaining_gates:['Parent browser screenshots and rendering review on current integrated code.','Complete author STL-to-native-leaf identity proof beyond the named source-bound railstop fix.','The current adapter does not restore flexible native mesh geometry; rigid reset and printed color reset are checked separately.','Whole-machine/native-solid clearance and other configurations remain separate.']};
 const previousProgressEvent=globalThis.ProgressEvent;
 if(!previousProgressEvent)globalThis.ProgressEvent=class{constructor(type,fields){Object.assign(this,{type},fields)}};
 try{
  const registered=machineChoices.filter(m=>m.available!==false&&m.family==='micron').map(m=>m.id).sort();
  assert.deepEqual(registered,ids.toSorted(),'Every registered Micron needs an exact material contract');
  const catalogBytes=await fs.readFile(path.join(root,'MICRON_MACHINES.json'));
  report.catalog_sha256=sha(catalogBytes);const catalog=JSON.parse(catalogBytes);
  assert.deepEqual(catalog.machines.map(m=>m.id).sort(),registered,'Missing or unregistered actual Micron model');
  for(const id of ids){
   let scene;
   try{
    const dir=path.join(root,'machines',id),manifestBytes=await fs.readFile(path.join(dir,'assembly_manifest.json')),profileBytes=await fs.readFile(path.join(dir,'machine_profile.json'));
    const manifest=JSON.parse(manifestBytes),profile=JSON.parse(profileBytes),contract=micronRoleContract[id];
    const result={id,manifest_sha256:sha(manifestBytes),profile_sha256:sha(profileBytes),passed:false};report.results.push(result);
    assert.equal(manifest.machine_id,id);assert.equal(profile.machine_id,id);
    assert.equal(result.manifest_sha256,contract.manifest_sha256,`${id}: changed source identities need a fresh printed/purchased census, not an old receipt`);
    let modelPath=path.join(dir,'model.glb.gz'),stored;try{stored=await fs.readFile(modelPath)}catch(error){if(error.code!=='ENOENT')throw error;modelPath=path.join(dir,'model.glb');stored=await fs.readFile(modelPath)}
    const raw=modelPath.endsWith('.gz')?gunzipSync(stored):stored;Object.assign(result,{model_path:modelPath,model_stored_sha256:sha(stored),model_sha256:sha(raw)});
    ({scene}=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),''));
    const sourceMeshes=[],manifestKeys=new Set(manifest.parts.map(p=>p.key));
    scene.traverse(mesh=>{if(!mesh.isMesh)return;const key=meshKey(mesh);assert(manifestKeys.has(key),`Unregistered actual mesh ${key}`);for(const [slot,material]of [].concat(mesh.material).entries())sourceMeshes.push({key,mesh,slot,source:materialState(material),sourceMaterial:material,geometry:mesh.geometry});});
    const sourceNormalState=auditNormals(scene),adapter=createMicronAdapter(scene,manifest,profile),expected=expectedMicronRoles(id);
    result.roles=assertMicronRoles(manifest,adapter.records);
    const native=micronHardwareColors[id],rowsByMaterial=new Map(adapter.paletteMaterials.map(r=>[r.material,r]));
    assert.equal(rowsByMaterial.size,adapter.paletteMaterials.length,'Palette shares mutable materials');
    assert.equal(adapter.paletteMaterials.length,sourceMeshes.length,'Missing or duplicated source material slots');
    const actualMaterials=new Set(),meshKeys=new Set(),origins=new Map([...adapter.nodes].map(([key,node])=>[key,{position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}]));
    let aliasPrinted=0,hardware=0,transparent=0,detachedUmbilicalRows=0;
    for(const p of manifest.parts){
     assert.equal(p.source?.repository,'PrintersForAnts/Micron',`${id}/${p.key} unreviewed source`);
     assert.equal(p.source.commit,'f76aa28767211ddfee2e30290aadcea3c45f8513',`${id}/${p.key} unreviewed source revision`);
     if(['base','accent'].includes(expected.get(p.key))&&['SOLID','COMPOUND'].includes(p.name))aliasPrinted++;
    }
    for(const r of sourceMeshes){
     const role=expected.get(r.key)||null,material=[].concat(r.mesh.material)[r.slot];meshKeys.add(r.key);
     assert(!actualMaterials.has(material),'Rendered meshes share mutable materials');actualMaterials.add(material);
     assert.notEqual(material,r.sourceMaterial,'Source material was not isolated');
     const row=rowsByMaterial.get(material),override=native[r.key];
     assert(row||r.key===umbilicalKey,`${id}/${r.key} rendered material is disconnected from palette rows`);
     if(row){assert.equal(row.role,role);assert.deepEqual(row.original.toArray(),override?.color_linear||r.source.color);}else detachedUmbilicalRows++;
     let initial=withAppearance(r.source,{depthWrite:material.transparent?false:r.sourceMaterial.depthWrite});
     if(['base','accent'].includes(role))initial=withAppearance(initial,{metalness:0,roughness:.72});
     if(override){assert.equal(role,null);initial=withAppearance(initial,{color:override.color_linear,metalness:.65,roughness:.45});}
     if(r.key===umbilicalKey){assert.equal(role,null);initial=withAppearance(initial,{color:new THREE.Color('#191b1e').toArray()});}
     assertMaterialState(material,initial,`${id}/${r.key} source material policy`);r.initial=initial;r.role=role;
     if(!role)hardware++;if(material.transparent)transparent++;
    }
    assert.deepEqual([...meshKeys].sort(),[...manifestKeys].sort(),'Every source leaf needs an actual mesh');
    for(const [key,override]of Object.entries(native)){
     const part=manifest.parts.find(p=>p.key===key);assert(part,`Missing native hardware ${id}/${key}`);
     assert.equal(part.source.source_key,override.source_key);assert.equal(part.source.cache_machine,override.cache_machine);
     assert(sourceMeshes.some(r=>r.key===key),`Missing actual native hardware material ${key}`);
    }
    const a={base:'#19ccaa',accent:'#ff7700',frame:'#c0c5cc'},b={base:'#8040ff',accent:'#ccff22',frame:'#202326'},palettes=[profile.appearance.palette_defaults,a,b,a,profile.appearance.palette_defaults,{},b,{}],poses=posesFor(profile),seen=new WeakSet();
    let generatedNormalVertices=0,generatedGeometries=0,maxGeneratedNormalError=0,flatShadedWithoutVertexNormals=0,renderedChecks=0;
    for(const palette of palettes){
     adapter.setPalette(palette);
     const states=sourceMeshes.map(r=>r.role&&palette[r.role]?withAppearance(r.initial,{color:new THREE.Color(palette[r.role]).toArray()}):r.initial);
     for(const xyz of poses){
      adapter.setPose(Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,xyz[i]])));scene.updateMatrixWorld(true);
      for(const [index,r]of sourceMeshes.entries()){
       assertMaterialState([].concat(r.mesh.material)[r.slot],states[index],`${id}/${r.key} attached material at ${xyz}`);renderedChecks++;
      }
      for(const [key,node]of adapter.nodes)assert(node.matrixWorld.elements.every(Number.isFinite),`${id}/${key} nonfinite pose`);
      const n=auditNormals(scene,seen);generatedNormalVertices+=n.vertices;generatedGeometries+=n.geometries;flatShadedWithoutVertexNormals+=n.flat_shaded_geometries_without_vertex_normals;maxGeneratedNormalError=Math.max(maxGeneratedNormalError,n.max_unit_error);
     }
    }
    const ref=profile.display_reference_xyz_mm;adapter.setPose({x:ref[0],y:ref[1],z:ref[2]});adapter.setPalette({});
    for(const [key,node]of adapter.nodes){
     const origin=origins.get(key);assert(node.position.distanceTo(origin.position)<1e-9,`${id}/${key} native position reset`);assert(node.quaternion.angleTo(origin.quaternion)<1e-7,`${id}/${key} native rotation reset`);assert(node.scale.equals(origin.scale),`${id}/${key} native scale reset`);
    }
    const flexibleKeys=new Set([...adapter.flexible.keys,...adapter.belts.keys]);let proceduralResetMeshes=0;
    for(const r of sourceMeshes){
     assertMaterialState([].concat(r.mesh.material)[r.slot],r.initial,`${id}/${r.key} native color reset`);
     if(!flexibleKeys.has(r.key))assert.equal(r.mesh.geometry,r.geometry,`${id}/${r.key} rigid source geometry changed`);else if(r.mesh.geometry!==r.geometry)proceduralResetMeshes++;
     assertMaterialState(r.sourceMaterial,r.source,`${id}/${r.key} source shared PBR was mutated`);
    }
    Object.assign(result,{passed:true,parts:manifest.parts.length,materials:sourceMeshes.length,native_hardware_materials_restored:Object.keys(native).length,
     printed_alias_leaves_checked:aliasPrinted,protected_material_slots_checked:hardware,transparent_material_slots_checked:transparent,
     palette_transitions:palettes.length,poses_per_palette:poses.length,poses_xyz_mm:poses,palettes,rendered_material_checks:renderedChecks,
     source_normals:sourceNormalState,visited_normals:{vertices:generatedNormalVertices,geometries:generatedGeometries,max_unit_error:maxGeneratedNormalError,flat_shaded_geometries_without_vertex_normals:flatShadedWithoutVertexNormals},
     rendering_policy_exceptions:[...(sourceNormalState.flat_shaded_geometries_without_vertex_normals?[{geometries:sourceNormalState.flat_shaded_geometries_without_vertex_normals,reason:'Original export omits vertex normals. GLTFLoader enables flatShading; exact source material policy is preserved. GPU derivative normals and other browser engines need parent review.'}]:[]),...(detachedUmbilicalRows?[{key:umbilicalKey,slots:detachedUmbilicalRows,reason:'Production flexible adapter replaces the palette-row material with a fixed #191b1e cable material; attached mesh is independently checked.'}]:[]),...(transparent?[{slots:transparent,reason:'Production clone disables depthWrite on transparent source materials; transparency, opacity and other PBR remain exact.'}]:[])],
     rigid_native_reset_verified:true,original_printed_colors_restored:true,flexible_native_geometry_reset_verified:proceduralResetMeshes===0,procedural_meshes_at_reset:proceduralResetMeshes});
   }catch(error){report.failures.push({id,message:error.message});}
   finally{scene?.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of [].concat(n.material))m.dispose()}});globalThis.gc?.();}
  }
 }catch(error){report.failures.push({id:'registration_or_catalog',message:error.message});}
 finally{if(!previousProgressEvent)delete globalThis.ProgressEvent;}
 report.all_passed=report.failures.length===0&&report.results.length===ids.length&&report.results.every(r=>r.passed);
 if(outputPath)await fs.writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
 assert(report.all_passed,`Micron material audit failed: ${report.failures.map(r=>r.id+': '+r.message).join('; ')}`);
 return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await auditMicronColors(process.argv[2],process.argv[3]);console.log(JSON.stringify(report));
}
