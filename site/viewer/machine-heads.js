import {madmaxJointAssetSpec,madmaxJointApplies,captureMadmaxJoint,setMadmaxJointPose} from './madmax-native-joint.mjs?v=d39e974d7b782135b52a';
import {v24NativeDriveMetadata} from './v24-drive-metadata.mjs?v=dbdf9f37cb0849ffc262';
import {augmentTrinityAlphaHosts,TRINITY_ALPHA_HOST_SOURCE,alphaResetPose,alphaRangeNotice,alphaResetLabel} from './trinity-alpha-host-extensions.mjs?v=eaac241cfd978128d54d';
import {alphaReference,alphaLimits} from './trinity-alpha-installation.mjs?v=37f9f9433fee33e8434c';
import {augmentTrinitySiboorR2,TRINITY_SIBOOR_SOURCE} from './trinity-alpha-siboor-r2.mjs?v=2325dbef2044df4b96ec';
import {augmentTrinityAlpha,TRINITY_ALPHA_SOURCE} from './trinity-alpha-installation.mjs?v=37f9f9433fee33e8434c';
import {workspaceTask} from './workspace-lifecycle.mjs';
import {monolithDisplayLimits} from './monolith-machine-model.mjs?v=991332fd5248a4b45e69';
import {loadMonolithMachines,createMonolithGantry,stockGantryVisibility} from './monolith-machine.js?v=9a091ffba211fccf3e84';
import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {appearanceRole} from './appearance-role.mjs?v=6b7b8efda77bfc3ce74d';
import {partKey} from './head-assembly.js';
import {v24HeadCatalog} from './machine-head-model.mjs?v=1449151f5c6eaa06c413';
import {setupConfigurations} from './configurations.js?v=3cd2598ce00d6152def6';

import {loadSiboorRegistration} from './siboor-catalog.mjs?v=c1640cd9214e2ffcc4c7';
import {stockProbeFit} from './probe-mounts.js';

import {xolEmbeddedBoard,sbEmbeddedBoard,withEmbeddedBoards} from './embedded-boards.mjs';
import {bankPlan} from './changer-bank-model.mjs?v=024cc52a5bbc61da7506';
import {setupChangerBank} from './changer-bank.js?v=47bbc0fef91af2c7241e';
import {contentSHA256,acceptedMountValidation} from './mount-validation.mjs';
import {acceptedHeadValidation}from './head-validation.mjs';
import {withHeadAdditions} from './head-additions.mjs?v=143d882a3df675284f2e';
import {loadExternalComponent} from './component-assets.mjs?v=9f8ef058f1297ab60e53';

const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
export async function loadMachineHeadCatalog(machine){return workspaceTask(async()=>{
 const hashes={};
 const get=async name=>{return workspaceTask(async()=>{const r=await fetch('../'+name,{cache:'no-cache'});if(!r.ok)throw Error('ヘッドの取付データを取得できません');const text=await r.text();try{hashes[name]=await contentSHA256(text)}catch{/* Unsupported hashing leaves mounting evidence unverified. */}return JSON.parse(text)});};
 const [rawHeads,additions,registry,bank]=await Promise.all([get('TOOLHEAD_CONFIGURATIONS.json'),get('HEAD_ADDITIONS.json'),get('MACHINE_HEAD_REGISTRATIONS.json'),get('TOOLCHANGER_BANK.json')]);
 const heads=withHeadAdditions(rawHeads,additions);
 if(['siboor_trident_300','siboor_trident_350'].includes(machine)){const patch=(await loadSiboorRegistration()).registrations;registry.machines.siboor_trident_300=patch.head;bank.machines.siboor_trident_300=patch.bank;bank.indx.machines.siboor_trident_300=patch.indx_bank;}
 if(machine){
  try{
   const evidence=await get('MOUNT_VALIDATION.json'),target=evidence.machines?.[machine];
   if(target){const [bundle]=await Promise.all([get('ASSET_BUNDLE.json'),...Object.keys({...evidence.input_sha256,...target.input_sha256}).map(get)]);registry.probe_travel_validation=acceptedMountValidation(evidence,hashes,bundle,machine)}
  }catch{/* Missing or stale evidence leaves the original unverified state. */}
  try{
   const evidence=await get('HEAD_VALIDATION.json'),target=evidence.machines?.[machine];
   if(target){const[bundle]=await Promise.all([get('ASSET_BUNDLE.json'),...Object.keys({...evidence.input_sha256,...target.input_sha256}).map(get)]);registry.head_witness_validation=acceptedHeadValidation(evidence,hashes,bundle,machine)}
  }catch{/* Missing or stale body findings do not prevent loading the catalog. */}
 }
 heads.assets={...heads.assets,...bank.assets};const board=[xolEmbeddedBoard(await get(heads.base_assets.xol.meta)),sbEmbeddedBoard(await get(heads.base_assets.stealthburner.meta))];
 const data={heads:withEmbeddedBoards(heads,board),registry,bank};
 if(["voron_trident_250","voron_trident_300","voron_trident_350","voron_v24_250_printed","voron_v24_250_ldo_cnc","voron_v24_300_printed","voron_v24_300_ldo_cnc","voron_v24_350_printed","voron_v24_350_ldo_cnc","siboor_v24_350","siboor_trident_300","siboor_trident_350"].includes(machine)){
  const alpha=await get(TRINITY_ALPHA_SOURCE.file);if(hashes[TRINITY_ALPHA_SOURCE.file]!==TRINITY_ALPHA_SOURCE.sha256)throw Error('Trinity alpha sidecar hash mismatch');
  augmentTrinityAlpha(data,machine,alpha,hashes['MACHINE_HEAD_REGISTRATIONS.json']);
  const extension=await get(TRINITY_ALPHA_HOST_SOURCE.file);if(hashes[TRINITY_ALPHA_HOST_SOURCE.file]!==TRINITY_ALPHA_HOST_SOURCE.sha256)throw Error('Trinity alpha host sidecar hash mismatch');
  augmentTrinityAlphaHosts(data,extension,hashes['MACHINE_HEAD_REGISTRATIONS.json']);
  if(['siboor_trident_300','siboor_trident_350'].includes(machine)){
   const siboor=await get(TRINITY_SIBOOR_SOURCE.file);if(hashes[TRINITY_SIBOOR_SOURCE.file]!==TRINITY_SIBOOR_SOURCE.sha256)throw Error('Trinity SIBOOR sidecar checksum mismatch');
   augmentTrinitySiboorR2(data,siboor,hashes['MACHINE_HEAD_REGISTRATIONS.json']);
  }
 }
 return data;
});}
export function createMachineHeads(scene,catalog,{render=()=>{}}={}){
 const gantry=createMonolithGantry(scene,catalog);
 const cache=new Map(),rig=new THREE.Group(),bankRig=new THREE.Group();rig.name='Installed_Machine_Head';bankRig.name='Frame_Tool_Bank';scene.add(rig,bankRig);let current=null,palette={base:'#24272c',accent:'#e32636'},delta=[0,0,0],bankState=null,bankEntries=[];
 async function asset(id){return workspaceTask(async()=>{
  if(cache.has(id))return cache.get(id);const spec=madmaxJointAssetSpec(catalog.machine_id,id,catalog.base_assets?.[id]||catalog.assets[id]);if(!spec)throw Error('未登録のヘッド部品：'+id);
  const loading=spec.external?loadExternalComponent(new GLTFLoader(),spec,location.href).then(({meta,gltf})=>[meta,gltf]):Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('ヘッドの部品表');if(spec.metadata_sha256){const text=await r.text();if(await contentSHA256(text)!==spec.metadata_sha256)throw Error('Native head metadata hash mismatch');return JSON.parse(text)}return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb,undefined,spec.decoded_model_sha256?{verifySha256:spec.decoded_model_sha256}:{})]);
  const promise=loading.then(([meta,g])=>{
   if(meta.coordinate_frame==='original_native_CAD_mm_XY_Zup'){const native=new THREE.Group();native.rotation.x=-Math.PI/2;native.scale.setScalar(.001);native.add(g.scene);g.scene=native;}
   const lookup=new Map(meta.parts.map(p=>[String(p.key),p])),entries=[];g.scene.visible=false;
   g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh),row=lookup.get(String(key));if(!row)throw Error('ヘッドの部品対応が不正です');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of materials){m.side=meta.native_single_sided?THREE.FrontSide:THREE.DoubleSide;if(m.transparent)m.depthWrite=false}entries.push({mesh,key,component:row.component,role:appearanceRole(row)||mesh.userData.appearance_role,materials,colors:materials.map(m=>m.color.clone())})});rig.add(g.scene);return {root:g.scene,entries,nativeJoint:captureMadmaxJoint(catalog.machine_id,id,meta,entries)};
  }).catch(e=>{cache.delete(id);throw e});cache.set(id,promise);return promise;
 });}
 function setPalette(value){gantry.setPalette(value);palette={...palette,...value};const rows=[...bankEntries,...[...cache.values()].flatMap(p=>p.loaded?.entries||[])];for(const row of rows)for(let i=0;i<row.materials.length;i++){const m=row.materials[i],color=palette[row.role];if(color)m.color.set(color);else m.color.copy(row.colors[i]);if(['base','accent'].includes(row.role)){m.metalness=0;m.roughness=.58}}}
 async function stagedBank(state,variant){return workspaceTask(async()=>{
  if(!state?.enabled)return {state,roots:[],entries:[]};const plan=bankPlan(state,catalog,catalog.bank_data,variant);
  const ids=[...new Set(plan.instances.map(p=>p.id))];await Promise.all(ids.map(async id=>{return workspaceTask(async()=>{const a=await asset(id);cache.get(id).loaded=a});}));
  const roots=[],entries=[];
  for(const entry of plan.instances){const a=cache.get(entry.id).loaded,root=a.root.clone(true),lookup=new Map(a.entries.map(e=>[String(e.key),e])),hidden=new Set(entry.hidden_keys||[]);root.visible=true;root.name='Dock_'+entry.slot+'_'+entry.id;root.userData.tool_bank={slot:entry.slot,kind:entry.kind,asset:entry.id};root.position.copy(point(entry.translation_mm));
   root.traverse(mesh=>{if(!mesh.isMesh)return;const row=lookup.get(String(partKey(mesh)));if(!row)throw Error('ドックの部品対応が不正です');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];mesh.visible=!hidden.has(row.key)&&!['rail_reference','dock','shuttle_reference'].includes(row.component);const offset=entry.part_offsets_mm?.[row.key];if(offset)mesh.position.add(point(offset));entries.push({...row,mesh,materials,colors:row.colors.map(c=>c.clone())})});roots.push(root);
  }
  return {state:plan.state,roots,entries};
 });}
 function commitBank(staged){for(const row of bankEntries)for(const material of row.materials)material.dispose();bankRig.clear();if(staged.roots.length)bankRig.add(...staged.roots);bankEntries=staged.entries;bankState=staged.state;setPalette(palette)}
 async function setBank(state){return workspaceTask(async()=>{const staged=await stagedBank(state,current);commitBank(staged);render()});}
 async function install(variant,state=bankState){return workspaceTask(async()=>{
  await gantry.install(variant);
  for(const p of cache.values())if(p.loaded)setMadmaxJointPose(p.loaded.nativeJoint,false);
  if(!variant?.machine_head){for(const p of cache.values())if(p.loaded)p.loaded.root.visible=false;current=null;commitBank({state:state?{...state,enabled:false}:null,roots:[],entries:[]});return}
  const plan=variant.machine_head,required=[...new Set([plan.base,...plan.modules.map(m=>m.id)])];await Promise.all(required.map(async id=>{return workspaceTask(async()=>{const a=await asset(id);cache.get(id).loaded=a});}));
  const staged=await stagedBank(state,variant);
  for(const p of cache.values())if(p.loaded){p.loaded.root.visible=false;p.loaded.root.position.set(0,0,0)}
  const place=(id,translation,hidden=[])=>{const a=cache.get(id).loaded,omit=new Set(hidden);a.root.visible=true;a.root.position.copy(point(translation));for(const e of a.entries)e.mesh.visible=!omit.has(e.key)&&!['rail_reference','dock','shuttle_reference'].includes(e.component)};
  place(plan.base,plan.translation,plan.hidden);for(const m of plan.modules)place(m.id,m.translation_mm,m.hidden_keys);current=variant;for(const p of cache.values())if(p.loaded)setMadmaxJointPose(p.loaded.nativeJoint,madmaxJointApplies(catalog.machine_id,variant));commitBank(staged);setPalette(palette);setDelta(delta);render();
 });}
 function setDelta(value){gantry.setDelta(value);delta=[...value];rig.position.copy(point(delta));rig.updateMatrixWorld(true)}
 function setVisible(value){rig.visible=Boolean(value)}
 function focus(camera,controls){if(!current)return false;rig.updateMatrixWorld(true);const box=new THREE.Box3(),visible=o=>o.visible&&(!o.parent||visible(o.parent));rig.traverse(o=>{if(o.isMesh&&visible(o))box.expandByObject(o)});if(box.isEmpty())return false;camera.up.set(0,1,0);box.getCenter(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(.13,.07,.25));controls.update();render();return true}
 return {install,setBank,setDelta,setPalette,setVisible,focus,get active(){return current},get bankState(){return bankState},gantry,rig,bankRig,cache};
}
export function ensureMachineHeadControls({gantry=false,monolithUnavailable}={}){
 let panel=document.querySelector('#configurationControls');
 if(!panel){panel=document.createElement('details');panel.id='configurationControls';panel.open=true;panel.innerHTML='<summary>ヘッド構成</summary><p id="configStatus" class="status" aria-live="polite"></p><p id="configSummary"></p><details><summary>取付条件・確認範囲</summary><ul id="mountInfo" class="foot"></ul><ul id="configRequirements" class="foot"></ul><p id="modSources" class="foot"></p><div class="buttons"><button id="saveConfiguration">構成を保存</button><button id="loadConfiguration">構成を読み込む</button></div><input id="configurationFile" type="file" accept=".json,application/json" hidden></details>';document.querySelector('aside h1').nextElementSibling.after(panel)}
 const status=panel.querySelector('#configStatus');
 for(const [key,label] of [...(gantry?[['gantry','ガントリー']]:[]),['toolhead','ツールヘッド'],['mount','取付 / 交換方式'],['extruder','押出機'],['hotend','ホットエンド'],['carriage','キャリッジ'],['probe','ベッドプローブ'],['board','ツールヘッド基板'],['cooling','冷却']]){
  if(document.querySelector('#'+key+'Config'))continue;const caption=document.createElement('label'),select=document.createElement('select');select.id=key+'Config';caption.htmlFor=select.id;caption.textContent=label;select.disabled=true;status.before(caption,select);
 }
 if(monolithUnavailable){const message=document.createElement('p');message.className='foot notice';message.textContent=monolithUnavailable+'。標準ガントリーは引き続き選択できます。';panel.append(message)}
 if(gantry){panel.querySelector('summary').textContent='ガントリー・ヘッド構成';const head=document.querySelector('#toolheadConfig'),mount=document.querySelector('#mountConfig');head.previousElementSibling.before(mount.previousElementSibling,mount)}
 return panel;
}
export async function setupV24MachineHeads({machine,profile,adapter,scene,render,applyPose,nativeInputHashes=null,beforeInstall=async()=>{},stockProbes=[],onChange=()=>{}}){return workspaceTask(async()=>{
 const data=await loadMachineHeadCatalog(machine),{heads,registry,bank}=data;let catalog=v24HeadCatalog(heads,registry,machine,profile);const binding=registry.machines[machine];catalog.bank_data=bank;if(!binding)throw Error('機種のヘッド取付データがありません');
 const stock={reference:[...profile.display_reference_xyz_mm],tip:[...profile.nozzle_tip_mm],limits:JSON.parse(JSON.stringify(profile.display_limits_mm)),clearance:document.querySelector('#clearanceStatus')?.textContent};
 const probes=stockProbes.length?stockProbes:[{id:'stock_panasonic',label:'標準Panasonic'},{id:'none',label:'プローブなし',hidden_stock_keys:binding.stock_probe_keys||[]}];
 for(const p of probes)if(!catalog.probes.some(v=>v.id===p.id))catalog.probes.push({id:p.id,label:p.label});
 const baseline=probes.map(p=>({id:(profile.available_configurations?.[0]?.id||'stock')+'__'+p.id,toolhead:'stealthburner',mount:'fixed',extruder:'cw2',hotend:'revo_voron',gantry:'machine_gantry',carriage:'standard',probe:p.id,board:'none',cooling:'source',belt_width_mm:6,xy_motors:v24NativeDriveMetadata(machine,profile)?.xy_drive_count??binding.xy_motors,modules:[],baseline_probe:p.id,notes:['元の機体CADの標準ヘッド。'],fit:{nozzle_mm:stock.tip,...(stockProbeFit(p)?{probe:stockProbeFit(p)}:{})}}));catalog.variants.unshift(...baseline);
 catalog=await loadMonolithMachines(catalog,data);catalog.dimensions=['gantry','mount','toolhead','extruder','hotend','carriage','probe','board','cooling'];catalog.bank_data=bank;const rig=createMachineHeads(scene,catalog,{render}),gantryVisibility=stockGantryVisibility(adapter.nodes);
 const markers=new THREE.Group();markers.name='Native_Intersection_Part_Bounds';scene.add(markers);
 const clearMarkers=()=>{for(const h of markers.children){h.geometry.dispose();h.material.dispose()}markers.clear()};
 const inspectPose=(xyz,hit)=>{
  for(const[i,a]of ['x','y','z'].entries()){const input=document.querySelector('#'+a);input.value=xyz[i];input.dispatchEvent(new window.Event('input',{bubbles:true}))}const enclosure=document.querySelector('#enclosure');if(enclosure&&!enclosure.checked){enclosure.checked=true;enclosure.onchange?.()}applyPose();clearMarkers();
  if(hit){let head;if(Number.isInteger(hit.slot)){rig.bankRig.traverse(o=>{if(o.isMesh&&String(partKey(o))===hit.head_part&&o.parent?.userData.tool_bank?.slot===hit.slot)head=o});if(!head)for(const root of rig.bankRig.children)if(root.userData.tool_bank?.slot===hit.slot&&root.userData.tool_bank.asset===hit.head_module)root.traverse(o=>{if(o.isMesh&&String(partKey(o))===hit.head_part)head=o})}else head=rig.cache.get(hit.head_module)?.loaded?.entries.find(e=>e.key===hit.head_part)?.mesh;
   for(const node of [head,adapter.nodes.get(hit.fixture_part)])if(node){const marker=new THREE.BoxHelper(node,'#e98425');marker.userData.intersection_part_bounds=true;markers.add(marker)}
  }render();
 };
 const panel=ensureMachineHeadControls({gantry:true,monolithUnavailable:catalog.monolith_unavailable}),toolBank=setupChangerBank({catalog,rig,data:bank,inspectPose});let custom=false,baselineHidden=new Set(),installed=false;
 function visibility(){for(const key of binding.stock_head_keys){const node=adapter.nodes.get(key);if(node)node.visible=!custom&&!baselineHidden.has(key)}if(custom)for(const [key,node] of adapter.nodes)if(adapter.records.get(key).motion==='reference_flexible'&&!/^(?:[AB]|Z) Belt(?: \(\d+\))?$/.test(adapter.records.get(key).name||''))node.visible=false}
 async function install(v){return workspaceTask(async()=>{
  clearMarkers();
  if(v.native_alpha_92?.reset_xyz_mm&&(!nativeInputHashes||nativeInputHashes['machine_profile.json']!==v.native_alpha_92.source_profile_sha256||nativeInputHashes['assembly_manifest.json']!==v.native_alpha_92.source_manifest_sha256))throw Error('Trinity alpha actual native host profile/manifest hash mismatch');
  await beforeInstall(v);await toolBank.install(v);gantryVisibility.install(v);custom=!!v.machine_head;baselineHidden=new Set(probes.find(p=>p.id===v.baseline_probe)?.hidden_stock_keys||[]);
  if(custom){profile.nozzle_tip_mm=[...v.machine_head.nozzle_mm];profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-profile.bed_surface_min_xy_mm[0],profile.nozzle_tip_mm[1]-profile.bed_surface_min_xy_mm[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm]}
  else{profile.nozzle_tip_mm=[...stock.tip];profile.display_reference_xyz_mm=[...stock.reference]}
  profile.display_reference_xyz_mm=alphaReference(profile,v,profile.display_reference_xyz_mm);
  profile.display_limits_mm=alphaLimits(monolithDisplayLimits(stock.limits,profile.display_reference_xyz_mm,v),v);
  const reset=alphaResetPose(v,profile.display_reference_xyz_mm);
  for(const axis of ['x','y','z']){const input=document.querySelector('#'+axis),[min,max]=profile.display_limits_mm[axis.toUpperCase()];input.step=v.native_alpha_92?'any':axis==='z'?'1':'0.1';input.min=min;input.max=max;input.value=v.native_alpha_92?reset[['x','y','z'].indexOf(axis)]:Math.max(min,Math.min(max,Number(input.value)))}
  const clearance=document.querySelector('#clearanceStatus');if(clearance)clearance.textContent=v.native_alpha_92?alphaRangeNotice(v):v.machine_gantry?.z_delta_limits_mm?'Monolith · '+['X','Y','Z'].map(a=>a+' '+profile.display_limits_mm[a].map(n=>n.toFixed(1)).join('–')).join(' / ')+' mm':stock.clearance;
  const resetButton=document.querySelector('#reset');if(resetButton){resetButton.dataset.i18nId=v.native_alpha_92?'text.0843':'text.0745';resetButton.textContent=alphaResetLabel(v);}
  onChange(v);applyPose();visibility();gantryVisibility.update();installed=true;const link=document.querySelector('#toolheadLink');if(link){const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',v.source_head_configuration||'trident_r2__stealthburner__revo_voron__cw2');link.href=url.href}
 });}
 const query=new URLSearchParams(location.search),requestedProbe=query.get('probe');
 if(!catalog.variants.some(v=>v.id===query.get('configuration'))&&requestedProbe){const preferred=baseline.find(v=>v.probe===requestedProbe);if(preferred){catalog.variants=catalog.variants.filter(v=>v!==preferred);catalog.variants.unshift(preferred)}}
 await toolBank.bind(await setupConfigurations(catalog,install,{...toolBank.options,inspectPose}));
 if(!installed)throw Error('ヘッド構成を表示できませんでした');
 return {rig,panel,catalog,update:pose=>{rig.setDelta(pose.cad_delta_xyz_mm);rig.gantry.setFlexibleVisible(document.querySelector('#belts')?.checked??true);visibility();gantryVisibility.update();for(const marker of markers.children)marker.update()},setPalette:value=>rig.setPalette(value),focus:(camera,controls)=>rig.focus(camera,controls),get custom(){return custom},get monolith(){return !!rig.gantry.active},get variant(){return rig.active}};
});}
