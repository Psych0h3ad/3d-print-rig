// node scripts/audit_v0_state.mjs ASSEMBLED_SITE OUTPUT_REPORT.json
// Bounded actual-asset STATE audit. Hashes bind real exported inputs; no mesh
// rendering, native CAD, solid clearance, downloads or parallel jobs occur.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {installationsModule,stateModule} from './v0-state-test-runtime.mjs';
import {pageShareData,xShareURL} from '../site/viewer/workspace-share.mjs';
import {embedURL,embedTarget} from '../site/viewer/embed-contract.mjs';
import {supportURL,rowSelection} from '../site/support/model.mjs';
const [fixtureArgument,reportArgument]=process.argv.slice(2);
if(!fixtureArgument||!reportArgument)throw Error('Usage: node scripts/audit_v0_state.mjs ASSEMBLED_SITE OUTPUT_REPORT.json');
const root=path.resolve(fixtureArgument),output=path.resolve(reportArgument),sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const {v0Slots,validateV0Mods,v0TophatMaxAngle}=installationsModule;
const {stockV0Mods,validateV0State,readV0ModsURL,v0ModsURL,v0ConfigurationSchema,v0ModsParameter}=stateModule;
const report={schema:'v0-state-actual-assets-v1',passed:false,workers:1,fixture:root,implementation_source:sourceRoot,scope:'State roundtrips and production eligibility against actual exported profiles, manifests and Mod catalogs. Models are hashed, not parsed or visually inspected. No native mounting/solid clearance, motion geometry, physical fit or browser certification.',input_sha256:{},source_sha256:{},source_metadata:[],machines:[],counts:{validSelections:0,rejectedSelections:0,urlRoundtrips:0,shareRoundtrips:0,embedRoundtrips:0,supportRoundtrips:0,savedStateRoundtrips:0,legacyFiles:0,legacyLinks:0,invalidCases:0,reversals:0,stockResets:0},failures:[]};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function asset(name){const file=path.resolve(root,name),relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Asset escapes fixture: '+name);return file}
async function read(name){const bytes=await fs.readFile(asset(name));report.input_sha256[name]=digest(bytes);return JSON.parse(bytes)}
async function hashFile(file,gzip=false){let stream=createReadStream(file);if(gzip)stream=stream.pipe(createGunzip());const hash=createHash('sha256');for await(const chunk of stream)hash.update(chunk);return hash.digest('hex')}
function* states(registry,slots=v0Slots,index=0,value={}){if(index===slots.length){yield value;return}const slot=slots[index][0];for(const id of ['stock',...(slot==='accelerometer'?['none']:[]),...registry.options.filter(o=>o.slot===slot&&o.id!=='stock').map(o=>o.id)])yield*states(registry,slots,index+1,{...value,[slot]:id})}
const incompatible=(registry,mods)=>registry.options.some(o=>mods[o.slot]===o.id&&(Object.entries(o.requires||{}).some(([k,v])=>mods[k]!==v)||Object.entries(o.conflicts||{}).some(([k,v])=>v.includes(mods[k]))));
const reject=fn=>{assert.throws(fn);report.counts.invalidCases++};
function saved(profile,registry,mods,pose){return {schema:v0ConfigurationSchema,machine_id:profile.machine_id,mods,pose,palette:{base:'#ff0033',accent:'#00ffcc',frame:null},enclosure:false,belts:true,grid:false,door_angle_deg:110,tophat_angle_deg:v0TophatMaxAngle(registry,mods)}}
try{
 for(const name of ['site/viewer/v0-app.js','site/viewer/v0-state.mjs','site/viewer/v0-installations.mjs','site/viewer/v0-mod-library.mjs','site/viewer/v0_adapter.mjs','site/support/model.mjs','scripts/audit_v0_state.mjs','scripts/v0-state-test-runtime.mjs'])report.source_sha256[name]=digest(await fs.readFile(path.join(sourceRoot,name)));
 const registration=await read('V0_INSTALLATIONS.json'),library=await read('COMPONENT_LIBRARY.json');assert.equal(registration.schema,'v0-installations-v1');assert(Array.isArray(library.items));
 // Both supported machines must be present; missing inputs are fatal.
 assert.deepEqual(Object.keys(registration.machines).sort(),['voron_v02_120','voron_v02r1_120']);
 const metadata=new Map();
 for(const [machine_id,registry]of Object.entries(registration.machines))for(const option of registry.options)for(const spec of option.attachments){
  if(!spec.module||metadata.has(spec.module))continue;
  const source=registration.sources[spec.module];assert(source,'Unregistered source: '+spec.module);assert(!source.external,'This bounded audit requires local installed V0 source metadata');
  const name=source.metadata||'modules/'+spec.module+'/module.json',meta=await read(name);assert.equal(report.input_sha256[name],source.metadata_sha256,'Installed source metadata hash: '+spec.module);assert(Array.isArray(meta.parts),'Missing source parts: '+spec.module);
  metadata.set(spec.module,new Set(meta.parts.map(p=>p.key)));report.source_metadata.push({module:spec.module,path:name,sha256:report.input_sha256[name]});
 }
 for(const [machine_id,registry]of Object.entries(registration.machines)){
  const profile=await read('machines/'+machine_id+'/machine_profile.json'),manifest=await read('machines/'+machine_id+'/assembly_manifest.json');assert.equal(profile.machine_id,machine_id);assert.equal(manifest.machine_id,machine_id);
  const stockKeys=new Set(manifest.parts.map(p=>p.key));assert.equal(stockKeys.size,manifest.parts.length);
  let model='machines/'+machine_id+'/model.glb',compressed=false;try{await fs.access(asset(model))}catch{model+='.gz';compressed=true;await fs.access(asset(model))}
  const model_sha256=await hashFile(asset(model),compressed);report.input_sha256[model]=compressed?await hashFile(asset(model)):model_sha256;
  const coverage=new Set(),validTuples=new Set(),row={machine_id,model_file:model,exported_model_sha256:model_sha256,model_inspection:'Hash only',profile_sha256:report.input_sha256['machines/'+machine_id+'/machine_profile.json'],manifest_sha256:report.input_sha256['machines/'+machine_id+'/assembly_manifest.json'],validSelections:0,rejectedSelections:0,registeredOptions:registry.options.map(o=>({slot:o.slot,id:o.id})),poseSamples:[],legacyFiles:0,legacyLinks:0,supportRoundtrips:0};
  for(const o of registry.options){assert(v0Slots.some(([slot])=>slot===o.slot));assert(o.attachments.length);for(const key of o.replace_keys)assert(stockKeys.has(key),'Missing stock replacement: '+key);for(const s of o.attachments){if(s.stock_key)assert(stockKeys.has(s.stock_key),'Missing stock clone: '+s.stock_key);if(s.module)for(const key of s.keys)assert(metadata.get(s.module).has(key),'Missing source part: '+key)}}
  const context={machine_id,registry},stateContext={profile,registry},base='https://example.test/rig/viewer/v0.html?machine='+machine_id+'&lang=ja&embed=1#inspectorTabs';
  const axes=['X','Y','Z'],poses=[axes.map(a=>profile.display_limits_mm[a][0]),axes.map(a=>profile.display_limits_mm[a][1]),axes.map(a=>(profile.display_limits_mm[a][0]+profile.display_limits_mm[a][1])/2),[...profile.display_reference_xyz_mm]];row.poseSamples=poses;
  for(const mods of states(registry)){
   if(incompatible(registry,mods)){reject(()=>validateV0Mods(registry,mods));reject(()=>v0ModsURL(base,context,mods));reject(()=>validateV0State(stateContext,saved(profile,registry,mods,poses[0])));row.rejectedSelections++;report.counts.rejectedSelections++;continue}
   assert.deepEqual(validateV0Mods(registry,mods),mods);validTuples.add(JSON.stringify(v0Slots.map(([slot])=>mods[slot])));for(const [slot,id]of Object.entries(mods))coverage.add(slot+':'+id);row.validSelections++;report.counts.validSelections++;
   const url=v0ModsURL(base,context,mods);assert.deepEqual(readV0ModsURL(url,context),mods);assert.equal(new URL(url).searchParams.get('lang'),'ja');assert.equal(new URL(url).searchParams.get('embed'),'1');report.counts.urlRoundtrips++;
   const share=pageShareData(url,'V0');assert.deepEqual(readV0ModsURL(share.url,context),mods);assert.deepEqual(readV0ModsURL(new URL(xShareURL(share)).searchParams.get('url'),context),mods);report.counts.shareRoundtrips++;
   assert.deepEqual(readV0ModsURL(embedTarget(embedURL(url)).url.href,context),mods);report.counts.embedRoundtrips++;
   for(const pose of poses){const value=saved(profile,registry,mods,pose);assert.deepEqual(validateV0State(stateContext,JSON.parse(JSON.stringify(value))),value);report.counts.savedStateRoundtrips++}
   assert.deepEqual(readV0ModsURL(v0ModsURL(url,context,stockV0Mods()),context),stockV0Mods());report.counts.stockResets++;
   assert.deepEqual(readV0ModsURL(v0ModsURL(v0ModsURL(url,context,stockV0Mods()),context,mods),context),mods);report.counts.reversals++;
  }
  for(const o of registry.options)assert(coverage.has(o.slot+':'+o.id),'Option was never exercised: '+o.id);row.selectionIdentities=[...coverage].sort();
  const support=await read('support/data/'+machine_id+'.json'),supportTuples=new Set();
  assert.deepEqual([...support.dimensions].sort(),v0Slots.map(([slot])=>slot).sort(),'Support links must describe exactly seven installed slots');
  for(const supportRow of support.rows){
   const selected=rowSelection(support,supportRow),url=supportURL({id:machine_id,page:'./v0.html',kind:'v0'},support,supportRow,'https://example.test/rig/support/','ja');
   assert.deepEqual(readV0ModsURL(url,context),selected);assert.deepEqual(validateV0Mods(registry,selected),selected);assert.equal(new URL(url).searchParams.get('lang'),'ja');
   const tuple=JSON.stringify(v0Slots.map(([slot])=>selected[slot]));assert(!supportTuples.has(tuple),'Duplicate V0 support row');supportTuples.add(tuple);row.supportRoundtrips++;report.counts.supportRoundtrips++;
  }
  assert.deepEqual([...supportTuples].sort(),[...validTuples].sort(),'Shipped support rows must cover every eligible installed tuple exactly');
  const legacySlots=v0Slots.filter(([slot])=>!['toolhead','bed','carriage'].includes(slot));
  for(const mods of states(registry,legacySlots)){
   const expected={...stockV0Mods(),...mods},file=saved(profile,registry,mods,poses[2]);delete file.door_angle_deg;delete file.tophat_angle_deg;
   assert.deepEqual(validateV0State(stateContext,JSON.parse(JSON.stringify(file))).mods,expected);assert.equal(validateV0State(stateContext,file).tophat_angle_deg,0);row.legacyFiles++;report.counts.legacyFiles++;
   const url=new URL(base);url.searchParams.set(v0ModsParameter,JSON.stringify(mods));assert.deepEqual(readV0ModsURL(url.href,context),expected);row.legacyLinks++;report.counts.legacyLinks++;
  }
  assert.equal(readV0ModsURL(base,context),null);const good=saved(profile,registry,stockV0Mods(),poses[0]);
  for(const value of [null,[],{}, {...good,schema:'invalid'},{...good,machine_id:'other'},{...good,mods:null},{...good,mods:{}},{...good,mods:{...good.mods,unknown:'stock'}}])reject(()=>validateV0State(stateContext,value));
  for(const key of ['enclosure','belts','grid'])for(const value of [undefined,null,0,'true'])reject(()=>validateV0State(stateContext,{...good,[key]:value}));
  for(const i of [0,1,2])for(const value of [undefined,null,true,'0',NaN,Infinity,profile.display_limits_mm[axes[i]][0]-1,profile.display_limits_mm[axes[i]][1]+1]){const pose=[...good.pose];pose[i]=value;reject(()=>validateV0State(stateContext,{...good,pose}))}
  for(const key of ['door_angle_deg','tophat_angle_deg'])for(const value of [null,NaN,Infinity,-1,'0',111])reject(()=>validateV0State(stateContext,{...good,[key]:value}));
  for(const role of ['base','accent','frame'])for(const value of [undefined,0,'bad','#fffff',{}])reject(()=>validateV0State(stateContext,{...good,palette:{...good.palette,[role]:value}}));
  for(const payload of ['', '{', 'null', '[]', '{}','x'.repeat(4097)]){const url=new URL(base);url.searchParams.set(v0ModsParameter,payload);reject(()=>readV0ModsURL(url.href,context))}
  const url=new URL(v0ModsURL(base,context,stockV0Mods()));url.searchParams.append(v0ModsParameter,'{}');reject(()=>readV0ModsURL(url.href,context));url.searchParams.delete(v0ModsParameter);url.searchParams.set(v0ModsParameter,JSON.stringify(stockV0Mods()));url.searchParams.set('machine','other');reject(()=>readV0ModsURL(url.href,context));
  for(const item of library.items.filter(i=>i.id.startsWith('v0mod_')))for(const[slot]of v0Slots)reject(()=>v0ModsURL(base,context,{...stockV0Mods(),[slot]:item.id}));
  report.machines.push(row);
 }
 report.passed=true;
}catch(e){report.failures.push({message:e.message,stack:e.stack});process.exitCode=1}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
const report_sha256=digest(await fs.readFile(output));
console.log(JSON.stringify({passed:report.passed,workers:1,counts:report.counts,machines:report.machines.map(m=>({machine_id:m.machine_id,validSelections:m.validSelections,rejectedSelections:m.rejectedSelections})),report:output,report_sha256,failures:report.failures.map(f=>f.message)}));
