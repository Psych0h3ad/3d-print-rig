import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {pathToFileURL,fileURLToPath} from 'node:url';import * as THREE from '../site/viewer/vendor/three.module.js';
import {withEmbeddedBoards,xolEmbeddedBoard,sbEmbeddedBoard} from '../site/viewer/embedded-boards.mjs';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
import {bankChoices,bankPlan,bankCapacity,bankBedReferenceDrop,bankDockUnavailable,initialBank,normalizeBank,bankSpec,bankSource,readBankURL} from '../site/viewer/changer-bank-model.mjs';
import {bedChainRoute,createBedChain} from '../site/viewer/bed-chain.mjs';
import {tridentChainPins} from '../site/viewer/bed-chain-pins.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';

// These are missing whole-installation proofs, not declarations that a source
// design is physically incompatible. Reference previews retain their scope.
export const dockProofGaps=Object.freeze({
 stealthchanger:['matched native frame/idler socket and purchased fasteners','complete source-matched horizontal cowl/backplate/shover or independent liftbar','adaptive native shuttle/parked-tool/bed exchange'],
 indx:['exact OEM4010 blower solids and mates','Link/XT30, board fastening and actual host endpoints','source belt/carriage tooth/clamp route','native exchange beyond the declared print area'],
 madmax:['source-matched catches/magnets and frame fastening in parked pose','Monolith inverted-belt keeper and dedicated dock fixture where applicable','adaptive native parked-tool/gantry/bed exchange']
});
export function assertReferenceDockScope(data,machine,system){
 const spec=bankSpec(data,system),mount=spec?.machines?.[machine];
 assert(mount,`${machine}/${system}: unregistered host is a failure`);
 for(const [label,row] of [['system',spec],['host',mount]])for(const key of ['print_setup_verified','full_travel_verified','automatic_docking_verified','whole_installation_verified'])
  assert.notEqual(row[key],true,`${machine}/${system}/${label}.${key}: missing whole-installation proof: ${dockProofGaps[system].join('; ')}`);
 if(system==='indx')assert.equal(spec.reference_geometry_only,true,`${machine}/INDX reference scope missing`);
 if(system==='madmax'){assert.equal(mount.bank_permitted,false);assert.equal(mount.docking_registered,false);}
 if(system==='stealthchanger'&&/(?:^|_)trident(?:_|$)/.test(machine))assert.equal(mount.bank_permitted,false,`${machine}: standard SC bank must remain blocked`);
}
export function assertBankHostFrame(mount,metadata){
 assert(mount?.frame_part_key&&mount.frame_meta,'Exact bank host/frame identity missing');
 const rows=metadata.parts?.filter(p=>String(p.key)===String(mount.frame_part_key));
 assert.equal(rows?.length,1,'Exact bank host/frame leaf missing or duplicated');
 for(const b of [mount.frame_bounds_mm,rows[0].bounds_mm])assert(Array.isArray(b)&&b.length===2&&b.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)),'Finite bank host bounds missing');
 for(let i=0;i<2;i++)for(let a=0;a<3;a++)assert(Math.abs(mount.frame_bounds_mm[i][a]-rows[0].bounds_mm[i][a])<.001,'Bank registration does not match the actual host frame');
}
export function assertChainPresent(chain,expectedLinks=20){
 assert(chain,'Missing actual Trident bed chain');assert.equal(chain.entries.length,expectedLinks,'Missing or duplicated actual bed-chain links');
 for(const e of [...chain.entries,...chain.endParts]){
  assert(e.mesh?.isMesh&&e.mesh.parent&&e.mesh.geometry?.attributes.position?.count>0,'Missing actual bed-chain mesh');
  for(let p=e.mesh;p;p=p.parent)assert.equal(p.visible,true,`Hidden bed-chain ancestor/part ${e.row.key}`);
  e.mesh.updateWorldMatrix(true,false);assert(e.mesh.matrixWorld.elements.every(Number.isFinite),`Non-finite bed-chain transform ${e.row.key}`);
 }
}
export function adaptiveChainDrops(pins,min,max){
 assert(pins?.length===20&&[min,max].every(Number.isFinite)&&min<=max,'Invalid chain travel envelope');
 const start=pins[0].from_xz_mm,end=pins.at(-1).to_xz_mm,samples=new Map();
 const at=d=>{if(!samples.has(d))samples.set(d,bedChainRoute(start,[end[0],end[1]-d]));return samples.get(d)};
 function split(a,b,depth=0){
  const ra=at(a),rb=at(b),m=(a+b)/2,rm=at(m);
  const angle=Math.max(...ra.angles.map((v,i)=>Math.max(Math.abs(v-rm.angles[i]),Math.abs(rb.angles[i]-rm.angles[i]))));
  const movement=Math.max(...ra.points.map((v,i)=>Math.max(Math.hypot(...v.map((n,j)=>n-rm.points[i][j])),Math.hypot(...rb.points[i].map((n,j)=>n-rm.points[i][j])))));
  if(angle>.12||movement>8){assert(depth<12,'Adaptive chain sampling exhausted');split(a,m,depth+1);split(m,b,depth+1);}
 }
 split(min,max);return [...samples.keys()].sort((a,b)=>a-b);
}
function dispose(scene,rig){
 const geometry=new Set(),materials=new Set();scene.traverse(o=>{if(o.isMesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});
 for(const g of geometry)g.dispose();for(const m of materials)m.dispose();rig?.cache.clear();scene.clear();globalThis.gc?.();
}
async function audit(){
 assert(process.argv[2],'Usage: audit_changer_banks.mjs ASSEMBLED_SITE REPORT [--docks-only]');
 const root=path.resolve(process.argv[2]),pins=new Map(),codePins=new Map(),sha=b=>createHash('sha256').update(b).digest('hex');
 const bytes=async n=>{const file=path.resolve(root,n);assert(file.startsWith(root+path.sep),'Asset path outside assembled site');const b=await fs.readFile(file);pins.set(n,{sha256:sha(b),bytes:b.length,...(n.endsWith('.glb.gz')?{decoded_sha256:sha(gunzipSync(b))}:{})});return b};
 const read=async n=>JSON.parse((await bytes(n)).toString('utf8'));
 // Pin the actual local dependency closure, including renderer, adapters and
 // consumers. Merely copying yesterday's release receipt is never acceptance.
 async function pinCode(url){const file=fileURLToPath(url);if(codePins.has(file))return;const b=await fs.readFile(file);codePins.set(file,{sha256:sha(b),bytes:b.length});for(const match of b.toString('utf8').matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g))await pinCode(new URL(match[1].split('?')[0],url));}
 await pinCode(import.meta.url);for(const n of ['app.js','vanilla-trident.js','machine-heads.js'])await pinCode(new URL('../site/viewer/'+n,import.meta.url));for(const n of ['test_toolchangers.mjs','three-test-loader.mjs'])await pinCode(new URL(n,import.meta.url));await pinCode(new URL('../site/ASSET_BUNDLE.json',import.meta.url));
 const q={schema:'changer-bank-current-input-audit/105',all_passed:false,combinations:0,meshChecks:0,machines:[],blocked:[],failures:[],dock_gates:[],trident_chain:[],monolith_gates:[],actual_glbs:true,browser_visual_review:false,native_solid_clearance_verified:false,full_travel_verified:false,automatic_docking_verified:false,scope:'Actual registered bank fixtures, host identities, rejected unregistered banks and sampled Trident chain/controller transitions. Reference previews do not certify whole installations.'};
 globalThis.location={href:'https://assets.test/viewer/'};globalThis.ProgressEvent=class{constructor(type,values){Object.assign(this,{type},values)}};
 globalThis.fetch=async input=>{let n=String(input?.url||input).split('?')[0];if(n.startsWith('file:'))n=path.basename(fileURLToPath(n));else if(n.startsWith('http'))n=new URL(n).pathname.slice(1);else n=n.replace(/^\.\.\//,'');try{return new Response(await bytes(n))}catch(e){if(e.code==='ENOENT')return new Response('',{status:404});throw e}};
 try{
 assert.equal(sha(await bytes('ASSET_BUNDLE.json')),codePins.get(fileURLToPath(new URL('../site/ASSET_BUNDLE.json',import.meta.url))).sha256,'Assembled asset descriptor differs from the current checkout; rebuild/requalify this asset root');
 const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js'),{loadMonolithMachines}=await import('../site/viewer/monolith-machine.js');
 const raw=await read('TOOLHEAD_CONFIGURATIONS.json'),heads=withEmbeddedBoards(raw,[xolEmbeddedBoard(await read(raw.base_assets.xol.meta)),sbEmbeddedBoard(await read(raw.base_assets.stealthburner.meta))]),registry=await read('MACHINE_HEAD_REGISTRATIONS.json'),data=await read('TOOLCHANGER_BANK.json');
 const sources={'DraftShift/ModularDock':'597fad34f3a1233ed1c182ec221a8da9ba68ac33','DraftShift/StealthChanger':'50e3c769297b273ac390fb33b455aa7f4dfe3099'};
 for(const [repository,commit]of Object.entries(sources))assert.equal(data.sources?.find(s=>s.repository===repository)?.commit,commit,'Dock source revision changed; native fixture evidence must be requalified');
 const siboor=await read('SIBOOR_TRIDENT_ASSETS.json');registry.machines.siboor_trident_300=siboor.registrations.head;data.machines.siboor_trident_300=siboor.registrations.bank;data.indx.machines.siboor_trident_300=siboor.registrations.indx_bank;
 for(const machine of Object.keys(registry.machines))for(const system of ['stealthchanger','indx','madmax']){
  assertReferenceDockScope(data,machine,system);const mount=bankSpec(data,system).machines[machine];
  if(system!=='madmax'){
   if(mount.frame_meta)assertBankHostFrame(mount,await read(mount.frame_meta));
   else{assert.equal(mount.bank_permitted,false,`${machine}/${system}: host frame proof absent`);assert.equal(mount.docking_registered,false,`${machine}/${system}: absent host must reject docking`);}
  }
  q.dock_gates.push({machine,system,whole_installation_qualified:false,reference_only:system==='indx',bank_permitted:mount.bank_permitted!==false,missing_proof:dockProofGaps[system]});
 }
 let combinations=0,meshChecks=0;const {machines,failures,blocked}=q;
 if(!process.argv.includes('--docks-only')){
for(const [machine,binding]of Object.entries(registry.machines))for(const gantry of binding.gantries?Object.keys(binding.gantries):[undefined]){
 const scene=new THREE.Scene(),catalog={...heads,machine_id:machine,variants:machineHeadVariants(heads,registry,machine,gantry),assets:{...heads.assets,...registry.assets,...data.assets},bank_data:data},rig=createMachineHeads(scene,catalog),choices=bankChoices(catalog,data,gantry);
 if(bankDockUnavailable(catalog,data)){
  assert.deepEqual(choices,[]);assert.equal(bankCapacity(data,machine),0);
  const head=catalog.variants.find(v=>v.mount==='stealthchanger'),empty=initialBank(catalog,data,gantry),state={enabled:true,active:0,tools:[head.source_head_configuration]};
  assert.deepEqual(empty,{enabled:false,active:0,tools:[]});assert.throws(()=>bankPlan(state,catalog,data,head));await assert.rejects(rig.install(head,state));
  await rig.install(head,empty);assert.equal(rig.active,head);assert.equal(rig.bankRig.children.length,0);
  rig.setDelta([31,-27,0]);assert.equal(rig.bankRig.children.length,0);blocked.push({machine,gantry,reason:data.machines[machine].printing_blocked_reason||data.machines[machine].docking_unregistered_reason});dispose(scene,rig);continue;
 }
 assert.equal(choices.length,2,machine+' parked choices');
 for(let count=1;count<=bankCapacity(data,machine);count++)for(let mask=0;mask<2**count;mask++)for(let active=0;active<count;active++){
  const state={enabled:true,active,tools:Array.from({length:count},(_,i)=>choices[mask>>i&1].source_head_configuration)},v=choices[mask>>active&1],plan=bankPlan(state,catalog,data,v);
  await rig.install(v,state);assert.equal(rig.active,v);assert.equal(rig.bankRig.children.length,plan.instances.length);assert.equal(rig.bankRig.children.filter(o=>o.userData.tool_bank.kind==='dock').length,count);
  const boxes=Array.from({length:count},()=>new THREE.Box3());rig.bankRig.updateMatrixWorld(true);
  rig.bankRig.children.forEach((o,i)=>{const p=plan.instances[i];assert.equal(o.userData.tool_bank.slot,p.slot);assert.equal(o.userData.tool_bank.asset,p.id);assert.deepEqual(o.position.toArray(),[p.translation_mm[0]*.001,p.translation_mm[2]*.001,-p.translation_mm[1]*.001]);const hide=new Set(p.hidden_keys||[]);o.traverse(mesh=>{if(!mesh.isMesh)return;const row=rig.cache.get(p.id).loaded.entries.find(e=>e.key===(mesh.userData.part_key||mesh.name));assert(row);assert.notEqual(mesh.material,row.mesh.material,'independent materials');assert.equal(mesh.geometry,row.mesh.geometry,'shared immutable geometry');assert.equal(mesh.visible,!hide.has(row.key)&&!['rail_reference','dock','shuttle_reference'].includes(row.component));if(mesh.visible)boxes[p.slot].expandByObject(mesh);meshChecks++})});
  for(let i=0;i<count;i++){assert(!boxes[i].isEmpty());const bed=data.machines[machine].bed_clearance;if(bed){const down=bankBedReferenceDrop(catalog,data,state,v),top=bed.bed_reference_top_mm-down;assert(boxes[i].min.y*1000>=top+bed.preview_gap_mm-.01,machine+' dock and parked head / bed clearance')}const frame=data.machines[machine].frame_bounds_mm;assert(boxes[i].min.x>=frame[0][0]*.001+.020-1e-5,machine+' left reserve');assert(boxes[i].max.x<=frame[1][0]*.001-.020+1e-5,machine+' right reserve');if(i)assert(boxes[i].min.x>boxes[i-1].max.x,machine+' adjacent static bank clearance')}
  const fixed=rig.bankRig.children.map(o=>o.getWorldPosition(new THREE.Vector3()).toArray());rig.setDelta([31,-27,80]);rig.bankRig.children.forEach((o,i)=>assert.deepEqual(o.getWorldPosition(new THREE.Vector3()).toArray(),fixed[i]));assert.deepEqual(rig.rig.position.toArray(),[.031,.08,.027]);rig.setPalette({base:'#113355',accent:'#dd4422'});combinations++;
 }
 const before=rig.bankRig.children.map(o=>o.uuid),v=rig.active;data.fixture_assets.push('missing_fixture');await assert.rejects(rig.setBank(rig.bankState));data.fixture_assets.pop();assert.equal(rig.active,v);assert.deepEqual(rig.bankRig.children.map(o=>o.uuid),before);
 await rig.setBank({...rig.bankState,enabled:false});assert.equal(rig.bankRig.children.length,0);assert.equal(rig.active,v);machines.push({machine,gantry,capacity:bankCapacity(data,machine)});console.log(machine+' '+(gantry||'')+' bank combinations passed');
 dispose(scene,rig);
}
 }
 q.combinations=combinations;q.meshChecks=meshChecks;
 // Compose current original heads (including additions and board expansion),
 // then exercise Monolith's actual registry, never its standalone menu alone.
 const headData=await loadMachineHeadCatalog();headData.registry=registry;const monolithRegistry=await read('MONOLITH_MACHINE_REGISTRATIONS.json');
 for(const machine of Object.keys(registry.machines)){
  const catalog={...headData.heads,machine_id:machine,gantries:[],dimensions:['gantry'],sources:[],variants:machineHeadVariants(headData.heads,registry,machine),assets:{...headData.heads.assets,...registry.assets,...data.assets},bank_data:data};
  const composed=await loadMonolithMachines(catalog,headData);assert(!composed.monolith_unavailable,composed.monolith_unavailable);
  const monolith=composed.variants.filter(v=>v.machine_gantry);
  if(monolithRegistry.machines[machine])assert(monolith.length,`${machine}: missing registered Monolith configurations`);
  else{assert.equal(monolith.length,0,`${machine}: unexpected unregistered Monolith host`);q.monolith_gates.push({machine,registered_host:false,whole_installation_qualified:false,missing_proof:['exact native Monolith host registration']});continue;}
  for(const v of monolith){
   for(const system of ['stealthchanger','indx','madmax'])assert.deepEqual(bankChoices(composed,data,v.gantry,system),[],`${v.id}/${system}: unregistered Monolith bank choices`);
   assert.throws(()=>bankPlan({enabled:true,active:0,tools:[v.source_head_configuration]},composed,data,v),`${v.id}: unregistered Monolith bank accepted`);
  }
  q.monolith_gates.push({machine,gantries:[...new Set(monolith.map(v=>v.gantry))],configurations:monolith.length,enabled_bank_rejected:true,whole_installation_qualified:false});
 }
 async function model(file){let b;try{b=await bytes(file)}catch(e){if(e.code!=='ENOENT')throw e;b=gunzipSync(await bytes(file+'.gz'))}return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
 // Run the real SIBOOR visibility consumer without a GPU or browser. This
 // exercises its present source, rather than duplicating its visibility rule.
 const app=await fs.readFile(new URL('../site/viewer/app.js',import.meta.url),'utf8'),begin=app.indexOf('function showHead(){'),end=app.indexOf('function showBelts(){',begin);
 assert(begin>=0&&end>begin,'SIBOOR visibility consumer not located');
 const showHeadFactory=new Function('activeConfig','$','allMeshes','groups','stockHeadGroup','installed','installedHeads','xolScene','panes','assetRoots','moving','parts','showBelts',app.slice(begin,end)+';return showHead;');
 for(const machine of ['voron_trident_250','voron_trident_300','voron_trident_350','siboor_trident_300','siboor_trident_350']){
  const isSiboor=machine.startsWith('siboor'),size=Number(machine.split('_').at(-1)),scene=new THREE.Scene();
  const metaFile=isSiboor?(size===300?`${siboor.local_directory}/${siboor.machines[machine].files['assembly_manifest.json'].path}`:'assembly_manifest.json'):`machines/${machine}/assembly_manifest.json`;
  const modelFile=isSiboor?(size===300?`${siboor.local_directory}/${siboor.machines[machine].files['model.glb'].path.replace(/\.gz$/,'')}`:'SIBOOR_Trident_350.glb'):null;
  const profile=isSiboor?null:await read(`machines/${machine}/machine_profile.json`),metadata=await read(metaFile),base=await model(modelFile||profile.base_assets.glb);scene.add(base);
  if(isSiboor&&size===300){assert.equal(pins.get(metaFile).sha256,siboor.machines[machine].files['assembly_manifest.json'].sha256);const actual=pins.get(modelFile+'.gz');assert.equal(actual?.sha256,siboor.machines[machine].files['model.glb'].sha256);assert.equal(actual?.decoded_sha256,siboor.machines[machine].files['model.glb'].decoded_sha256);}
  const motion=profile?createTridentMotion(profile):null;if(motion)motion.register(base,metadata);
  const chain=motion?motion.bedChains[0]:createBedChain(base,metadata);assert(chain,`${machine}: actual chain missing`);
  const native=tridentChainPins[isSiboor?'siboor':'voron'],all=[...chain.entries,...chain.endParts],snapshot=all.map(e=>({position:e.mesh.position.clone(),rotation:e.mesh.quaternion.clone(),scale:e.mesh.scale.clone()}));
  const tips=chain.entries.map((e,i)=>e.mesh.worldToLocal(new THREE.Vector3(native[i].to_xz_mm[0]/1000,native[i].to_xz_mm[1]/1000,e.from.z)));
  for(const e of all)assert([...e.mesh.geometry.attributes.position.array].every(Number.isFinite),`Non-finite exported chain vertices ${e.row.key}`);
  for(const e of chain.entries)e.mesh.userData.bedChain=true;
  const gantries=registry.machines[machine].gantries?Object.keys(registry.machines[machine].gantries):[undefined];
  const catalog={...headData.heads,machine_id:machine,variants:gantries.flatMap(g=>machineHeadVariants(headData.heads,registry,machine,g)),assets:{...headData.heads.assets,...registry.assets,...data.assets},bank_data:data},rig=createMachineHeads(scene,catalog);
  const result={machine,actual_chain_keys:all.map(e=>e.row.key),links:chain.entries.length,end_parts:chain.endParts.length,transitions:[],unregistered_systems:[],poses:0,native_reset:true,open_findings:isSiboor?['The current SIBOOR manifest registers 20 links but supplies no source-identified chain end/fastener records to this controller; complete attachment scope remains unqualified.']:[],scope:'Current production chain and installed-head controllers; SIBOOR showHead consumer. No browser/GPU or native-solid sweep.'};
  assert.equal(chain.entries.length,20);if(!isSiboor)assert.deepEqual(chain.endParts.map(e=>e.row.key.split('_').at(-1)).sort(),['755','762','776','778','779','780','781','782'],'Original chain end/fastener source identities changed');
  const apply=(drop,z,v,visible=true)=>{
   const down=z+drop,state=chain.update(down,visible);
   if(isSiboor){const meshes=chain.entries.map(e=>e.mesh);for(const m of meshes){m.userData.stock=true;m.userData.stockGroup='04_Z_Motion';}
    showHeadFactory({...v,modules:[],removed_stock_keys:[]},()=>({checked:visible}),meshes,{stock:{visible:true}},'stock','custom',rig,null,[],new Map(),{reference_flexible:meshes},new Map(),()=>{})();
   }
   if(visible){assertChainPresent(chain);assert(state.endpoint_error_mm<1e-5);}
   else for(const e of all)assert.equal(e.mesh.visible,false);
   if(Math.abs(down)>1e-8){const route=bedChainRoute(native[0].from_xz_mm,[native.at(-1).to_xz_mm[0],native.at(-1).to_xz_mm[1]-down]);for(const [i,e]of chain.entries.entries()){
    const from=e.mesh.localToWorld(e.pivotLocal.clone()),to=e.mesh.localToWorld(tips[i].clone());
    for(const [p,expected]of [[from,route.points[i]],[to,route.points[i+1]]])assert(Math.hypot(p.x*1000-expected[0],p.y*1000-expected[1])<.03,`Detached actual chain hinge ${e.row.key}`);
   }}
   // Each link retains its original immutable vertex positions and unit scale.
   for(let i=0;i<all.length;i++)assert(all[i].mesh.scale.equals(snapshot[i].scale),'Chain link stretched');
   result.poses++;
  };
  for(const gantry of gantries){
   const choices=catalog.variants.filter(v=>!gantry||v.gantry===gantry),sc=choices.find(v=>v.mount==='stealthchanger'),indx=choices.find(v=>v.toolhead==='indx'&&v.cooling==='4010'),madmax=choices.find(v=>v.mount==='madmax'&&v.registration_source==='madmax_xol'),fixed=choices.find(v=>v.mount==='fixed');
   assert(sc&&fixed,`${machine}/${gantry}: required source head configurations missing`);
   if(!indx){assert.equal(registry.machines[machine].gantries?.[gantry]?.belt_width_mm,9,'INDX source unexpectedly absent on a 6 mm gantry');assert.throws(()=>bankPlan({system:'indx',enabled:true,active:0,tools:['indx_nozzle']},catalog,data,sc),'9 mm gantry borrowed an INDX bank');result.unregistered_systems.push({gantry,system:'indx',enabled_bank_rejected:true,reason:'No source INDX head registration on this 9 mm gantry'});}
   const transition=indx?[sc,indx,...(madmax?[madmax]:[]),indx,sc]:[sc,fixed,sc];
   for(const v of transition){
    const system=v.toolhead==='indx'?'indx':v.mount==='madmax'?'madmax':'stealthchanger',state=initialBank(catalog,data,gantry,system);
    const mount=bankSpec(data,system).machines[machine];
    if(system==='indx'){state.tools=Array(Math.min(3,bankCapacity(data,machine,system))).fill(v.hotend);state.enabled=mount.bank_permitted!==false;}
    if(mount.bank_permitted===false)assert.throws(()=>bankPlan({...state,enabled:true},catalog,data,v),'Unregistered host bank accepted');
    await rig.install(v,state);assert.equal(rig.active,v);assert.equal(rig.bankRig.children.filter(o=>o.userData.tool_bank.kind==='dock').length,state.enabled?state.tools.length:0);
    const roundtrip=readBankURL('?tools='+encodeURIComponent(JSON.stringify(state)));assert.deepEqual(normalizeBank(roundtrip,catalog,data,gantry),state);await rig.setBank(roundtrip);
    const drop=bankBedReferenceDrop(catalog,data,state,v),zMax=(profile?.display_limits_mm.Z[1]??230)-Math.max(0,drop);
    assert.equal(drop,bankBedReferenceDrop(catalog,data,{...state,enabled:false},v),'Bank toggle changed bed datum');
    if(Number.isFinite(data.machines[machine].bed_max_up_mm))assert(drop>=-data.machines[machine].bed_max_up_mm-1e-6,'Bed exceeded native rail envelope');
    else assert.equal(mount.bank_permitted,false,'Missing native bed envelope cannot authorize docks');
    if(system==='indx'&&state.enabled){assert.equal(mount.print_setup_verified,false);assert(v.fit.nozzle_mm[2]-(data.machines[machine].bed_reference_top_mm-drop)>.01,'Generic INDX preview became a printable conversion without source qualification');}
    const samples=adaptiveChainDrops(native,drop,zMax+drop);for(const d of [...samples,...samples.toReversed()]){rig.setDelta([0,0,0]);apply(drop,d-drop,v);}
    for(const delta of [[-size/2,-size/2,0],[size/2,size/2,0],[0,0,0]]){rig.setDelta(delta);apply(drop,zMax,v);}
    await rig.setBank({...state,enabled:false});apply(drop,zMax,v);await rig.setBank(state);apply(drop,0,v);
    apply(drop,0,v,false);apply(drop,0,v,true);
    chain.update(0,true);rig.setDelta([0,0,0]);assertChainPresent(chain);for(let i=0;i<all.length;i++){assert(all[i].mesh.position.equals(snapshot[i].position),'Native chain reset position changed');assert(all[i].mesh.quaternion.equals(snapshot[i].rotation),'Native chain reset orientation changed');}
    result.transitions.push({gantry:gantry||v.gantry,variant:v.id,system,bank_enabled:state.enabled,z_range_mm:[0,zMax],bed_reference_drop_mm:drop,adaptive_drops:samples.length,saved_state_roundtrip:true});
   }
  }
  q.trident_chain.push(result);console.log(`${machine}: ${result.poses} actual chain/transition poses passed`);dispose(scene,rig);
 }
 q.all_passed=true;
 }catch(e){q.failures.push({message:e.message,stack:e.stack});process.exitCode=1;}
 // Re-read pinned inputs before saving, so concurrent input drift is a failure.
 for(const [n,p]of pins)try{assert.equal(sha(await fs.readFile(path.join(root,n))),p.sha256,`Asset changed during audit: ${n}`)}catch(e){q.all_passed=false;q.failures.push({message:e.message});process.exitCode=1;}
 for(const [n,p]of codePins)try{assert.equal(sha(await fs.readFile(n)),p.sha256,`Code changed during audit: ${n}`)}catch(e){q.all_passed=false;q.failures.push({message:e.message});process.exitCode=1;}
 q.inputs={assembled_root:root,assets:Object.fromEntries(pins),code:Object.fromEntries(codePins)};
 await fs.writeFile(process.argv[3]||'changer-bank-audit.json',JSON.stringify(q,null,2)+'\n');console.log(JSON.stringify({all_passed:q.all_passed,combinations:q.combinations,meshChecks:q.meshChecks,dock_gates:q.dock_gates.length,trident_hosts:q.trident_chain.length,failures:q.failures}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await audit();
