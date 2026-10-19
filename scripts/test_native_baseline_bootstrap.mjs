// Actual delivered JSON through the production runtime loader. No mesh/native
// fit certificate: renderer/solid/UI reviews remain independent release gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);globalThis.crypto??=webcrypto;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const site=path.resolve(option('--site')||path.join(root,'site')),assets=path.resolve(option('--assets')||site),reportFile=option('--report');
const hash=b=>createHash('sha256').update(b).digest('hex'),body=n=>{const p=path.join(site,n);return fs.readFileSync(fs.existsSync(p)?p:path.join(assets,n))},read=n=>JSON.parse(body(n));
const h=read('HEAD_VALIDATION.json'),m=read('MOUNT_VALIDATION.json'),before=[hash(body('HEAD_VALIDATION.json')),hash(body('MOUNT_VALIDATION.json'))];
const machines=[...new Set(['voron_trident_350',...Object.keys(h.machines),...Object.keys(m.machines)])];
const fetched=new Map(),allFetched=new Map(),overrides=new Map();let missing=null,tamper=null;
globalThis.fetch=async input=>{
 const u=new URL(String(input.url||input),'https://runtime-test.invalid/viewer/');
 const name=u.protocol==='file:'?path.relative(site,fileURLToPath(u)).replaceAll('\\','/'):u.pathname.replace(/^\/3d-print-rig\//,'/').replace(/^\//,'');
 assert(!name.startsWith('../')&&name.endsWith('.json'),'Unexpected non-JSON runtime bootstrap input: '+name);
 if(name===missing)return new Response('',{status:404});
 let b;try{b=overrides.has(name)?overrides.get(name):body(name)}catch{return new Response('',{status:404})}
 if(name===tamper)b=Buffer.concat([b,Buffer.from(' ')]);
 const pin={path:name,bytes:b.length,sha256:hash(b)};fetched.set(name,pin);if(!missing&&!tamper&&!overrides.size)allFetched.set(name,pin);return new Response(b,{headers:{'content-type':'application/json'}});
};
const result={schema:'actual-native-baseline-runtime-bootstrap-v1',all_passed:false,scope:'Production catalog loader and baseline startup guards using actual shipped JSON bytes; no GPU rendering or new native/whole-machine fit claim.',machines:[],negative_controls:[],source_files:{},input_files:[]};
function save(){if(reportFile)fs.writeFileSync(reportFile,JSON.stringify(result,null,2)+'\n')}
try{
 const source=n=>fs.readFileSync(path.join(site,'viewer',n),'utf8');
 for(const name of ['machine-heads.js','native-evidence-bridge.mjs','vanilla-trident.js','head-validation.mjs','mount-validation.mjs'])result.source_files['viewer/'+name]=hash(Buffer.from(source(name)));
 const {loadMachineHeadCatalog}=await import(pathToFileURL(path.join(site,'viewer/machine-heads.js')));
 const {nativeWitnessInputs,nativeDeckEvidenceSource:deck,nativeCatalogEvidenceSource:catalog}=await import(pathToFileURL(path.join(site,'viewer/native-evidence-bridge.mjs')));
 const {applyHeadValidation}=await import(pathToFileURL(path.join(site,'viewer/head-validation.mjs')));
 const {applyMountValidation}=await import(pathToFileURL(path.join(site,'viewer/mount-validation.mjs')));
 const {v24HeadCatalog}=await import(pathToFileURL(path.join(site,'viewer/machine-head-model.mjs')));
 const guard=source('vanilla-trident.js').match(/if\(headData\.registry\.head_witness_validation\?\.machine!==machine\)throw Error\('Native baseline requires current head witness validation'\);/);
 assert(guard,'Actual vanilla baseline guard must remain fail-closed');const startup=Function('headData','machine',guard[0]);
 const hashes=e=>Object.fromEntries([...new Set([...Object.keys(e.input_sha256),...Object.keys(e.machines.voron_trident_350.input_sha256),'HEAD_VALIDATION.json','MOUNT_VALIDATION.json',deck.file,...(catalog?[catalog.file]:[])])].map(n=>[n,hash(body(n))]));
 async function checkMachine(machine){
  fetched.clear();const data=await loadMachineHeadCatalog(machine),head=data.registry.head_witness_validation,mount=data.registry.probe_travel_validation;
  if(h.machines[machine]){
   assert.equal(head?.machine,machine,'Actual runtime HEAD witness bootstrap failed: '+machine);
   assert.deepEqual(head.records,h.machines[machine].records.map(r=>Array.isArray(r.intersection_ids)&&!('intersections'in r)?{...r,intersections:r.intersection_ids.map(id=>h.intersection_witnesses[id])}:r));
   assert.deepEqual(head.placements,h.placements);assert.deepEqual(head.bank_records,h.machines[machine].bank_records||[]);
   assert(head.records.every(r=>!r.source_configurations.includes('ace_hf__siboor_awd__stealthburner__cw2__fixed__none')));
  }
  if(m.machines[machine]){assert.equal(mount?.machine,machine,'Actual runtime MOUNT witness bootstrap failed: '+machine);assert.deepEqual(mount.records,m.machines[machine].records)}
  const standard=/^voron_trident_(250|300|350)$/.test(machine);
  if(standard)assert.doesNotThrow(()=>startup(data,machine),'Production native-baseline startup rejected '+machine);
  if(machine.includes('v24')){
   const profile=read(`machines/${machine}/machine_profile.json`),catalogue=v24HeadCatalog(data.heads,data.registry,machine,profile);
   assert.equal(catalogue.head_witness_validation?.machine,machine,'V24 runtime lost native evidence');assert(catalogue.variants.length>0);
  }
  // The appended pilot receives no old head or probe-travel certificate.
  const added={source_head_configuration:'ace_hf__siboor_awd__stealthburner__cw2__fixed__none',mount:'fixed',probe:'none',fit:{probe:{}},machine_head:{base:'sb_rapido_ace_hf_complete',translation:[0,0,0],modules:[],hidden:[],nozzle_mm:[0,0,0]}};
  assert.equal(applyHeadValidation(added,data.registry,machine),null);assert.equal(applyMountValidation(added,data.registry,machine),null);
  result.machines.push({machine,HEAD_accepted:Boolean(head),HEAD_original_records:head?.records.length??0,MOUNT_accepted:Boolean(mount),MOUNT_original_records:mount?.records.length??0,production_Trident_startup_guard_checked:standard,V24_actual_catalog_checked:machine.includes('v24'),new_ACE_inherited_native_fit:false,input_paths:[...fetched.keys()].sort()});save();
 }
 for(const machine of machines){await checkMachine(machine);globalThis.gc?.()}
 assert(catalog,'Production runtime must expose the exact catalog proof source');
 // Same production loader, actual current catalog bytes, failed/missing inputs.
 async function checkRejected(mode,name,machine){
  missing=mode==='missing'?name:null;tamper=mode==='tamper'?name:null;
  const data=await loadMachineHeadCatalog(machine);assert.equal(data.registry.head_witness_validation,null);if(m.machines[machine])assert.equal(data.registry.probe_travel_validation,null);assert.throws(()=>startup(data,machine),/Native baseline requires/);
  result.negative_controls.push({machine,mode,input:name,HEAD_rejected:true,MOUNT_rejected:Boolean(m.machines[machine]),baseline_startup_rejected:true});missing=null;tamper=null;save();
 }
 for(const [mode,name]of [['missing',catalog.file],['tamper',catalog.file],['tamper',catalog.catalog]])for(const machine of ['voron_trident_350','voron_v24_350_printed']){await checkRejected(mode,name,machine);globalThis.gc?.()}
 // Mutate transported raw JSON bodies, not parsed arguments/hash maps. The
 // unchanged product fetch/get() path computes every received digest itself.
 const change=(name,fn)=>{const data=read(name);fn(data);overrides.set(name,Buffer.from(JSON.stringify(data)))};
 const rewrite=(name,extra=()=>{})=>change(name,data=>{
  data.input_sha256[catalog.catalog]=hash(overrides.get(catalog.catalog)||body(catalog.catalog));
  data.model_bundle_sha256=JSON.parse(overrides.get('ASSET_BUNDLE.json')||body('ASSET_BUNDLE.json')).sha256;extra(data);
 });
 const rawCases=[
  ['HEAD-self-rewritten-catalog-and-bundle',()=>rewrite('HEAD_VALIDATION.json',data=>data.machines.voron_v24_250_printed.records[0].source_configurations.push('ace_hf__siboor_awd__stealthburner__cw2__fixed__none')),false,true],
  ['MOUNT-self-rewritten-catalog-and-bundle',()=>rewrite('MOUNT_VALIDATION.json',data=>{data.revision='unapproved-revision'}),true,false],
  ['unknown-catalog-and-self-rewritten-ledgers',()=>{change(catalog.catalog,data=>{data.unapproved_extra_root=true});rewrite('HEAD_VALIDATION.json');rewrite('MOUNT_VALIDATION.json')},false,false],
  ['local-profile-and-self-rewritten-ledgers',()=>{const name='machines/voron_v24_250_printed/machine_profile.json';change(name,data=>{data.unapproved_extra=true});for(const file of ['HEAD_VALIDATION.json','MOUNT_VALIDATION.json'])rewrite(file,data=>{data.machines.voron_v24_250_printed.input_sha256[name]=hash(overrides.get(name))})},false,false]
 ];
 async function rawControl(branch,entry){
  overrides.clear();if(branch==='equal')overrides.set('ASSET_BUNDLE.json',Buffer.from(JSON.stringify({...read('ASSET_BUNDLE.json'),sha256:h.model_bundle_sha256})));
  const machine='voron_v24_250_printed';fetched.clear();
  if(!entry){const data=await loadMachineHeadCatalog(machine);assert.equal(data.registry.head_witness_validation?.machine,machine);assert.equal(data.registry.probe_travel_validation?.machine,machine);return}
  const [id,mutate,headExpected,mountExpected]=entry;mutate();const rawPins=[...overrides].map(([name,bytes])=>({path:name,before_sha256:hash(body(name)),transport_sha256:hash(bytes),bytes:bytes.length}));
  const data=await loadMachineHeadCatalog(machine),ha=data.registry.head_witness_validation?.machine===machine,ma=data.registry.probe_travel_validation?.machine===machine;
  const row={mode:'self-rewritten-raw-fetch',branch,id,machine,HEAD_accepted:ha,MOUNT_accepted:ma,expected_HEAD:headExpected,expected_MOUNT:mountExpected,raw_transport_mutations:rawPins,production_received_HEAD_sha256:fetched.get('HEAD_VALIDATION.json')?.sha256,production_received_MOUNT_sha256:fetched.get('MOUNT_VALIDATION.json')?.sha256,production_function_replacements:0};
  result.negative_controls.push(row);save();assert.equal(ha,headExpected,id+' '+branch+' HEAD accepted rewritten witness');assert.equal(ma,mountExpected,id+' '+branch+' MOUNT accepted rewritten witness');
  for(const pin of rawPins)assert.equal(fetched.get(pin.path)?.sha256,pin.transport_sha256,'Product must hash actual transported bytes '+pin.path);
 }
 for(const branch of ['deck','equal']){await rawControl(branch,null);overrides.clear();globalThis.gc?.();for(const entry of rawCases){await rawControl(branch,entry);overrides.clear();globalThis.gc?.()}}
 const e=h,actual=hashes(e),bundle=read('ASSET_BUNDLE.json'),dp=read(deck.file),cp=read(catalog.file),actualBefore={...actual},evidenceBefore=hash(JSON.stringify(e));
 assert(nativeWitnessInputs(e,actual,bundle,'voron_trident_350','HEAD_VALIDATION.json',dp,cp)?.catalog_delta_retained);
 // The catalog check must run even before the equal-bundle early return.
 const equalBundle={...bundle,sha256:e.model_bundle_sha256};assert.equal(nativeWitnessInputs(e,actual,equalBundle,'voron_trident_350','HEAD_VALIDATION.json',null,null),null);
 assert(nativeWitnessInputs(e,actual,equalBundle,'voron_trident_350','HEAD_VALIDATION.json',null,cp)?.catalog_delta_retained);
 function rejectMutation(change){
  const a={proof:structuredClone(cp),hashes:{...actual},evidence:structuredClone(e)};change(a);assert.equal(nativeWitnessInputs(a.evidence,a.hashes,bundle,'voron_trident_350','HEAD_VALIDATION.json',dp,a.proof),null);result.negative_controls.push({mode:'changed-proof-or-input',rejected:true});
 }
 for(const change of [
  a=>a.proof.new_pilot.whole_head_fit_certified=true,
  a=>a.proof.new_pilot.historical_native_witness_scope_includes_new_variant=true,
  a=>a.proof.added_records.variants.id='another-variant',
  a=>a.hashes[catalog.file]='0'.repeat(64),
  a=>a.hashes['HEAD_VALIDATION.json']='0'.repeat(64),
  a=>a.hashes[deck.file]='0'.repeat(64),
  a=>a.hashes[catalog.catalog]='0'.repeat(64),
  a=>a.hashes['MACHINE_HEAD_REGISTRATIONS.json']='0'.repeat(64),
  a=>a.evidence.machines.voron_trident_350.input_sha256[catalog.catalog]='0'.repeat(64)
 ]){
  rejectMutation(change);globalThis.gc?.();
 }
 assert.deepEqual([hash(body('HEAD_VALIDATION.json')),hash(body('MOUNT_VALIDATION.json'))],before,'Original evidence bytes changed');
 assert.deepEqual(actual,actualBefore,'Input hashes must not be mutated');assert.equal(hash(JSON.stringify(e)),evidenceBefore,'Historical witness scope must not be mutated');
 assert.equal(result.machines.length,machines.length);result.all_passed=true;result.input_files=[...allFetched.values()].sort((a,b)=>a.path.localeCompare(b.path));save();console.log(JSON.stringify({all_passed:true,machine_rows:machines.length,negative_controls:result.negative_controls.length,old_witness_bytes_unchanged:true,new_ACE_native_certificate:false}));
}catch(error){result.error=error.message;result.input_files=[...allFetched.values()];save();throw error}
