// Loader regression only: synthetic JSON identities are not native fit evidence.
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {register} from 'node:module';
register('./three-test-loader.mjs', import.meta.url);

globalThis.crypto??=webcrypto;
const machine='fixture_global_evidence',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=new Map(),put=(name,value)=>raw.set(name,JSON.stringify(value)+'\n');
put('TOOLHEAD_CONFIGURATIONS.json',{variants:[],sources:[],assets:{},base_assets:{
 xol:{meta:'fixtures/xol.json'},stealthburner:{meta:'fixtures/sb.json'}}});
put('HEAD_ADDITIONS.json',{schema:'3d-print-rig-head-additions-v1',assets:{},variants:[],sources:[]});
put('MACHINE_HEAD_REGISTRATIONS.json',{machines:{}});
put('TOOLCHANGER_BANK.json',{assets:{}});
put('fixtures/xol.json',{parts:[{key:'board',source:{path:['SHT-36v2 fixture']}}]});
put('fixtures/sb.json',{parts:[{key:'board',name:'EBB 2209 CAN'},{key:'connector',name:'BTT CAN接头'}]});
put('fixtures/meta.json',{scope:'loader fixture only'});
put('fixtures/profile.json',{scope:'loader fixture only'});
put('STOCK_SKIRT_RETENTION_QA_92.json',{scope:'loader fixture only; no geometry certificate'});
put('fixtures/head-root.json',{scope:'HEAD root input only'});
put('fixtures/mount-root.json',{scope:'MOUNT root input only'});
const bundle={sha256:sha('fixture bundle identity')};put('ASSET_BUNDLE.json',bundle);
const pins=names=>Object.fromEntries(names.map(name=>[name,sha(raw.get(name))]));
const common=['TOOLHEAD_CONFIGURATIONS.json','MACHINE_HEAD_REGISTRATIONS.json','TOOLCHANGER_BANK.json','STOCK_SKIRT_RETENTION_QA_92.json'];
const targetPins=pins(['fixtures/meta.json','fixtures/profile.json']);
const hit={category:'body',display_xyz_mm:[1,2,3],overlap_mm3:1};
const headRecord={placement:'p',source_configurations:['fixture_source'],intersection_ids:['hit'],full_travel_verified:false};
const mountRecord={source_configurations:['fixture_source'],nozzle_mm:[0,0,0],translation_mm:[0,0,0],module:'fixture_probe',checked_pairs:1};
const head={schema:'3d-print-rig-head-witness-v1',revision:'fixture-head',model_bundle_sha256:bundle.sha256,
 input_sha256:pins([...common,'fixtures/head-root.json']),placements:{p:'fixture placement'},intersection_witnesses:{hit},
 machines:{[machine]:{input_sha256:targetPins,records:[headRecord]}}};
const mount={schema:'3d-print-rig-probe-travel-v1',revision:'fixture-mount',model_bundle_sha256:bundle.sha256,
 input_sha256:pins([...common,'fixtures/mount-root.json']),clearance_margin_mm:.01,
 machines:{[machine]:{input_sha256:targetPins,records:[mountRecord]}}};
put('HEAD_VALIDATION.json',head);put('MOUNT_VALIDATION.json',mount);
for(const name of ['STOCK_SKIRT_RETENTION_QA_92.json','fixtures/head-root.json','fixtures/mount-root.json']){
 assert(!(name in targetPins),'regression requires a root-only input');
}

let missing=null,tamper=null;const fetched=[];
// Install before importing production modules: model-loader fetches at module load.
globalThis.fetch=async input=>{
 const value=String(input.url||input),name=value.startsWith('../')?value.slice(3).split('?')[0]:new URL(value,'https://fixture.invalid/viewer/').pathname.split('/').at(-1);
 fetched.push(name);
 if(name===missing||!raw.has(name))return new Response('',{status:404});
 return new Response(raw.get(name)+(name===tamper?' ':''));
};
const {loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
async function load(){fetched.length=0;return (await loadMachineHeadCatalog(machine)).registry;}
function accepted(registry){
 assert.equal(registry.head_witness_validation?.machine,machine,'HEAD root-only input was not hydrated');
 assert.equal(registry.probe_travel_validation?.machine,machine,'MOUNT root-only input was not hydrated');
 assert.deepEqual(registry.head_witness_validation.records,[{...headRecord,intersections:[hit]}]);
 assert.deepEqual(registry.head_witness_validation.placements,head.placements);
 assert.deepEqual(registry.probe_travel_validation.records,[mountRecord]);
}
accepted(await load());
for(const name of new Set([...Object.keys(head.input_sha256),...Object.keys(mount.input_sha256),...Object.keys(targetPins)]))assert(fetched.includes(name),'not fetched: '+name);
const cases=[
 ['STOCK_SKIRT_RETENTION_QA_92.json',true,true],
 ['fixtures/head-root.json',true,false],
 ['fixtures/mount-root.json',false,true],
 ['fixtures/meta.json',true,true]
];
for(const [name,rejectHead,rejectMount]of cases)for(const mode of ['missing','tamper']){
 missing=mode==='missing'?name:null;tamper=mode==='tamper'?name:null;
 const registry=await load();
 if(rejectHead)assert.equal(registry.head_witness_validation??null,null,name+' '+mode+' HEAD accepted');
 else assert.equal(registry.head_witness_validation?.machine,machine,'unaffected HEAD lost');
 if(rejectMount)assert.equal(registry.probe_travel_validation??null,null,name+' '+mode+' MOUNT accepted');
 else assert.equal(registry.probe_travel_validation?.machine,machine,'unaffected MOUNT lost');
 assert(fetched.includes(name),name+' '+mode+' was not requested');
 missing=null;tamper=null;accepted(await load());
}
put('ASSET_BUNDLE.json',{sha256:sha('different fixture bundle')});
const stale=await load();assert.equal(stale.head_witness_validation,null);assert.equal(stale.probe_travel_validation,null);
put('ASSET_BUNDLE.json',bundle);accepted(await load());
console.log('Actual head catalog loader: root-only HEAD/MOUNT inputs, missing/tampered bytes, target pins, bundle mismatch and original positive records passed.');
