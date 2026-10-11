// Actual exported V0 installation regression. Native solids, continuous fit,
// firmware calibration and complete wiring routes need separate evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {register} from 'node:module';
import vm from 'node:vm';

const INPUT_SCHEMA='3d-print-rig-v0-native-assets-inputs-v1';
const CONTRACT_SCHEMA='3d-print-rig-v0-native-assets-contract-v1';
const MACHINE='voron_v02r1_120';
const OPTION='dragon-burner-v8-dragon-native-sherpa-a3-r9c';
const CATALOGS=['V0_INSTALLATIONS.json','HEAD_ADDITIONS.json'];
const DEFAULT_SITE_URL='https://psych0h3ad.github.io/3d-print-rig/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);

export function checkedDescriptor(raw){
 assert(object(raw),'Missing registered artifact descriptor');
 assert(typeof raw.path==='string'&&raw.path&&!/[\\:#?%]/u.test(raw.path)&&raw.path.split('/').every(v=>v&&v!=='.'&&v!=='..'),'Unsafe registered artifact path');
 assert(hash(raw.sha256),'Invalid registered artifact SHA');
 assert(Number.isSafeInteger(raw.bytes)&&raw.bytes>0&&raw.bytes<=180_000_000,'Invalid registered artifact size');
 assert(raw.encoding===undefined||raw.encoding==='gzip','Unknown artifact encoding');
 const encoding=raw.encoding||(raw.path.endsWith('.gz')?'gzip':undefined);
 if(encoding==='gzip'){
  assert(hash(raw.decoded_sha256),'Missing decoded artifact SHA');
  assert(Number.isSafeInteger(raw.decoded_bytes)&&raw.decoded_bytes>0&&raw.decoded_bytes<=240_000_000,'Missing decoded artifact size');
 }else assert(raw.decoded_sha256===undefined&&raw.decoded_bytes===undefined,'Unencoded artifact has decoded pins');
 return {...raw,...(encoding?{encoding}:{})};
}
export function checkedURL(base,descriptor){
 const origin=new URL(base);assert(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname.endsWith('/'),'Invalid public source origin');
 const url=new URL(descriptor.path,origin);assert(url.origin===origin.origin&&url.pathname.startsWith(origin.pathname)&&!url.search&&!url.hash,'Artifact escaped registered public origin');return url.href;
}
export function checkedBytes(data,descriptor){
 const d=checkedDescriptor(descriptor);assert.equal(data.length,d.bytes,'Stored artifact size mismatch');assert.equal(sha(data),d.sha256,'Stored artifact SHA mismatch');
 const decoded=d.encoding==='gzip'?gunzipSync(data,{maxOutputLength:d.decoded_bytes}):data;
 if(d.encoding){assert.equal(decoded.length,d.decoded_bytes,'Decoded artifact size mismatch');assert.equal(sha(decoded),d.decoded_sha256,'Decoded artifact SHA mismatch');}
 return decoded;
}
export function validateInputs(inputs,contract){
 assert(object(inputs)&&inputs.schema===INPUT_SCHEMA,'Invalid actual-asset input schema');
 assert.equal(inputs.machine_id,contract.machine_id);assert.equal(inputs.option_id,contract.option_id);
 assert(same(inputs.catalogs,contract.catalogs),'Stale production catalog receipts');
 assert(object(inputs.assets)&&same(Object.keys(inputs.assets).sort(),Object.keys(contract.assets).sort()),'Missing or unregistered actual asset');
 for(const [role,expected]of Object.entries(contract.assets)){
  const row=inputs.assets[role];assert(object(row)&&typeof row.file==='string'&&path.isAbsolute(row.file),'Explicit cached public file required: '+role);
  assert(same(row.descriptor,expected.descriptor),'Stale registered artifact descriptor: '+role);assert.equal(row.source_url,expected.source_url,'Unregistered source URL: '+role);
 }
 return inputs;
}
export function auditGeometry(root){
 const stats={meshes:0,with_source_normals:0,without_source_normals:0};
 root.traverse(node=>{if(!node.isMesh)return;const geometry=node.geometry,p=geometry?.attributes?.position;
  assert(p&&p.itemSize===3&&p.count>0&&p.array.every(Number.isFinite),'Invalid actual source position geometry');stats.meshes++;
  const n=geometry.attributes.normal;
  if(n){assert.equal(n.itemSize,3);assert.equal(n.count,p.count);assert(n.array.every(Number.isFinite),'Non-finite source normal');for(let i=0;i<n.count;i++)assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.002,'Non-unit source normal');stats.with_source_normals++;}else stats.without_source_normals++;
  if(geometry.index)for(const value of geometry.index.array)assert(Number.isSafeInteger(value)&&value>=0&&value<p.count,'Invalid actual source triangle index');
 });assert(stats.meshes>0,'Actual assembly contains no meshes');return stats;
}
async function writeJSON(file,value){await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}
async function readCatalogs(site){
 const catalogs={},values={};for(const name of CATALOGS){const bytes=await fs.readFile(path.join(site,name));catalogs[name]={bytes:bytes.length,sha256:sha(bytes)};values[name]=JSON.parse(bytes.toString('utf8'));}return {catalogs,values};
}
export async function buildContract(site,siteURL=DEFAULT_SITE_URL){
 const {catalogs,values}=await readCatalogs(site),catalog=values['V0_INSTALLATIONS.json'],heads=values['HEAD_ADDITIONS.json'];
 assert.equal(catalog.schema,'v0-installations-v1');
 const registry=catalog.machines?.[MACHINE];assert(registry,'Missing mandatory V0 source machine');
 const options=registry.options.filter(o=>o.slot==='toolhead'&&o.id===OPTION);assert.equal(options.length,1,'Missing/duplicate mandatory native V0 option');
 const option=options[0];assert.equal(option.attachments?.length,1,'Native head requires exact single source assembly');
 const module=option.attachments[0].module,source=catalog.sources[module],head=heads.assets?.[module],gate=option.runtime_gate;
 assert(source&&head&&gate,'Missing mandatory V0 public asset/source gate');
 assert.equal(source.component_id,module);assert.equal(head.component_id,module);assert.equal(source.metadata_sha256,head.files['parts.json'].sha256);
 assert(same(source.external,head.external),'HEAD/V0 public source origins differ');
 for(const name of ['parts.json','model.glb'])assert(same(source.files[name],head.files[name]),'HEAD/V0 source descriptors differ: '+name);
 assert.equal(gate.machine_id,MACHINE);assert.equal(gate.verified_physical_printer,false);
 const dependency=gate.source_dependencies?.v0_carriage_display;assert(dependency,'Native stock carriage dependency missing');
 assert.equal(catalog.sources.v0_carriage_display?.metadata_sha256,dependency.metadata.sha256);
 const assets={};const add=(role,base,d)=>{const descriptor=checkedDescriptor(d);assets[role]={descriptor,source_url:checkedURL(base,descriptor)}};
 for(const [role,name]of [['host_manifest','assembly_manifest.json'],['host_profile','machine_profile.json'],['host_model','model.glb.gz']])add(role,siteURL,gate.machine_files[name]);
 add('carriage_metadata',siteURL,dependency.metadata);add('carriage_model',siteURL,dependency.model);
 for(const [role,name]of [['head_metadata','parts.json'],['head_model','model.glb'],['native_proof','native-proof.json'],['source_provenance','source-provenance.json'],['installation_proof','installed_native_proof.json']])add(role,head.external.base_url,head.files[name]);
 const requiredFiles=new Set(['parts.json','model.glb','native-proof.json','source-provenance.json','installed_native_proof.json']);
 // Source supplements are additive public receipts; once registered they are
 // mandatory checksum inputs too, without importing or executing their code.
 for(const [name,descriptor]of Object.entries(head.files))if(!requiredFiles.has(name))add('head_additional:'+name,head.external.base_url,descriptor);
 assert.equal(assets.installation_proof.descriptor.path,gate.display_region_evidence.native_proof,'Display proof path differs from published receipt');
 assert.equal(assets.installation_proof.source_url,gate.native_body_review.proof_url,'Native proof URL differs from registered descriptor');
 return {schema:CONTRACT_SCHEMA,machine_id:MACHINE,option_id:OPTION,catalogs,assets,runtime:await sourceClosure(site)};
}

// Include static app dependencies even though this Node audit has no DOM/GPU.
// Actual imported modules are loaded unchanged from this same explicit site.
async function sourceClosure(site){
 const pending=['viewer/v0-app.js','viewer/v0-installations.mjs','viewer/v0-state.mjs','viewer/v0-native-installed-gate.mjs','viewer/toolhead-lighting.mjs'],pins={};
 while(pending.length){const relative=pending.pop();if(pins[relative])continue;
  assert(relative.startsWith('viewer/')&&!relative.split('/').includes('..'),'Runtime import escaped supplied site');
  const file=path.join(site,relative),bytes=await fs.readFile(file);pins[relative]={bytes:bytes.length,sha256:sha(bytes)};
  const code=bytes.toString('utf8');
  assert(vm.SourceTextModule,'Use node --experimental-vm-modules for exact production import closure');
  for(const spec of new vm.SourceTextModule(code).dependencySpecifiers){
   if(spec.startsWith('node:'))continue;
   if(spec==='three'){pending.push('viewer/vendor/three.module.js');continue;}
   assert(spec.startsWith('.'),'Unregistered runtime package: '+spec);
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(relative),spec.split(/[?#]/u)[0]));pending.push(resolved);
  }
 }
 return pins;
}
async function endcheck(site,contract,pins,inputs,report){
 const current=await readCatalogs(site);assert(same(current.catalogs,contract.catalogs),'Catalog changed during actual audit');
 for(const [name,pin]of Object.entries(pins)){const bytes=await fs.readFile(path.join(site,name));assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256,'Runtime changed during actual audit: '+name);}
 for(const [role,row]of Object.entries(inputs.assets)){const bytes=await fs.readFile(row.file);checkedBytes(bytes,row.descriptor);assert.equal(sha(bytes),report.artifacts[role].stored_sha256);}
 report.source_endcheck=true;report.artifact_endcheck=true;
}
function argsFrom(argv){const args={};for(let i=0;i<argv.length;i++){assert(argv[i].startsWith('--'),'Unknown argument');const key=argv[i].slice(2);if(key==='self-test')args[key]=true;else{assert(argv[i+1]&&!argv[i+1].startsWith('--'),'Argument value required: '+key);args[key]=argv[++i];}}assert(Object.keys(args).every(k=>['site','site-url','inputs','report','emit-contract','self-test'].includes(k)),'Unknown audit option');return args;}
function selfTest(){
 let negatives=0;const data=Buffer.from('public source fixture\n'),encoded=gzipSync(data),d={path:'public/fixture.glb.gz',encoding:'gzip',bytes:encoded.length,sha256:sha(encoded),decoded_bytes:data.length,decoded_sha256:sha(data)};
 assert.deepEqual(checkedBytes(encoded,d),data);assert.deepEqual(checkedBytes(encoded,{...d,encoding:undefined}),data);
 const reject=fn=>{assert.throws(fn);negatives++};
 for(const change of [{encoding:'zip'},{path:'../fixture'},{path:'/fixture'},{path:'file%2e.glb'},{sha256:'x'.repeat(64)},{bytes:0},{decoded_bytes:0},{decoded_sha256:'0'.repeat(64)}])reject(()=>checkedBytes(encoded,{...d,...change}));
 reject(()=>checkedBytes(Buffer.concat([encoded,Buffer.from('x')]),d));reject(()=>checkedURL('http://example.test/',d));reject(()=>checkedURL('https://user:secret@example.test/',d));
 const contract={machine_id:MACHINE,option_id:OPTION,catalogs:{a:{sha256:sha(data),bytes:data.length}},assets:{head_model:{descriptor:d,source_url:checkedURL('https://example.test/',d)}}};
 const input={schema:INPUT_SCHEMA,machine_id:MACHINE,option_id:OPTION,catalogs:contract.catalogs,assets:{head_model:{...contract.assets.head_model,file:path.resolve('explicit-public-fixture')}}};validateInputs(input,contract);
 for(const mutation of [x=>x.machine_id='unknown',x=>x.option_id='old-head',x=>x.catalogs={},x=>delete x.assets.head_model,x=>x.assets.extra={},x=>x.assets.head_model.descriptor.sha256='0'.repeat(64),x=>x.assets.head_model.source_url='https://example.test/other',x=>x.assets.head_model.file='relative']){const copy=structuredClone(input);mutation(copy);reject(()=>validateInputs(copy,contract));}
 const mesh={isMesh:true,geometry:{attributes:{position:{itemSize:3,count:1,array:new Float32Array([1,2,3])}}}},root={traverse:fn=>fn(mesh)};assert.equal(auditGeometry(root).without_source_normals,1,'Legacy source may intentionally omit normals');
 mesh.geometry.attributes.normal={itemSize:3,count:1,array:new Float32Array([0,0,1]),getX:()=>0,getY:()=>0,getZ:()=>1};assert.equal(auditGeometry(root).with_source_normals,1);mesh.geometry.attributes.normal.getZ=()=>2;reject(()=>auditGeometry(root));delete mesh.geometry.attributes.normal;mesh.geometry.attributes.position.array[0]=NaN;reject(()=>auditGeometry(root));
 if(vm.SourceTextModule)assert.deepEqual([...new vm.SourceTextModule(`// import x from 'example';\n/* import 'example'; */\nconst demo="from 'example'";import * as THREE from 'three';export {x} from './real.mjs?v=pin';`).dependencySpecifiers],['three','./real.mjs?v=pin']);
 console.log(JSON.stringify({passed:true,negative_cases:negatives,scope:'Portable receipt/encoding/schema fixtures only; no actual assemblies loaded'}));
}


async function actualAudit({site,contract,inputs,report,output}){
 const viewer=pathToFileURL(path.join(site,'viewer')+path.sep);
 const threeURL=new URL('vendor/three.module.js',viewer).href;
 // A loader redirects the one bare browser dependency. No source rewriting,
 // repository fallback or alternate adapter is used for the actual audit.
 register('data:text/javascript,'+encodeURIComponent(`export async function resolve(specifier,context,next){if(specifier==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return next(specifier,context)}`),import.meta.url);
 const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/GLTFLoader.js',viewer));
 const {createV0Adapter}=await import(new URL('v0_adapter.mjs',viewer));
 const installationsModule=await import(new URL('v0-installations.mjs',viewer)),stateModule=await import(new URL('v0-state.mjs',viewer));
 const {createToolheadLedRig}=await import(new URL('toolhead-lighting.mjs',viewer)),ledIdentities=await import(new URL('toolhead-led-identities.mjs',viewer));
 const {guardV0NativeInstallations,guardV0NativeAdapter,v0NativeDisplayLimits,assertV0NativeInstalledSelection,assertV0NativePlayback,v0NativeDependencyHash}=await import(new URL('v0-native-installed-gate.mjs',viewer));
 const id=contract.machine_id,catalog=JSON.parse(await fs.readFile(path.join(site,'V0_INSTALLATIONS.json'),'utf8'));
 const registry={...catalog.machines[id],sources:catalog.sources},option=registry.options.find(o=>o.slot==='toolhead'&&o.id===contract.option_id);
 report.artifacts={};
 const artifact=async role=>{const row=inputs.assets[role],bytes=await fs.readFile(row.file),data=checkedBytes(bytes,row.descriptor);report.artifacts[role]={source_url:row.source_url,descriptor:row.descriptor,stored_sha256:sha(bytes),decoded_sha256:sha(data),stored_bytes:bytes.length,decoded_bytes:data.length};return data;};
 // Check every proof/metadata/model receipt before installing any geometry.
 for(const role of Object.keys(inputs.assets))await artifact(role);
 const json=async role=>JSON.parse((await artifact(role)).toString('utf8'));
 const manifest=await json('host_manifest'),profile=await json('host_profile'),stockProfile=structuredClone(profile),meta=await json('head_metadata'),carriageMeta=await json('carriage_metadata'),proof=await json('installation_proof');
 const nativeProof=await json('native_proof'),provenance=await json('source_provenance');
 assert.equal(proof.machine_id,id);assert.equal(proof.option_id,option.id);assert(same(proof.installation,option.installation),'Published installation frame/range changed');assert(same(proof.attachment,option.attachments[0]));assert(same(proof.replace_keys,option.replace_keys));
 assert(same(proof.head_files,catalog.sources[option.attachments[0].module].files),'Published proof head pins differ from live source');
 assert(same(proof.machine_files,option.runtime_gate.machine_files));assert(same(proof.source_dependencies,option.runtime_gate.source_dependencies));
 assert(same(proof.display_region.display_limits_mm,option.installation.display_limits_mm));assert.equal(proof.physical_printer_certified,false);assert.equal(proof.continuous_clearance_verified,false);assert.equal(proof.head_PTFE_harness_complete,false);assert.equal(proof.display_region.physical_program_use_gated,true);
 const zMap=proof.display_region.reviewed_stock_Z_mapping;
 assert.equal(zMap.stock_reference_Z_mm,stockProfile.display_reference_xyz_mm[2]);assert.equal(zMap.installed_reference_Z_mm,option.installation.display_reference_xyz_mm[2]);assert(Math.abs(zMap.stock_sampled_Z_max_mm-zMap.stock_reference_Z_mm+zMap.installed_reference_Z_mm-option.installation.display_limits_mm.Z[1])<1e-9);
 assert.equal(nativeProof.hardware_assembled,true);assert.equal(nativeProof.native_nozzle_source_face_id,option.installation.nozzle_source_face_id);assert(Array.isArray(provenance.sources)&&provenance.sources.length>0,'Missing public source provenance');
 assert.equal(meta.id,option.attachments[0].module);assert.equal(meta.parts.length,catalog.sources[meta.id].parts);assert.equal(new Set(meta.parts.map(p=>p.key)).size,meta.parts.length);
 const receipts={'assembly_manifest.json':contract.assets.host_manifest.descriptor.sha256,'machine_profile.json':contract.assets.host_profile.descriptor.sha256,'model.glb':contract.assets.host_model.descriptor.decoded_sha256};
 profile.stock_display_limits_mm=structuredClone(stockProfile.display_limits_mm);
 const loader=new GLTFLoader();
 const parse=async role=>{const bytes=await artifact(role);assert.equal(bytes.readUInt32LE(0),0x46546c67,'Expected embedded GLB');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);const glbJSON=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));assert(!(glbJSON.buffers||[]).some(b=>b.uri),'External GLB buffer not permitted');assert(!(glbJSON.images||[]).some(b=>b.uri),'External GLB image not permitted');return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 const native=await parse('host_model');report.geometry={host:auditGeometry(native.scene)};report.machine_model_sha256=receipts['model.glb'];report.machine_stored_sha256=contract.assets.host_model.descriptor.sha256;
 const scene=new THREE.Scene();scene.add(native.scene);const adapter=createV0Adapter(native.scene,manifest,profile);adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
 const materials=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material],hostMaterials=new Map();
 for(const node of adapter.nodes.values())node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const m of materials(mesh))hostMaterials.set(m,m.color.clone());});
 const loaded=new Map(),metadata=new Map([[meta.id,meta],['v0_carriage_display',carriageMeta]]);
 async function checkedLoadModule(module){
  if(loaded.has(module))return loaded.get(module);
  assert(module===meta.id||module==='v0_carriage_display','Unregistered module load');const role=module===meta.id?'head_model':'carriage_model',gltf=await parse(role);
  const rows=new Map(metadata.get(module).parts.map(p=>[p.key,p])),found=new Set();gltf.scene.traverse(n=>{if(n.userData?.part_key&&n.parent?.userData?.part_key!==n.userData.part_key){assert(rows.has(n.userData.part_key),'GLB leaf not in metadata');assert(!found.has(n.userData.part_key),'Duplicate source GLB leaf');found.add(n.userData.part_key);if(module===meta.id)assert.equal(n.userData.source_id,rows.get(n.userData.part_key).source_id,'Native leaf source identity mismatch');}});assert.equal(found.size,rows.size,'GLB/metadata leaf coverage differs');
  if(module===meta.id){const modelHash=contract.assets.head_model.descriptor.decoded_sha256;report.head_stored_sha256=contract.assets.head_model.descriptor.sha256;report.head_model_sha256=modelHash;gltf.scene.userData.ledSourceAsset={id:meta.id,decoded_model_sha256:modelHash};gltf.scene.traverse(n=>{if(!n.isMesh)return;let p=n;while(p&&!rows.has(p.userData?.part_key))p=p.parent;if(p)n.userData.ledSourceRow=rows.get(p.userData.part_key);});}
  else{assert.equal(contract.assets.carriage_model.descriptor.decoded_sha256,v0NativeDependencyHash(module));receipts['module:'+module]=v0NativeDependencyHash(module);}
  report.geometry[module]=auditGeometry(gltf.scene);loaded.set(module,gltf);return gltf;
 }
 const controller=await installationsModule.createV0Installations({scene,adapter,profile,registry,loadModule:checkedLoadModule});guardV0NativeInstallations(controller,{registry,manifest,stockProfile,receipts});guardV0NativeAdapter(adapter,controller);
 report.published_proof={sha256:contract.assets.installation_proof.descriptor.sha256,status:proof.status,scope:proof.scope,native_scope_reused_without_solid_recertification:true,historical_implementation_pins:proof.implementation_pins};
 assert.equal(proof.route_endpoint_movement.head_model_sha256,contract.assets.head_model.descriptor.decoded_sha256);assert.equal(proof.route_endpoint_movement.machine_model_sha256,receipts['model.glb']);assert.equal(proof.route_endpoint_movement.authored_route_complete,false);
 const nativeMods=stateModule.stockV0Mods(),selected={...nativeMods,toolhead:option.id,...option.requires};
 const ref=()=>{const o=registry.options.find(o=>o.slot==='toolhead'&&o.id===controller.getState().toolhead);profile.nozzle_tip_mm=[...(o?.nozzle_tip_mm||stockProfile.nozzle_tip_mm)];profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-stockProfile.bed_surface_min_xy_mm[0],profile.nozzle_tip_mm[1]-stockProfile.bed_surface_min_xy_mm[1],profile.nozzle_tip_mm[2]-stockProfile.bed_top_world_z_mm];profile.display_limits_mm=v0NativeDisplayLimits(controller.getState(),stockProfile.display_limits_mm);profile.sampled_clearance_limits_mm=o?null:structuredClone(stockProfile.sampled_clearance_limits_mm);};
 const pose=p=>{adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,p[i]])));controller.setPose(adapter.getPose());scene.updateMatrixWorld(true);};
 async function select(mods){assert(await controller.setState(mods));ref();pose(profile.display_reference_xyz_mm);}
 await select(selected);assert.equal(controller.getNativeInstallationGate().installed_geometry,true);assert.throws(()=>assertV0NativePlayback(controller),/routing remain unverified/);
 const spec=controller.roots.get(option.id)[0],partNodes=new Map();spec.model.traverse(n=>{if(n.userData.part_key&&n.parent?.userData.part_key!==n.userData.part_key)partNodes.set(n.userData.part_key,n)});
 const visible=()=>[...partNodes].filter(([,n])=>n.visible).map(([k])=>k).sort();assert.deepEqual(visible(),[...option.attachments[0].keys].sort());
 for(const key of option.replace_keys)assert.equal(adapter.nodes.get(key).visible,false,'Obsolete MiniSB companion visible: '+key);
 for(const key of ['v02r1_00326','v02r1_00374','v02r1_00383','v02r1_00384','v02r1_00385','v02r1_00398','v02r1_00357','v02r1_00377','v02r1_00390','v02r1_00399','v02r1_00402','v02r1_00405','v02r1_00415','v02r1_00039'])assert(adapter.nodes.get(key).visible,'Required retained source part hidden: '+key);
 for(const key of ['v0r1_source_carriage','mgn7h_block','block_screw_0','block_screw_1','block_screw_2','block_screw_3','carriage_front_nut_0'])assert.equal(partNodes.get(key).visible,false,'Duplicated carriage fixture');
 assert.equal([...controller.roots.get('stock')].length,1);assert(controller.roots.get('stock')[0].wrapper.visible,'Original sanitized stock carriage missing');
 report.stock_parts=manifest.parts.length;report.new_visible_parts=visible().length;report.old_replaced_parts=option.replace_keys.length;report.tests.push('Actual GLB production V0 controller and complete source companion masks');
 const base=Object.fromEntries([...adapter.nodes].map(([k,n])=>[k,{position:n.position.toArray(),quaternion:n.quaternion.toArray()}]));
 const bounds=option.installation.display_limits_mm;report.display_limits_mm=structuredClone(bounds);assert.deepEqual(profile.display_limits_mm,bounds);
 const poses=[[...profile.display_reference_xyz_mm]];for(let axis=0;axis<3;axis++){const [lo,hi]=bounds['XYZ'[axis]];for(const value of [lo,hi,(lo+hi)/2,lo+(hi-lo)/4,lo+3*(hi-lo)/4,lo]){const p=[...profile.display_reference_xyz_mm];p[axis]=value;poses.push(p)}}for(const x of bounds.X)for(const y of bounds.Y)for(const z of bounds.Z)poses.push([x,y,z]);poses.push([60,60,60],profile.display_reference_xyz_mm);
 const rejectedPoses=[[0,0,0],[120,120,120],[29.999,60,60],[90.001,60,60],[60,19.999,60],[60,100.001,60],[60,60,-.001],[60,60,120],[60,60,120.001]];const prior=adapter.getPose(),headPosition=spec.wrapper.position.toArray();for(const bad of rejectedPoses){assert.throws(()=>pose(bad),/sampled display region/);assert.throws(()=>adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,bad[i]])),{allowFirmwareOvertravel:true}),/sampled display region/);assert.throws(()=>controller.setPose(bad),/sampled display region/);assert.deepEqual(adapter.getPose(),prior);assert.deepEqual(spec.wrapper.position.toArray(),headPosition);}report.rejected_outside_region_poses=rejectedPoses;
 report.pose_samples=[];
 const nozzleKey=meta.parts.find(p=>option.installation.nozzle_source_face_id.startsWith(p.source_id+'#'))?.key;assert(nozzleKey,'Published native nozzle feature lacks an actual exported owner');
 const nozzleBox=new THREE.Box3();
 for(const p of poses){pose(p);const delta=p.map((v,i)=>v-profile.display_reference_xyz_mm[i]);assert(Math.abs(spec.wrapper.position.x-(option.attachments[0].translation_mm[0]+delta[0])/1000)<1e-9);assert(Math.abs(spec.wrapper.position.z+(option.attachments[0].translation_mm[1]+delta[1])/1000)<1e-9);assert(Math.abs(spec.wrapper.position.y-option.attachments[0].translation_mm[2]/1000)<1e-9);assert.deepEqual(visible(),[...option.attachments[0].keys].sort());
  scene.traverse(n=>{assert(n.matrixWorld.elements.every(Number.isFinite));if(n.isMesh&&n.visible&&n.geometry?.attributes.position)assert(n.geometry.attributes.position.array.every(Number.isFinite));});
  for(const belt of adapter.belts.entries){assert(belt.node.visible);assert(belt.route.points.flat().every(Number.isFinite));assert(Number.isFinite(belt.route.length)&&belt.route.length>0);}
  assert.equal(adapter.chain.entries.length,11);assert(adapter.chain.entries.every(e=>e.node.visible));assert(adapter.chain.getRoute().endpoint_error_mm<.01);
  const tip=option.nozzle_tip_mm.map((v,i)=>v+(i<2?delta[i]:0)),bedZ=profile.bed_top_world_z_mm-delta[2];assert(Math.abs(tip[2]-bedZ-p[2])<1e-10);nozzleBox.setFromObject(partNodes.get(nozzleKey));const actualTipZ=nozzleBox.min.y*1000;assert(Math.abs(actualTipZ-tip[2])<.003,'Exported nozzle tip differs from native source datum');
  report.pose_samples.push({xyz_mm:p,nozzle_world_mm:tip,exported_nozzle_min_world_z_mm:actualTipZ,bed_world_z_mm:bedZ,nozzle_bed_gap_mm:tip[2]-bedZ,exported_nozzle_bed_gap_mm:actualTipZ-bedZ,belts:adapter.belts.entries.length,chain_links:11,chain_endpoint_error_mm:adapter.chain.getRoute().endpoint_error_mm});
 }
 pose(profile.display_reference_xyz_mm);for(const [k,record]of Object.entries(base)){const node=adapter.nodes.get(k);assert(node.position.distanceTo(new THREE.Vector3(...record.position))<1e-8);assert(node.quaternion.angleTo(new THREE.Quaternion(...record.quaternion))<1e-7);}
 report.tests.push('Min/max/intermediate/reversed XYZ actual geometry; unchanged X/Y carriage and Z bed; native reset','Two finite visible belts and eleven attached bed-chain links on every sampled pose','Measured nozzle/bed datum tracks requested Z; probe none and native Z switch retained');
 const colors=()=>{const result={};spec.model.traverse(n=>{if(n.isMesh)result[n.uuid]=(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.color.getHexString())});return result};const nativeColors=colors();for(const palette of [{base:'#ff00aa',accent:'#00ffff',frame:'#b9bec4'},{base:'#00ffff',accent:'#ff00aa',frame:'#0e0f11'},{base:'#ff00aa',accent:'#00ffff',frame:'#b9bec4'},{}]){
  for(const [material,color]of hostMaterials)material.color.copy(color);adapter.setPalette(palette);controller.setPalette(palette);pose(profile.display_reference_xyz_mm);const changed=colors();
  for(const [k,n]of partNodes){const role=option.attachments[0].roles[k];n.traverse(m=>{if(!m.isMesh)return;if(['base','accent'].includes(role)&&palette[role])for(const material of materials(m))assert.equal(material.color.getHexString(),palette[role].slice(1));else if(!['base','accent'].includes(role))assert.deepEqual(changed[m.uuid],nativeColors[m.uuid]);});}
  for(const [key,node]of adapter.nodes){const role=adapter.records.get(key).appearance_role;node.traverse(m=>{if(!m.isMesh)return;for(const material of materials(m)){if(palette[role]&&['base','accent','frame'].includes(role))assert.equal(material.color.getHexString(),palette[role].slice(1));else assert(material.color.equals(hostMaterials.get(material)),'Purchased host hardware palette changed: '+key);}});}
 }assert.deepEqual(colors(),nativeColors);report.tests.push('Actual installed printed palettes A-B-A preserve purchased hardware materials');
 const save=stateModule.validateV0State({profile,registry},{schema:stateModule.v0ConfigurationSchema,machine_id:id,mods:selected,pose:[60,60,60],palette:{base:'#ff00aa',accent:'#00ffff',frame:null},enclosure:true,belts:true,grid:true,door_angle_deg:0,tophat_angle_deg:0});
 assert.throws(()=>stateModule.validateV0State({profile:stockProfile,registry},{...save,pose:[0,0,0]}),/XYZ/);assert.doesNotThrow(()=>stateModule.validateV0State({profile,registry},{...save,mods:nativeMods,pose:[0,0,0]}));
 const saved=JSON.parse(JSON.stringify(save));
 const restorer=stateModule.createV0StateRestorer({profile:stockProfile,registry,installations:controller,commit:value=>{ref();if(value){pose(value.pose);for(const [m,c]of hostMaterials)m.color.copy(c);adapter.setPalette(value.palette);controller.setPalette(value.palette);adapter.setFlexibleVisible(value.belts);adapter.setEnclosureVisible(value.enclosure);controller.setEnclosureVisible(value.enclosure);adapter.setDoorAngle(value.door_angle_deg);controller.setTophatAngle(value.tophat_angle_deg);}}});
 const restore=async value=>{assert.equal(await restorer.restore(value),true);assert.deepEqual(controller.getState(),value.mods);assert.deepEqual(adapter.getPose(),value.pose);};
 await select(nativeMods);assert.equal(controller.getNativeInstallationGate(),null);assertV0NativePlayback(controller);await restore(saved);assert.deepEqual(controller.getState(),selected);assert.deepEqual(adapter.getPose(),saved.pose);const href=stateModule.v0ModsURL('https://example.test/viewer/v0.html',{machine_id:id,registry},selected);assert.deepEqual(stateModule.readV0ModsURL(href,{machine_id:id,registry}),selected);
 await restore({...saved,mods:nativeMods,pose:[120,0,120]});assert.equal(controller.getNativeInstallationGate(),null);assert.deepEqual(profile.display_limits_mm,stockProfile.display_limits_mm);await restore({...saved,pose:[...option.installation.display_reference_xyz_mm]});controller.setPalette({});for(const[m,c]of hostMaterials)m.color.copy(c);pose(profile.display_reference_xyz_mm);assert.deepEqual(visible(),[...option.attachments[0].keys].sort());report.tests.push('Production state schema save/load and URL restore; installed-stock-installed A-B-A without stale visibility');
 for(const bad of [{...receipts,'model.glb':'0'.repeat(64)},{...receipts,'machine_profile.json':'0'.repeat(64)}])assert.throws(()=>assertV0NativeInstalledSelection({registry,mods:selected,manifest,stockProfile,receipts:bad}));
 const corrupt=structuredClone(registry);corrupt.options.find(o=>o.id===option.id).attachments[0].keys.pop();assert.throws(()=>assertV0NativeInstalledSelection({registry:corrupt,mods:selected,manifest,stockProfile,receipts}));
 for(const [slot]of Object.entries(option.requires))assert.throws(()=>installationsModule.validateV0Mods(registry,{...selected,[slot]:slot==='accelerometer'?'stock':'not-native'}));report.tests.push('Runtime rejects stale machine pins, incomplete head masks and unsupported companion choices; program playback gated');
 let emitter;partNodes.get('logo_led').traverse(n=>{if(n.isMesh&&ledIdentities.sourceLedIdentity(n))emitter=n});assert(emitter,'Missing exact native emitter');const originalRow=emitter.userData.ledSourceRow;emitter.userData.ledSourceRow={...originalRow,source_id:'wrong-native-occurrence'};assert.equal(ledIdentities.sourceLedIdentity(emitter),null);emitter.userData.ledSourceRow=undefined;assert.equal(ledIdentities.sourceLedIdentity(emitter),null);emitter.userData.ledSourceRow=originalRow;const asset=spec.model.userData.ledSourceAsset;spec.model.userData.ledSourceAsset={...asset,decoded_model_sha256:'0'.repeat(64)};assert.equal(ledIdentities.sourceLedIdentity(emitter),null);spec.model.userData.ledSourceAsset=asset;assert(ledIdentities.sourceLedIdentity(emitter));report.native_LED_identity_negatives=3;
 const rig=createToolheadLedRig(scene,{identify:ledIdentities.sourceLedIdentity,apertureFor:ledIdentities.sourceLedAperture,guideFor:ledIdentities.sourceOpticalGuide});
 const offBefore=colors(),red=rig.update({power:true,color:'red',level:100});assert.equal(red.installed,1);assert.equal(red.lit,1);assert.equal(rig.guides.length,1);assert(rig.emitters[0].surface.luminous_triangles>0);assert(rig.emitters[0].surface.body_triangles>0);assert.equal(rig.emitters[0].identity.id,'logo_led');
 const ledMaterial=rig.emitters[0].surface.materials[0],redColor=ledMaterial.emissive.getHexString();rig.update({power:true,color:'blue',level:100});assert.notEqual(ledMaterial.emissive.getHexString(),redColor);rig.update({power:true,color:'rainbow',effect:'flow',seconds:1,level:100});const rainbow=ledMaterial.emissive.getHexString();rig.update({power:false});assert.equal(ledMaterial.emissiveIntensity,0);assert.equal(rig.emitters[0].light.intensity,0);assert.equal(rig.guides[0].materials[0].emissiveIntensity,0);assert.deepEqual(colors(),offBefore);
 report.LED={installed:1,source_id:partNodes.get('logo_led').userData.source_id,lens_triangles:rig.emitters[0].surface.luminous_triangles,body_triangles:rig.emitters[0].surface.body_triangles,native_optical_guide:1,red_blue_differ:true,rainbow_sample:rainbow,off_restores_native_albedo:true,geometry_and_hardware_materials_preserved:true};rig.dispose();assert.deepEqual(colors(),offBefore);report.tests.push('Actual native WS2812B lens and paired source diffuser: RGB red/blue/rainbow/on/off preserve unlit source albedo and geometry');
 // Bind native measured source feed/strain/fixed-insert anchors to actual installed nodes.
 const hostProof=proof.selected_host_native_checks,anchors=[];
 for(const row of hostProof.route_anchors){
  if(row.circular_feed_features?.length){for(const f of row.circular_feed_features)anchors.push({key:row.key,owner:'head',source_id:f.source_edge_id,world_mm:f.center_world_mm,radius_mm:f.radius_mm});}
  else if(row.native_cylindrical_features?.length){for(const f of row.native_cylindrical_features)anchors.push({key:row.key,owner:'stock',source_id:f.source_face_id,world_mm:f.face_bounds_world_mm.slice(0,3).map((v,i)=>(v+f.face_bounds_world_mm[i+3])/2),radius_mm:f.radius_mm});}
 }
 assert(same(anchors,proof.route_endpoint_movement.anchors),'Published route anchors do not match retained source features');
 assert.equal(anchors.length,53);assert(anchors.some(a=>a.key==='dragon_1'));assert(anchors.some(a=>a.key==='drive_204'||a.key==='drive_205'));assert(anchors.some(a=>a.key==='v02r1_00357'));assert(anchors.some(a=>a.key==='v02r1_00760'));assert(anchors.some(a=>a.key==='v02r1_00765'));
 const routeReport={schema:'actual-source-route-anchor-motion-v1',passed:false,authored_route_complete:false,PTFE_connector_pair_mating_verified:false,CAN:{applicable:false,reason:'Source assembly has no CAN board/connector/harness'},head_model_sha256:report.head_model_sha256,machine_model_sha256:report.machine_model_sha256,anchors,pose_samples:[],scope:'Measured native feed/captive strain/fixed insert features stay attached to their actual exported owner nodes. This verifies anchor identity/movement, not a missing tube/harness connection.'};
 for(const xyz of poses){pose(xyz);const delta=xyz.map((v,i)=>v-profile.display_reference_xyz_mm[i]);let max=0;
  for(const a of anchors){const isHead=a.owner==='head',node=isHead?partNodes.get(a.key):adapter.nodes.get(a.key);assert(node&&node.visible,'Source route anchor owner missing: '+a.key);const motion=isHead?['X','Y']:adapter.records.get(a.key).motion_axes;const expected=a.world_mm.map((v,i)=>v+(motion.includes('XYZ'[i])?delta[i]*(isHead?1:adapter.records.get(a.key).motion_signs?.['XYZ'[i]]??1):0));const local=a.world_mm.map((v,i)=>v-(isHead?option.attachments[0].translation_mm[i]:0));const point=new THREE.Vector3(local[0]/1000,local[2]/1000,-local[1]/1000);node.localToWorld(point);const actual=[point.x*1000,-point.z*1000,point.y*1000];assert(actual.every(Number.isFinite));const err=Math.hypot(...actual.map((v,i)=>v-expected[i]));max=Math.max(max,err);assert(err<1e-6,'Native source route anchor detached: '+a.source_id);}
  routeReport.pose_samples.push({xyz_mm:xyz,source_anchor_count:anchors.length,maximum_owner_attachment_error_mm:max});
 }
 pose(profile.display_reference_xyz_mm);routeReport.native_reset=true;routeReport.passed=true;await writeJSON(path.join(output,'actual-route-anchor-motion-proof.json'),routeReport);report.route_anchor_audit={passed:true,anchors:anchors.length,pose_samples:poses.length,authored_complete_PTFE_harness:false,CAN_applicable:false};report.tests.push('Actual native feed/strain/fixed-PTFE source anchors remain attached through bounded min/max/intermediate/reversed poses and native reset; missing full routes remain gated');
 report.route_findings=option.runtime_gate.route_status;report.open_findings=['Full native-solid/swept printer clearance is not proven by this motion audit','PTFE feed and motor/hotend/fan/LED wiring routes are missing from the source assemblies','Belts are the existing smooth closed-loop previews: cut ends, teeth and clamp engagement unverified','Native Z endstop contact calibration is unverified','Source LED carrier contact stress remains unverified'];

 controller.dispose();
}


async function main(){
 const args=argsFrom(process.argv.slice(2));if(args['self-test']){selfTest();return;}
 assert(args.site,'--site is required (live built or production site)');const site=path.resolve(args.site),contract=await buildContract(site,args['site-url']);
 if(args['emit-contract']){await writeJSON(args['emit-contract'],contract);console.log(JSON.stringify({passed:true,mode:'contract-only',assets:Object.keys(contract.assets).length}));return;}
 assert(args.inputs&&args.report,'--inputs and --report are required');
 const report={schema:'actual-v0-native-installation-assets-v1',passed:false,machine_id:MACHINE,option_id:OPTION,workers:1,large_assemblies:2,tests:[],failures:[],physical_clearance_verified:false,continuous_clearance_verified:false,head_PTFE_wiring_verified:false,registration_mode:'Active explicit site catalogs; no draft registration fallback'};
 try{const inputs=validateInputs(JSON.parse(await fs.readFile(args.inputs,'utf8')),contract);report.input_receipt_sha256=sha(await fs.readFile(args.inputs));report.catalogs=contract.catalogs;report.source_sha256=contract.runtime;report.checker_sha256=sha(await fs.readFile(fileURLToPath(import.meta.url)));await actualAudit({site,contract,inputs,report,output:path.dirname(path.resolve(args.report))});await endcheck(site,contract,report.source_sha256,inputs,report);assert.equal(sha(await fs.readFile(args.inputs)),report.input_receipt_sha256,'Input receipts changed during audit');assert.equal(sha(await fs.readFile(fileURLToPath(import.meta.url))),report.checker_sha256,'Checker changed during audit');report.passed=true;}catch(error){report.failures.push(error.stack||String(error));}
 await writeJSON(args.report,report);console.log(JSON.stringify({passed:report.passed,pose_samples:report.pose_samples?.length,artifacts:Object.keys(report.artifacts||{}).length,failures:report.failures}));if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
