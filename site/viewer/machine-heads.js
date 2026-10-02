import {monolithDisplayLimits} from './monolith-machine-model.mjs?v=monolith-machine-1';
import {loadMonolithMachines,createMonolithGantry,stockGantryVisibility} from './monolith-machine.js?v=monolith-machine-1';
import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=public-v24';
import {appearanceRole} from './appearance-role.mjs?v=public-v24';
import {partKey} from './head-assembly.js?v=public-v24';
import {v24HeadCatalog} from './machine-head-model.mjs?v=public-v24';
import {setupConfigurations} from './configurations.js?v=monolith-machine-1';

import {stockProbeFit} from './probe-mounts.js?v=public-v24';

import {xolEmbeddedBoard,sbEmbeddedBoard,withEmbeddedBoards} from './embedded-boards.mjs?v=public-v24';
import {bankPlan} from './changer-bank-model.mjs?v=monolith-machine-1';
import {setupChangerBank} from './changer-bank.js?v=monolith-machine-1';

const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
export async function loadMachineHeadCatalog(){
 const get=async name=>{const r=await fetch('../'+name,{cache:'no-cache'});if(!r.ok)throw Error('ヘッドの取付データを取得できません');return r.json()};
 const [heads,registry,bank]=await Promise.all([get('TOOLHEAD_CONFIGURATIONS.json'),get('MACHINE_HEAD_REGISTRATIONS.json'),get('TOOLCHANGER_BANK.json')]);heads.assets={...heads.assets,...bank.assets};const board=[xolEmbeddedBoard(await get(heads.base_assets.xol.meta)),sbEmbeddedBoard(await get(heads.base_assets.stealthburner.meta))];return {heads:withEmbeddedBoards(heads,board),registry,bank};
}
export function createMachineHeads(scene,catalog,{render=()=>{}}={}){
 const gantry=createMonolithGantry(scene,catalog);
 const cache=new Map(),rig=new THREE.Group(),bankRig=new THREE.Group();rig.name='Installed_Machine_Head';bankRig.name='Frame_Tool_Bank';scene.add(rig,bankRig);let current=null,palette={base:'#24272c',accent:'#e32636'},delta=[0,0,0],bankState=null,bankEntries=[];
 async function asset(id){
  if(cache.has(id))return cache.get(id);const spec=catalog.base_assets?.[id]||catalog.assets[id];if(!spec)throw Error('未登録のヘッド部品：'+id);
  const promise=Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('ヘッドの部品表');return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb)]).then(([meta,g])=>{
   const lookup=new Map(meta.parts.map(p=>[String(p.key),p])),entries=[];g.scene.visible=false;
   g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh),row=lookup.get(String(key));if(!row)throw Error('ヘッドの部品対応が不正です');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of materials){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}entries.push({mesh,key,component:row.component,role:appearanceRole(row)||mesh.userData.appearance_role,materials,colors:materials.map(m=>m.color.clone())})});rig.add(g.scene);return {root:g.scene,entries};
  }).catch(e=>{cache.delete(id);throw e});cache.set(id,promise);return promise;
 }
 function setPalette(value){gantry.setPalette(value);palette={...palette,...value};const rows=[...bankEntries,...[...cache.values()].flatMap(p=>p.loaded?.entries||[])];for(const row of rows)for(let i=0;i<row.materials.length;i++){const m=row.materials[i],color=palette[row.role];if(color)m.color.set(color);else m.color.copy(row.colors[i]);if(['base','accent'].includes(row.role)){m.metalness=0;m.roughness=.58}}}
 async function stagedBank(state,variant){
  if(!state?.enabled)return {state,roots:[],entries:[]};const plan=bankPlan(state,catalog,catalog.bank_data,variant);
  const ids=[...new Set(plan.instances.map(p=>p.id))];await Promise.all(ids.map(async id=>{const a=await asset(id);cache.get(id).loaded=a}));
  const roots=[],entries=[];
  for(const entry of plan.instances){const a=cache.get(entry.id).loaded,root=a.root.clone(true),lookup=new Map(a.entries.map(e=>[String(e.key),e])),hidden=new Set(entry.hidden_keys||[]);root.visible=true;root.name='Dock_'+entry.slot+'_'+entry.id;root.userData.tool_bank={slot:entry.slot,kind:entry.kind,asset:entry.id};root.position.copy(point(entry.translation_mm));
   root.traverse(mesh=>{if(!mesh.isMesh)return;const row=lookup.get(String(partKey(mesh)));if(!row)throw Error('ドックの部品対応が不正です');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];mesh.visible=!hidden.has(row.key)&&!['rail_reference','dock','shuttle_reference'].includes(row.component);const offset=entry.part_offsets_mm?.[row.key];if(offset)mesh.position.add(point(offset));entries.push({...row,mesh,materials,colors:row.colors.map(c=>c.clone())})});roots.push(root);
  }
  return {state:plan.state,roots,entries};
 }
 function commitBank(staged){for(const row of bankEntries)for(const material of row.materials)material.dispose();bankRig.clear();if(staged.roots.length)bankRig.add(...staged.roots);bankEntries=staged.entries;bankState=staged.state;setPalette(palette)}
 async function setBank(state){const staged=await stagedBank(state,current);commitBank(staged);render()}
 async function install(variant,state=bankState){
  await gantry.install(variant);
  if(!variant?.machine_head){for(const p of cache.values())if(p.loaded)p.loaded.root.visible=false;current=null;commitBank({state:state?{...state,enabled:false}:null,roots:[],entries:[]});return}
  const plan=variant.machine_head,required=[...new Set([plan.base,...plan.modules.map(m=>m.id)])];await Promise.all(required.map(async id=>{const a=await asset(id);cache.get(id).loaded=a}));
  const staged=await stagedBank(state,variant);
  for(const p of cache.values())if(p.loaded){p.loaded.root.visible=false;p.loaded.root.position.set(0,0,0)}
  const place=(id,translation,hidden=[])=>{const a=cache.get(id).loaded,omit=new Set(hidden);a.root.visible=true;a.root.position.copy(point(translation));for(const e of a.entries)e.mesh.visible=!omit.has(e.key)&&!['rail_reference','dock','shuttle_reference'].includes(e.component)};
  place(plan.base,plan.translation,plan.hidden);for(const m of plan.modules)place(m.id,m.translation_mm,m.hidden_keys);current=variant;commitBank(staged);setPalette(palette);setDelta(delta);render();
 }
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
export async function setupV24MachineHeads({machine,profile,adapter,scene,render,applyPose,beforeInstall=async()=>{},stockProbes=[],onChange=()=>{}}){
 const data=await loadMachineHeadCatalog(),{heads,registry,bank}=data;let catalog=v24HeadCatalog(heads,registry,machine);const binding=registry.machines[machine];catalog.bank_data=bank;if(!binding)throw Error('機種のヘッド取付データがありません');
 const stock={reference:[...profile.display_reference_xyz_mm],tip:[...profile.nozzle_tip_mm],limits:JSON.parse(JSON.stringify(profile.display_limits_mm)),clearance:document.querySelector('#clearanceStatus')?.textContent};
 const probes=stockProbes.length?stockProbes:[{id:'stock_panasonic',label:'標準Panasonic'},{id:'none',label:'プローブなし',hidden_stock_keys:binding.stock_probe_keys||[]}];
 for(const p of probes)if(!catalog.probes.some(v=>v.id===p.id))catalog.probes.push({id:p.id,label:p.label});
 const baseline=probes.map(p=>({id:(profile.available_configurations?.[0]?.id||'stock')+'__'+p.id,toolhead:'stealthburner',mount:'fixed',extruder:'cw2',hotend:'revo_voron',gantry:'machine_gantry',carriage:'standard',probe:p.id,board:'none',cooling:'source',belt_width_mm:6,xy_motors:binding.xy_motors,modules:[],baseline_probe:p.id,notes:['元の機体CADの標準ヘッド。'],fit:{nozzle_mm:stock.tip,...(stockProbeFit(p)?{probe:stockProbeFit(p)}:{})}}));catalog.variants.unshift(...baseline);
 catalog=await loadMonolithMachines(catalog,data);catalog.dimensions=['gantry','mount','toolhead','extruder','hotend','carriage','probe','board','cooling'];catalog.bank_data=bank;const rig=createMachineHeads(scene,catalog,{render}),gantryVisibility=stockGantryVisibility(adapter.nodes);
 const panel=ensureMachineHeadControls({gantry:true,monolithUnavailable:catalog.monolith_unavailable}),toolBank=setupChangerBank({catalog,rig,data:bank});let custom=false,baselineHidden=new Set(),installed=false;
 function visibility(){for(const key of binding.stock_head_keys){const node=adapter.nodes.get(key);if(node)node.visible=!custom&&!baselineHidden.has(key)}if(custom)for(const [key,node] of adapter.nodes)if(adapter.records.get(key).motion==='reference_flexible'&&!/^Z Belt(?: \(\d+\))?$/.test(adapter.records.get(key).name||''))node.visible=false}
 async function install(v){
  await beforeInstall(v);await toolBank.install(v);gantryVisibility.install(v);custom=!!v.machine_head;baselineHidden=new Set(probes.find(p=>p.id===v.baseline_probe)?.hidden_stock_keys||[]);
  if(custom){profile.nozzle_tip_mm=[...v.machine_head.nozzle_mm];profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-profile.bed_surface_min_xy_mm[0],profile.nozzle_tip_mm[1]-profile.bed_surface_min_xy_mm[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm]}
  else{profile.nozzle_tip_mm=[...stock.tip];profile.display_reference_xyz_mm=[...stock.reference]}
  profile.display_limits_mm=monolithDisplayLimits(stock.limits,profile.display_reference_xyz_mm,v);
  for(const axis of ['x','y','z']){const input=document.querySelector('#'+axis),[min,max]=profile.display_limits_mm[axis.toUpperCase()];input.min=min;input.max=max;input.value=Math.max(min,Math.min(max,Number(input.value)))}
  const clearance=document.querySelector('#clearanceStatus');if(clearance)clearance.textContent=v.machine_gantry?.z_delta_limits_mm?'Monolith · '+['X','Y','Z'].map(a=>a+' '+profile.display_limits_mm[a].map(n=>n.toFixed(1)).join('–')).join(' / ')+' mm':stock.clearance;
  onChange(v);applyPose();visibility();gantryVisibility.update();installed=true;const link=document.querySelector('#toolheadLink');if(link){const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',v.source_head_configuration||'trident_r2__stealthburner__revo_voron__cw2');link.href=url.href}
 }
 const query=new URLSearchParams(location.search),requestedProbe=query.get('probe');
 if(!catalog.variants.some(v=>v.id===query.get('configuration'))&&requestedProbe){const preferred=baseline.find(v=>v.probe===requestedProbe);if(preferred){catalog.variants=catalog.variants.filter(v=>v!==preferred);catalog.variants.unshift(preferred)}}
 await toolBank.bind(await setupConfigurations(catalog,install,toolBank.options));
 if(!installed)throw Error('ヘッド構成を表示できませんでした');
 return {rig,panel,catalog,update:pose=>{rig.setDelta(pose.cad_delta_xyz_mm);rig.gantry.setFlexibleVisible(document.querySelector('#belts')?.checked??true);visibility();gantryVisibility.update()},setPalette:value=>rig.setPalette(value),focus:(camera,controls)=>rig.focus(camera,controls),get custom(){return custom},get monolith(){return !!rig.gantry.active},get variant(){return rig.active}};
}
