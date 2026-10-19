// Actual standalone changer exports and current production placement/selection plans.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {changerChoice,changerChoices,changerDimensions,changerPlacement} from '../site/viewer/toolchanger-model.js';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.slice(2),all[i+1]]],[]));
assert(args.site&&args.report,'--site and --report required');
const site=path.resolve(args.site),repo=fileURLToPath(new URL('../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const sourcePins={};
const todo=['scripts/audit_toolchanger_assets.mjs','site/viewer/toolchangers.js','site/viewer/model-loader.js'];
while(todo.length){const name=todo.pop();if(sourcePins[name])continue;const bytes=fs.readFileSync(path.join(repo,name));sourcePins[name]=sha(bytes);for(const spec of new vm.SourceTextModule(bytes.toString('utf8')).dependencySpecifiers){if(spec.startsWith('node:'))continue;if(spec==='three'){todo.push('site/viewer/vendor/three.module.js');continue;}assert(spec.startsWith('.'));todo.push(path.relative(repo,path.resolve(repo,path.dirname(name),spec.split(/[?#]/)[0])).replaceAll('\\','/'));}}
const contract=JSON.parse(fs.readFileSync(path.join(site,'APPROVED_DELIVERY.json'))),expected=new Map(contract.files.map(r=>[r.path,r]));
const bodyPins={};
function read(name){const bytes=fs.readFileSync(path.join(site,name)),pin=expected.get(name);if(pin){assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);}else assert.equal(name,'ASSET_BUNDLE.json');bodyPins[name]={sha256:sha(bytes),bytes:bytes.length};return bytes;}
globalThis.location={href:pathToFileURL(path.join(site,'viewer/toolchangers.html')).href};
globalThis.ProgressEvent=class{constructor(type,values){Object.assign(this,{type},values)}};
globalThis.fetch=async request=>{const url=new URL(String(request?.url||request),location.href);url.search='';const relative=path.relative(site,fileURLToPath(url)).replaceAll('\\','/');if(relative==='../candidate-v16-workbench-delivery/site/ASSET_BUNDLE.json'||path.basename(url.pathname)==='ASSET_BUNDLE.json')return new Response(read('ASSET_BUNDLE.json'));assert(!relative.startsWith('../')&&!path.isAbsolute(relative),'Unregistered external changer fetch');const bytes=read(relative);return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
const {loadModel}=await import('../site/viewer/model-loader.js');
const catalog=JSON.parse(read('TOOLCHANGER_CONFIGURATIONS.json')),cache=new Map(),resourcePins=new Map();
const report={schema:'actual-standalone-changer-assets-v1',passed:false,source_code_sha256:sourcePins,input_sha256:bodyPins,assets:[],variants:[],choice_transitions:0,pose_samples:0,palette_checks:0,existing_source_fit_open:[],browser_visual_review:false,native_solid_clearance_verified:false,scope:'Actual exported standalone changer models, source identities, current selection/placement functions, visibility, reversible palettes and native display reset. No DOM/GPU or new native-fit certificate.'};
function arrays(geometry){return [...Object.values(geometry.attributes),geometry.index].filter(Boolean).map(a=>a.isInterleavedBufferAttribute?a.data.array:a.array);}
for(const [id,spec]of Object.entries(catalog.assets)){
 const metadata=JSON.parse(read(spec.meta)),lookup=new Map(metadata.parts.map(p=>[String(p.key),p]));assert.equal(lookup.size,metadata.parts.length);
 const gltf=await loadModel(new GLTFLoader(),'../'+spec.glb),meshes=[],found=new Set();
 gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const row=lookup.get(String(mesh.userData.part_key||mesh.name));assert(row,id+' unregistered source mesh');found.add(String(row.key));mesh.material=mesh.material.clone();const position=mesh.geometry.getAttribute('position');assert(position&&position.count);for(let i=0;i<position.count;i++)assert([position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite));assert(mesh.geometry.getAttribute('normal')||mesh.material.flatShading===true,'Missing normal without actual flat-shading material');for(const array of arrays(mesh.geometry)){if(!resourcePins.has(array))resourcePins.set(array,sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength)));}meshes.push({mesh,row});});
 assert.equal(found.size,lookup.size,id+' omitted source part');cache.set(id,{root:gltf.scene,meshes,metadata});report.assets.push({id,parts:lookup.size,meshes:meshes.length,metadata_sha256:bodyPins[spec.meta].sha256,model_stored_sha256:bodyPins[spec.glb+'.gz']?.sha256||bodyPins[spec.glb]?.sha256});
}
function apply(v,{probe=0,explode=0,showDock=true,showRail=true,showCovers=true}={}){
 for(const a of cache.values())a.root.visible=false;
 for(const e of v.modules){const asset=cache.get(e.id);assert(asset);const hidden=new Set(e.hidden_keys||[]);for(const key of hidden)assert(asset.metadata.parts.some(p=>p.key===key));const p=changerPlacement(v,e,{probe,explode});assert(p.every(Number.isFinite));asset.root.position.set(p[0]*.001,p[2]*.001,-p[1]*.001);asset.root.visible=e.role!=='dock'||showDock;for(const{mesh,row}of asset.meshes)mesh.visible=!hidden.has(row.key)&&(row.component!=='rail_reference'||showRail)&&(row.component!=='cover'||showCovers);asset.root.updateMatrixWorld(true);asset.root.traverse(m=>assert(m.matrixWorld.elements.every(Number.isFinite)));report.pose_samples++;}
}
function snapshot(v){return v.modules.map(e=>{const a=cache.get(e.id);return {id:e.id,position:a.root.position.toArray(),visible:a.root.visible,mask:a.meshes.map(e=>e.mesh.visible)};});}
function palette(p){for(const asset of cache.values())for(const{mesh,row}of asset.meshes){const before=mesh.material.color.getHex(),role=appearanceRole(row);if(['base','accent'].includes(role))mesh.material.color.setHex(p[role]);else assert.equal(mesh.material.color.getHex(),before);report.palette_checks++;}}
for(const v of catalog.variants){
 assert.equal(changerChoice(catalog,v),v);
 for(const dimension of changerDimensions)for(const value of changerChoices(catalog,v,dimension)){const next=changerChoice(catalog,{...v,[dimension]:value},dimension);assert(catalog.variants.includes(next));assert.equal(next[dimension],value);report.choice_transitions++;}
 let count=0;for(const e of v.modules){const hidden=new Set(e.hidden_keys||[]);count+=cache.get(e.id).metadata.parts.filter(p=>!hidden.has(p.key)).length;}assert.equal(count,v.parts,v.id+' actual part count');
 apply(v);const native=snapshot(v),saved=JSON.parse(JSON.stringify({id:v.id,system:v.system,interface:v.interface,toolhead:v.toolhead}));
 const travel=v.probe_travel_mm||[0,0],poses=[travel[0],(travel[0]+travel[1])/2,travel[1],(travel[0]+travel[1])/2,travel[0]];
 for(const probe of poses)for(const explode of [0,25,50,25,0])apply(v,{probe,explode});
 for(const showDock of [true,false])for(const showRail of [true,false])for(const showCovers of [true,false])apply(v,{showDock,showRail,showCovers});
 palette({base:0x123456,accent:0xfedcba});palette({base:0xfedcba,accent:0x123456});
 const other=catalog.variants.find(x=>x.id!==v.id);apply(other);const restored=catalog.variants.find(x=>x.id===saved.id);assert(restored);apply(restored);assert.deepEqual(snapshot(restored),native,'A-B-A/reset source pose or mask changed');
 if(v.native_fit?.passed===false||!v.native_fit||v.native_fit.scope==='source_reference')report.existing_source_fit_open.push({id:v.id,native_fit:v.native_fit||null});
 report.variants.push({id:v.id,parts:count,reset:true,saved_id_preserved:true});
}
for(const[array,pin]of resourcePins)assert.equal(sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength)),pin,'Original source geometry/index array changed');
for(const[name,pin]of Object.entries(sourcePins))assert.equal(sha(fs.readFileSync(path.join(repo,name))),pin,'Source changed during audit');
report.source_endcheck=true;report.actual_exported_assets=cache.size;report.actual_variants=catalog.variants.length;report.passed=true;
fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,assets:cache.size,variants:catalog.variants.length,transitions:report.choice_transitions,poses:report.pose_samples,palette_checks:report.palette_checks,physical_fit_certified:false}));
