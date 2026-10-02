import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=public-v17-en1';
import {appearanceRole} from './appearance-role.mjs?v=public-v17-en1';
import {partKey} from './head-assembly.js?v=public-v17-en1';
import {v24HeadCatalog} from './machine-head-model.mjs?v=public-v17-en1';
import {setupConfigurations} from './configurations.js?v=public-v17-en1';
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
export async function loadMachineHeadCatalog(){
 const get=async name=>{const r=await fetch('../'+name,{cache:'no-cache'});if(!r.ok)throw Error('ヘッドの取付データを取得できません');return r.json()};
 const [heads,registry]=await Promise.all([get('TOOLHEAD_CONFIGURATIONS.json'),get('MACHINE_HEAD_REGISTRATIONS.json')]);return {heads,registry};
}
export function createMachineHeads(scene,catalog,{render=()=>{}}={}){
 const cache=new Map(),rig=new THREE.Group();rig.name='Installed_Machine_Head';scene.add(rig);let current=null,palette={base:'#24272c',accent:'#e32636'},delta=[0,0,0];
 async function asset(id){
  if(cache.has(id))return cache.get(id);const spec=catalog.base_assets?.[id]||catalog.assets[id];if(!spec)throw Error('未登録のヘッド部品：'+id);
  const promise=Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('ヘッドの部品表');return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb)]).then(([meta,g])=>{
   const lookup=new Map(meta.parts.map(p=>[String(p.key),p])),entries=[];g.scene.visible=false;
   g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh),row=lookup.get(String(key));if(!row)throw Error('ヘッドの部品対応が不正です');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of materials){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}entries.push({mesh,key,component:row.component,role:appearanceRole(row)||mesh.userData.appearance_role,materials,colors:materials.map(m=>m.color.clone())})});rig.add(g.scene);return {root:g.scene,entries};
  }).catch(e=>{cache.delete(id);throw e});cache.set(id,promise);return promise;
 }
 function setPalette(value){palette={...palette,...value};for(const p of cache.values())if(p.loaded)for(const row of p.loaded.entries)for(let i=0;i<row.materials.length;i++){const m=row.materials[i],color=palette[row.role];if(color)m.color.set(color);else m.color.copy(row.colors[i]);if(['base','accent'].includes(row.role)){m.metalness=0;m.roughness=.58}}}
 async function install(variant){
  if(!variant?.machine_head){for(const p of cache.values())if(p.loaded)p.loaded.root.visible=false;current=null;return}
  const plan=variant.machine_head,required=[...new Set([plan.base,...plan.modules.map(m=>m.id)])];await Promise.all(required.map(async id=>{const a=await asset(id);cache.get(id).loaded=a}));
  for(const p of cache.values())if(p.loaded){p.loaded.root.visible=false;p.loaded.root.position.set(0,0,0)}
  const place=(id,translation,hidden=[])=>{const a=cache.get(id).loaded,omit=new Set(hidden);a.root.visible=true;a.root.position.copy(point(translation));for(const e of a.entries)e.mesh.visible=!omit.has(e.key)&&!['rail_reference','dock','shuttle_reference'].includes(e.component)};
  place(plan.base,plan.translation,plan.hidden);for(const m of plan.modules)place(m.id,m.translation_mm,m.hidden_keys);current=variant;setPalette(palette);setDelta(delta);render();
 }
 function setDelta(value){delta=[...value];rig.position.copy(point(delta));rig.updateMatrixWorld(true)}
 function setVisible(value){rig.visible=Boolean(value)}
 function focus(camera,controls){if(!current)return false;rig.updateMatrixWorld(true);const box=new THREE.Box3(),visible=o=>o.visible&&(!o.parent||visible(o.parent));rig.traverse(o=>{if(o.isMesh&&visible(o))box.expandByObject(o)});if(box.isEmpty())return false;camera.up.set(0,1,0);box.getCenter(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(.13,.07,.25));controls.update();render();return true}
 return {install,setDelta,setPalette,setVisible,focus,get active(){return current},rig,cache};
}
export function ensureMachineHeadControls(){
 let panel=document.querySelector('#configurationControls');
 if(!panel){panel=document.createElement('details');panel.id='configurationControls';panel.open=true;panel.innerHTML='<summary>ヘッド構成</summary><p id="configStatus" class="status" aria-live="polite"></p><p id="configSummary"></p><details><summary>取付条件・確認範囲</summary><ul id="mountInfo" class="foot"></ul><ul id="configRequirements" class="foot"></ul><p id="modSources" class="foot"></p><div class="buttons"><button id="saveConfiguration">構成を保存</button><button id="loadConfiguration">構成を読み込む</button></div><input id="configurationFile" type="file" accept=".json,application/json" hidden></details>';document.querySelector('aside h1').nextElementSibling.after(panel)}
 const status=panel.querySelector('#configStatus');
 for(const [key,label] of [['toolhead','ツールヘッド'],['mount','取付 / 交換方式'],['extruder','押出機'],['hotend','ホットエンド'],['carriage','キャリッジ'],['probe','ベッドプローブ'],['board','ツールヘッド基板'],['cooling','冷却']]){
  if(document.querySelector('#'+key+'Config'))continue;const caption=document.createElement('label'),select=document.createElement('select');select.id=key+'Config';caption.htmlFor=select.id;caption.textContent=label;select.disabled=true;status.before(caption,select);
 }
 return panel;
}
export async function setupV24MachineHeads({machine,profile,adapter,scene,render,applyPose,beforeInstall=async()=>{},stockProbes=[],onChange=()=>{}}){
 const {heads,registry}=await loadMachineHeadCatalog(),catalog=v24HeadCatalog(heads,registry,machine),binding=registry.machines[machine];if(!binding)throw Error('機種のヘッド取付データがありません');
 const stock={reference:[...profile.display_reference_xyz_mm],tip:[...profile.nozzle_tip_mm]},rig=createMachineHeads(scene,catalog,{render});
 const probes=stockProbes.length?stockProbes:[{id:'stock_panasonic',label:'標準Panasonic'},{id:'none',label:'プローブなし',hidden_stock_keys:binding.stock_probe_keys||[]}];
 for(const p of probes)if(!catalog.probes.some(v=>v.id===p.id))catalog.probes.push({id:p.id,label:p.label});
 const baseline=probes.map(p=>({id:(profile.available_configurations?.[0]?.id||'stock')+'__'+p.id,toolhead:'stealthburner',mount:'fixed',extruder:'cw2',hotend:'revo_voron',gantry:'machine_gantry',carriage:'standard',probe:p.id,board:'none',cooling:'source',belt_width_mm:6,xy_motors:binding.xy_motors,modules:[],baseline_probe:p.id,notes:['元の機体CADの標準ヘッド。'],fit:{nozzle_mm:stock.tip}}));catalog.variants.unshift(...baseline);
 const panel=ensureMachineHeadControls();let custom=false,baselineHidden=new Set(),installed=false;
 function visibility(){for(const key of binding.stock_head_keys){const node=adapter.nodes.get(key);if(node)node.visible=!custom&&!baselineHidden.has(key)}if(custom)for(const [key,node] of adapter.nodes)if(adapter.records.get(key).motion==='reference_flexible')node.visible=false}
 async function install(v){
  await beforeInstall(v);await rig.install(v);custom=!!v.machine_head;baselineHidden=new Set(probes.find(p=>p.id===v.baseline_probe)?.hidden_stock_keys||[]);
  if(custom){profile.nozzle_tip_mm=[...v.machine_head.nozzle_mm];profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-profile.bed_surface_min_xy_mm[0],profile.nozzle_tip_mm[1]-profile.bed_surface_min_xy_mm[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm]}
  else{profile.nozzle_tip_mm=[...stock.tip];profile.display_reference_xyz_mm=[...stock.reference]}
  onChange(v);applyPose();visibility();installed=true;const link=document.querySelector('#toolheadLink');if(link){const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',v.source_head_configuration||'trident_r2__stealthburner__revo_voron__cw2');link.href=url.href}
 }
 const query=new URLSearchParams(location.search),requestedProbe=query.get('probe');
 if(!catalog.variants.some(v=>v.id===query.get('configuration'))&&requestedProbe){const preferred=baseline.find(v=>v.probe===requestedProbe);if(preferred){catalog.variants=catalog.variants.filter(v=>v!==preferred);catalog.variants.unshift(preferred)}}
 await setupConfigurations(catalog,install);
 if(!installed)throw Error('ヘッド構成を表示できませんでした');
 return {rig,panel,catalog,update:pose=>{rig.setDelta(pose.cad_delta_xyz_mm);visibility()},setPalette:value=>rig.setPalette(value),focus:(camera,controls)=>rig.focus(camera,controls),get custom(){return custom}};
}
