// Actual original exported GLBs through the production controller.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {expandedPrinterCatalog} from '../site/viewer/machine-head-model.mjs';
import {madmaxJointScope,madmaxJointApplies} from '../site/viewer/madmax-native-joint.mjs';
const root=path.resolve(process.argv[2]),output=process.argv[3];
const read=async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
globalThis.location={href:'https://assets.test/viewer/'};
globalThis.fetch=async input=>{let file=String(input).split('?')[0];if(file.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});file=file.startsWith('http')?new URL(file).pathname.slice(1):file.startsWith('file:')?decodeURIComponent(new URL(file).pathname).split('/site/').at(-1):file.replace(/^\.\.\//,'');try{const bytes=await fs.readFile(file==='SIBOOR_TRIDENT_ASSETS.json'?new URL('../site/SIBOOR_TRIDENT_ASSETS.json',import.meta.url):path.join(root,file));return new Response(file==='SIBOOR_TRIDENT_ASSETS.json'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes)}catch{return new Response('',{status:404})}};
const {createMachineHeads}=await import('../site/viewer/machine-heads.js');
const heads=await read('TOOLHEAD_CONFIGURATIONS.json'),registry=await read('MACHINE_HEAD_REGISTRATIONS.json');
let poses=0,vertices=0,paletteChecks=0,resetChecks=0;
const expectedJoint=JSON.parse(await fs.readFile(new URL('../docs/MADMAX_NATIVE_JOINT_101.json',import.meta.url),'utf8'));
const nativeMatrices=JSON.parse(await fs.readFile(new URL('./fixtures/madmax-native-joint-101.json',import.meta.url),'utf8'));
for(const pin of expectedJoint.actual_asset_pins)assert.equal(sha(await fs.readFile(path.join(root,pin.file))),pin.sha256,'Actual exported asset changed: '+pin.file);
for(const size of [250,300]){
 const machine=`voron_trident_${size}`,raw=await read(`machines/${machine}/configurations.json`),catalog=expandedPrinterCatalog(raw,heads,registry,machine),v=catalog.variants.find(v=>v.id===madmaxJointScope.variant);
 assert(v,'Existing exact source context missing');assert.equal(madmaxJointApplies(machine,v),size===250);
 const scene=new THREE.Scene(),rig=createMachineHeads(scene,{...catalog,base_assets:heads.base_assets});await rig.install(v);
 const rows=[];for(const id of ['madmax_xol_carriage','madmax_mgn12_fasteners']){const a=rig.cache.get(id).loaded;assert.equal(a.nativeJoint?.length||0,size===250?a.entries.length:0);for(const e of a.entries){rows.push({id,entry:e,position:e.mesh.position.clone(),quaternion:e.mesh.quaternion.clone(),scale:e.mesh.scale.clone(),positions:e.mesh.geometry.attributes.position.array.slice(),colors:e.materials.map(m=>m.color.clone()),metalness:e.materials.map(m=>m.metalness),roughness:e.materials.map(m=>m.roughness)});}}
 assert.equal(rows.length,5);
 if(size===250){for(const row of rows){const mesh=row.entry.mesh;mesh.updateMatrix();const expected=nativeMatrices.parts[row.entry.key];assert(expected);assert(mesh.matrix.elements.every((v,i)=>Math.abs(v-expected[i])<1e-14),'Production matrix differs from independently native-qualified original source matrix');if(row.id==='madmax_mgn12_fasteners')assert(Math.abs(mesh.position.z-.00020000009999711563)<1e-12);assert(Math.abs(mesh.quaternion.z)>1e-9,'Measured source rotation was discarded');}}
 for(const delta of [[0,0,0],[-125,-125,0],[125,125,250],[0,0,125],[37,-82,61],[-125,-125,0],[125,125,250],[0,0,0]]){
  rig.setDelta(delta);for(const row of rows){const {mesh}=row.entry;assert(mesh.position.equals(row.position));assert(mesh.quaternion.equals(row.quaternion));assert(mesh.scale.equals(row.scale));const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const local=new THREE.Vector3().fromBufferAttribute(a,i),world=mesh.localToWorld(local.clone()),expected=local.applyQuaternion(row.quaternion).multiply(row.scale).add(row.position).add(mesh.parent.position).add(rig.rig.position);assert(world.distanceTo(expected)<1e-12);assert(world.toArray().every(Number.isFinite));vertices++;}assert.deepEqual(a.array,row.positions);}poses++;
 }
 for(const palette of [{base:'#00ffff',accent:'#ff00ff'},{base:'#ff00ff',accent:'#00ffff'},{base:'#24272c',accent:'#e32636'}]){rig.setPalette(palette);for(const row of rows)for(const [i,m]of row.entry.materials.entries()){if(['base','accent'].includes(row.entry.role))assert.equal(m.color.getHexString(),palette[row.entry.role].slice(1));else{assert(m.color.equals(row.colors[i]));assert.equal(m.metalness,row.metalness[i]);assert.equal(m.roughness,row.roughness[i]);}paletteChecks++;}}
 const stock=catalog.variants.find(v=>v.id===catalog.default_configuration)||catalog.variants.find(v=>!v.machine_head);assert(stock);await rig.install(stock);
 for(const row of rows){assert(row.entry.mesh.position.length()<1e-14);assert(row.entry.mesh.quaternion.angleTo(new THREE.Quaternion())<1e-14);resetChecks++;}
 for(let pass=0;pass<3;pass++){await rig.install(v);for(const row of rows){assert(row.entry.mesh.position.distanceTo(row.position)<1e-14);assert(row.entry.mesh.quaternion.angleTo(row.quaternion)<1e-14);}await rig.install(null);for(const row of rows)assert(row.entry.mesh.position.length()<1e-14);resetChecks++;}
 scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});scene.clear();rig.cache.clear();globalThis.gc?.();
}
const report={passed:true,machines:['voron_trident_250','voron_trident_300'],corrected_host:'voron_trident_250',original_parts:5,poses,actual_vertex_world_checks:vertices,paletteChecks,resetChecks,input_assets:expectedJoint.actual_asset_pins,adapter_sha256:sha(await fs.readFile(new URL('../site/viewer/madmax-native-joint.mjs',import.meta.url))),native_report_sha256:expectedJoint.native_report_sha256,source_geometry_changed:false,browser_review:false,whole_machine_certified:false,scope:'Production installed-head consumer, exact native joint matrix, actual vertex world coordinates, extrema/midpoint/reversal/reset, printed palettes and original purchased materials. Existing 300 host remains unchanged. Full body/belt/dock clearance is not claimed.'};
const {auditMadmaxPtfe}=await import('./audit_madmax_ptfe.mjs');
report.ptfe_attachment=await auditMadmaxPtfe(root);
const {auditRapidoXUhfCover}=await import('./audit_rapido_x_uhf_cover.mjs');
report.rapido_x_uhf_cover=await auditRapidoXUhfCover(root);
assert(output,'Fresh evidence report path is required');await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:path.resolve(output),report_sha256:sha(await fs.readFile(output))}));
