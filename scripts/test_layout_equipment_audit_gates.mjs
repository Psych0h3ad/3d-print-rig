// Source regression for both offline release gates. Synthetic corruption only;
// real final assets are audited separately, one CLI at a time. No network/CAD.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {getLayoutEquipment} from '../site/layout/layout-equipment.mjs';
import {DEFINITIONS,PREFIX,arrayReceipt,compareLoadedToGLB,createAuditContext,validateBedOutline,validateBedAttribution,options,sha} from './audit_layout_equipment_geometry.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),reportArg=process.argv.indexOf('--report');
const reportFile=reportArg<0?null:path.resolve(process.argv[reportArg+1]);
const temporary=fs.mkdtempSync(path.join(reportFile?path.dirname(reportFile):os.tmpdir(),'equipment-audit-gates-'));
const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw new Error('Live network forbidden');};
const checks=[];
function test(name,fn){fn();checks.push(name);}
async function asyncTest(name,fn){await fn();checks.push(name);}
try{
 const files=Object.fromEntries(DEFINITIONS.map(([,id,v,name])=>[getLayoutEquipment(id,v).model.path,path.join(temporary,name)]));
 const input=path.join(temporary,'inputs.json');
 const invoke=(script,map,expected)=>{
  const output=path.join(temporary,'should-not-pass.json');fs.writeFileSync(input,JSON.stringify(map));
  const child=spawnSync(process.execPath,['--max-old-space-size=192','--max-semi-space-size=4','--v8-pool-size=1',path.join(root,'scripts',script),
   '--equipment-inputs',input,'--report',output],{encoding:'utf8',timeout:10000,env:{...process.env,UV_THREADPOOL_SIZE:'1',NODE_OPTIONS:''},windowsHide:true});
  assert.ifError(child.error);assert.notEqual(child.status,0);assert.match(child.stdout+child.stderr,expected);assert(!fs.existsSync(output));
 };
 for(const script of ['audit_layout_equipment_geometry.mjs','audit_layout_equipment_assets.mjs']){
  test(script+' rejects malformed map before metadata/body access',()=>invoke(script,{files:{},extra:true},/exact \{files:/));
  test(script+' rejects unregistered map entry',()=>invoke(script,{files:{'other.glb':path.join(temporary,'other.glb')}},/Unregistered equipment audit input/));
  test(script+' rejects relative cache path',()=>invoke(script,{files:{[Object.keys(files)[0]]:'relative.glb'}},/cache path must be absolute/));
  test(script+' rejects missing registration',()=>invoke(script,{files:{[Object.keys(files)[0]]:Object.values(files)[0]}},/Hosted equipment requires an exact input mapping/));
  test(script+' rejects gzip override in otherwise complete map',()=>invoke(script,{files:{...files,[Object.keys(files)[0]+'.gz']:path.join(temporary,'wire.gz')}},/Unregistered equipment audit input/));
  test(script+' rejects JSON override in otherwise complete map',()=>invoke(script,{files:{...files,[PREFIX+'U1_preview_geometry.json']:path.join(temporary,'preview.json')}},/Unregistered equipment audit input/));
 }
 test('unknown, duplicate, raw-bypass and missing options fail',()=>{
  assert.throws(()=>options(['--raw']),/Unknown/);assert.throws(()=>options(['--site']),/Missing/);
  assert.throws(()=>options(['--site','x','--site','y']),/Duplicate/);
 });
 fs.writeFileSync(input,JSON.stringify({files}));
 const context=await createAuditContext({'--equipment-inputs':input});
 test('four decoded paths determine private preview and encoded sibling directory',()=>{
  assert.equal(context.preparedDir,temporary);assert.equal(context.modelDir,temporary);
  assert.equal(Object.keys(context.auditInputFiles).length,0);
 });
 // A synthetic canonical cache exercises the shared transport boundary without
 // reading any final bodies or allowing synthetic metadata into real reports.
 const fixtureSite=path.join(temporary,'site'),cache=path.join(temporary,'private-cache');
 fs.mkdirSync(path.join(fixtureSite,'layout'),{recursive:true});fs.mkdirSync(cache);
 fs.copyFileSync(path.join(root,'site/layout/layout-equipment-transfer.mjs'),path.join(fixtureSite,'layout/layout-equipment-transfer.mjs'));
 const raw=Buffer.from('glTF synthetic transport fixture, deliberately not a valid model'),wire=gzipSync(raw);
 const models=DEFINITIONS.map(([,id,variant,name])=>({id,equipmentVariant:variant,model:{path:PREFIX+name,bytes:raw.length,sha256:sha(raw),
  transfer:{path:PREFIX+name+'.gz',bytes:wire.length,sha256:sha(wire),encoding:'gzip',baseURL:'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/'}}}));
 fs.writeFileSync(path.join(fixtureSite,'layout/layout-equipment.mjs'),`const rows=${JSON.stringify(models)};export const getLayoutEquipment=(id,v)=>rows.find(r=>r.id===id&&r.equipmentVariant===v);`);
 const fixtureMap=path.join(temporary,'fixture-inputs.json');fs.writeFileSync(fixtureMap,JSON.stringify({files:Object.fromEntries(models.map(r=>[r.model.path,path.join(cache,path.basename(r.model.path))]))}));
 for(const row of models){const file=path.join(cache,path.basename(row.model.path));fs.writeFileSync(file,raw);fs.writeFileSync(file+'.gz',wire);}
 const synthetic=await createAuditContext({'--site':fixtureSite,'--equipment-inputs':fixtureMap}),firstRow=models[0],firstFile=path.join(cache,path.basename(firstRow.model.path));
 await asyncTest('four-only maps authenticate both raw and inferred gzip siblings offline',async()=>{
  for(const row of models)assert.deepEqual(await synthetic.readActual(row),raw);
  assert.equal(Object.keys(synthetic.auditInputFiles).length,8);
 });
 await asyncTest('missing inferred gzip cannot fall back to valid decoded GLB',async()=>{
  fs.unlinkSync(firstFile+'.gz');try{await assert.rejects(synthetic.readActual(firstRow),/Actual equipment body missing/);}finally{fs.writeFileSync(firstFile+'.gz',wire);}
 });
 await asyncTest('corrupt inferred gzip rejects before geometry',async()=>{
  const changed=Buffer.from(wire);changed[12]^=1;fs.writeFileSync(firstFile+'.gz',changed);
  try{await assert.rejects(synthetic.readActual(firstRow),/hash differs from source receipt/);}finally{fs.writeFileSync(firstFile+'.gz',wire);}
 });
 await asyncTest('corrupt decoded GLB rejects despite valid gzip sibling',async()=>{
  fs.writeFileSync(firstFile,Buffer.alloc(raw.length,1));
  try{await assert.rejects(synthetic.readActual(firstRow),/hash differs from source receipt/);}finally{fs.writeFileSync(firstFile,raw);}
 });
 // Exact production comparison must reject corruption in every complete array,
 // including an unreferenced vertex that no bounds/pose/triangle sample sees.
 const source={positions:new Float32Array([0,0,0,1,0,0,0,1,0,.2,.2,0]),
  normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),indices:new Uint32Array([0,1,2]),indexed:true,
  groupId:'casing',kind:'casing',material:{pbrMetallicRoughness:{baseColorFactor:[.1,.2,.3,1],metallicFactor:.1,roughnessFactor:.5}}};
 function fixture(){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(source.positions.slice(),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(source.normals.slice(),3));geometry.setIndex(new THREE.BufferAttribute(source.indices.slice(),1));
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(.1,.2,.3),metalness:.1,roughness:.5});
  const node=new THREE.Mesh(geometry,material);node.name='authored__mesh';node.userData={name:'authored / mesh',groupId:'casing',groupKind:'casing'};
  const group=new THREE.Group();group.add(node);return {group,node,dispose:()=>{geometry.dispose();material.dispose();}};
 }
 const actual={meshes:new Map([['authored / mesh',source]])};
 test('source identity survives production GLTF name sanitization',()=>{const f=fixture();try{assert.equal(compareLoadedToGLB(f.group,actual),1);}finally{f.dispose();}});
 for(const [label,mutate,expected]of [
  ['unreferenced position',n=>n.geometry.attributes.position.array[9]+=.01,/complete positions/],
  ['unreferenced normal',n=>n.geometry.attributes.normal.array[9]=.01,/complete normals/],
  ['index buffer',n=>n.geometry.index.array[1]=2,/complete indices/],
  ['datum recenter',n=>n.position.x=.1,/root datum/],
  ['source identity',n=>n.userData.name='unknown',/Unexpected production mesh/],
  ['source group',n=>n.userData.groupId='wrong',/strictEqual|Expected/],
  ['hardware material',n=>n.material.metalness=.3,/production material/]
 ])test('complete production comparison rejects '+label,()=>{const f=fixture();try{mutate(f.node);assert.throws(()=>compareLoadedToGLB(f.group,actual),expected);}finally{f.dispose();}});
 const publicBed=JSON.parse(fs.readFileSync(path.join(root,'site',PREFIX,'U1_BED_OUTLINE.json'),'utf8'));
 for(const field of ['notes','render_reference','svg_interpretation','source_svg'])delete publicBed[field];
 test('source-backed bed contour validation does not require removed internal metadata',()=>assert.equal(Object.keys(validateBedOutline(publicBed)).length,6));
 for(const [field,mutate]of [
  ['contours',b=>b.contours.outer_xy[20][0]+=.01],
  ['mesh',b=>b.mesh.triangles++],
  ['coordinate_contract',b=>b.coordinate_contract.up='-Z'],
  ['hole_bounds',b=>b.hole_bounds[0].min[0]+=.01],
  ['source_asset',b=>b.source_asset.bytes++],
  ['repository_license',b=>b.repository_license.sha256='0'.repeat(64)]
 ])test('source-backed bed contour rejects changed '+field,()=>{const b=structuredClone(publicBed);mutate(b);assert.throws(()=>validateBedOutline(b));});
 for(const field of ['notes','render_reference','svg_interpretation','source_svg'])
  test('public bed rejects retained internal field '+field,()=>{const b=structuredClone(publicBed);b[field]='internal';assert.throws(()=>validateBedOutline(b),/Internal\/non-geometric field/);});
 const bedReceipt=JSON.parse(fs.readFileSync(path.join(root,'site',PREFIX,'U1_BED_SOURCE_RECEIPT.json'),'utf8')),
  bedLicense=fs.readFileSync(path.join(root,'site',PREFIX,'Snapmaker_OrcaSlicer_LICENSE.txt')),
  bedNotices=JSON.parse(fs.readFileSync(path.join(root,'site',PREFIX,'U1_exterior_notices.json'),'utf8')),
  bedRows=DEFINITIONS.map(([,id,variant])=>getLayoutEquipment(id,variant));
 const attribution={bed:publicBed,receipt:bedReceipt,license:bedLicense,notices:bedNotices,fieldHashes:validateBedOutline(publicBed),rows:bedRows};
 test('exact plate-specific source receipt and full license validate for both U1 variants',()=>assert.equal(validateBedAttribution(attribution).consumers.length,2));
 for(const [label,mutate]of [
  ['blanket attribution scope',r=>r.scope='All exterior parts are OEM/AGPL'],
  ['source SHA256',r=>r.sourceAsset.sha256='0'.repeat(64)],
  ['model identity',r=>r.models[0].sha256='0'.repeat(64)],
  ['plate node identity',r=>r.models[0].referencedComponent.nodeName='Outer casing'],
  ['missing consumer',r=>r.models.pop()],
  ['duplicate consumer',r=>r.models[1]=structuredClone(r.models[0])]
 ])test('plate attribution rejects '+label,()=>{const receipt=structuredClone(bedReceipt);mutate(receipt);assert.throws(()=>validateBedAttribution({...attribution,receipt}));});
 test('plate attribution rejects full license corruption despite valid embedded notice',()=>{
  const license=Buffer.from(bedLicense);license[100]^=1;assert.throws(()=>validateBedAttribution({...attribution,license}),/license SHA256/);
 });
 test('plate attribution rejects missing full license bytes',()=>assert.throws(()=>validateBedAttribution({...attribution,license:Buffer.alloc(0)}),/license length/));
 test('receipts cover complete trailing bytes and distinguish index order',()=>{
  const a=new Uint32Array([0,1,2]),b=new Uint32Array([0,2,1]);assert.notDeepEqual(arrayReceipt(a),arrayReceipt(b));
  assert.equal(arrayReceipt(source.positions).bytes,48);
 });
 assert.equal(network,0);
 const report={schema:'layout-equipment-audit-gates-regression-v1',passed:true,checks:checks.length,cases:checks,workerCount:1,liveNetworkRequests:network,
  actualAssetsAudited:false,scope:'Strict executable map/option guards and full source-buffer/identity/datum/material mutation fixtures; actual final bodies audited separately.',
  sourceInputs:Object.fromEntries(['scripts/audit_layout_equipment_geometry.mjs','scripts/audit_layout_equipment_assets.mjs','scripts/test_layout_equipment_audit_gates.mjs'].map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))};
 if(reportFile)fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{globalThis.fetch=originalFetch;fs.rmSync(temporary,{recursive:true,force:true});}
