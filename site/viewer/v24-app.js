import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=a2d85521f7f516860221';
import * as THREE from 'three';
import {loadFrameMods,withFrameMods} from './frame-mods.js?v=0d49b1113e8a089e3cd9';
import {setupLighting} from './lighting.js?v=454c19f7ca3795b005de';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=workspace-belts-2';
import {setupAccessories} from './accessories.js?v=workspace-belts-2';
import {setupGrid} from './grid-control.js?v=workspace-belts-1';
import {setupProbeMounts} from './probe-mounts.js?v=81f922c3169490021d08';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {createV24Adapter} from './v24_adapter.mjs?v=a98c4f8037232d4e7b5d';
import {setupMachineNavigation} from './machines.js?v=d6045b8af89b3984adcb';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {setupPublicInfo} from './public-info.js?v=0b0f91d7a82d25acbb87';
import {setupV24MachineHeads} from './machine-heads.js?v=c0357ec27a81063a7596';
export async function mount(scope){
setupMachineNavigation('siboor_v24_350');
setupPublicInfo();
const $=s=>document.querySelector(s),stage=$('#stage'),status=$('#status');
const assetRoot='../machines/siboor_v24_350/';
const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));stage.append(renderer.domElement);
renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.005,10);camera.position.set(.98,.83,1.4);
const orbit=scope.resource(new OrbitControls(camera,renderer.domElement));orbit.target.set(0,.22,0);orbit.enableDamping=false;orbit.update();
let adapter,profile,pose,probeMounts,machineHeads,program,renderPending=false,frames=0;
function render(){if(renderPending)return;renderPending=true;workspaceFrame(()=>{renderPending=false;renderer.render(scene,camera);document.body.dataset.renderedFrames=++frames})}
setupGrid(scene,render);
const frameMods=await loadFrameMods('siboor_v24_350');
const lighting=setupLighting(scene,renderer,{registration:frameMods.disco,machine:'siboor_v24_350',update:render});
$('#focusDisco').onclick=()=>{lighting.focus(camera,orbit);render()};
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
orbit.addEventListener('change',render);new WorkspaceResizeObserver(resize).observe(stage);
for(const [id,pos] of [['iso',[.98,.83,1.4]],['front',[0,.24,1.65]],['top',[0,1.8,0]]])$('#'+id).onclick=()=>{camera.up.set(0,id==='top'?0:1,id==='top'?-1:0);camera.position.set(...pos);orbit.target.set(0,.22,0);frameResponsiveView(camera,orbit);render()};
$('#focusHead').onclick=()=>{if(!adapter||machineHeads?.focus(camera,orbit))return;const box=new THREE.Box3();for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)box.expandByObject(node);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.15,.08,.3));orbit.update();document.body.dataset.focusTarget=JSON.stringify(orbit.target.toArray());render()};
function applyPose(){if(!adapter)return;
 pose=adapter.setPose({x:Number($('#x').value),y:Number($('#y').value),z:Number($('#z').value)});
 machineHeads?.update(pose);
 probeMounts?.setPose(pose.cad_delta_xyz_mm);
 for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(1)+' mm';
 const p=adapter.getSummary();document.body.dataset.ready='true';document.body.dataset.parts=p.part_count+(probeMounts?.partDelta()||0);
 $('#badge').textContent=machineHeads?.monolith?'V2.4 / 350 · Monolith '+machineHeads.variant.belt_width_mm+' mm':'V2.4 R2 / 350 · '+Number(document.body.dataset.parts).toLocaleString()+' PARTS';
 if(probeMounts&&!machineHeads?.custom){const link=new URL('./toolheads.html',location.href);link.searchParams.set('configuration','trident_r2__stealthburner__revo_voron__cw2'+(['stock_panasonic','none'].includes(probeMounts.id)?'':'__'+probeMounts.id));$('#toolheadLink').href=link.href}
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.fixedBed=JSON.stringify(p.fixed_bed_keys.map(k=>adapter.nodes.get(k).position.toArray()));
 document.body.dataset.zGuidePositions=JSON.stringify(p.z_guide_block_keys.map(k=>adapter.nodes.get(k).position.toArray()));
 document.body.dataset.flexibleVisible=String(pose.flexible_visible_count>0);
 $('#motionBeltHelp').textContent=machineHeads?.monolith?'MonolithのXYベルトはヘッド・Y軸・ガントリーの移動に追従します。クランプ内部・歯・張力は未再現です。':'Zベルトはフレーム側で固定。XYベルトはヘッド・Y軸・ガントリーに追従します。移動時はクランプ内部・歯・張力を省いた経路プレビューです。';
 $('#motionStatus').textContent=machineHeads?.monolith?'ベッド固定 · Monolithの8個のZガイド・ガントリー・XYベルトが追従':'ベッド固定 · 4ZガイドとガントリーがZ＋へ追従';$('#beltWidths').textContent=`XYベルト ${machineHeads?.variant?.belt_width_mm||profile.xy_belt_width_mm} mm ／ Zベルト ${profile.z_belt_width_mm} mm`;render();
}
try{
 const getJSON=async name=>{return workspaceTask(async()=>{const r=await fetch(assetRoot+name,{cache:'no-cache'});if(!r.ok)throw Error(name);return r.json()});};
 const [manifest,machine,gltf]=await Promise.all([getJSON('assembly_manifest.json'),getJSON('machine_profile.json'),loadModel(new GLTFLoader(),assetRoot+'model.glb')]);
 profile=machine;scene.add(gltf.scene);adapter=createV24Adapter(gltf.scene,manifest,profile);
 const probeResponse=await fetch('../V24_PROBES.json?v=trident-clearance-35',{cache:'no-cache'});if(!probeResponse.ok)throw Error('プローブ構成を取得できません');const probeCatalog=await probeResponse.json();
 const protectedMaterials=[],originals=new Map();
 for(const [key,node] of adapter.nodes){node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(m,m.color.clone());if(!appearanceRole(adapter.records.get(key)))protectedMaterials.push(m);if(m.transparent)m.depthWrite=false}
 });}
 adapter.setEnclosureVisible($('#enclosure').checked);
 for(const [i,a] of ['x','y','z'].entries()){
  const limits=profile.display_limits_mm[a.toUpperCase()];$('#'+a).min=limits[0];$('#'+a).max=limits[1];$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose;
 }
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose()};
 $('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);document.body.dataset.panelsVisible=String($('#enclosure').checked);render()};
 $('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),storageKey=profile.appearance.storage_key;
 let palette={base:null,accent:null,frame:null};
 const modMeshes=[],modAssets=new Map();
 function loadAccessory(id){
  if(modAssets.has(id))return modAssets.get(id);
  const promise=loadAccessoryModel(id).catch(e=>{modAssets.delete(id);throw e});modAssets.set(id,promise);return promise;
 }
 async function loadAccessoryModel(id){return workspaceTask(async()=>{
  const spec=frameMods.assets[id]||probeCatalog.assets[id];if(!spec)throw Error('未登録のMod');
  const [meta,g]=await Promise.all([fetch('../'+spec.meta).then(r=>{if(!r.ok)throw Error(spec.meta);return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb)]);
  const lookup=new Map(meta.parts.map(p=>[p.key,p]));g.scene.visible=false;scene.add(g.scene);
  g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const row=lookup.get(mesh.userData.part_key||mesh.name);if(!row||row.motion!==(probeCatalog.assets[id]?'xy':'fixed'))throw Error('Modの取付先が不正です');mesh.material=mesh.material.clone();mesh.material.side=THREE.DoubleSide;modMeshes.push({mesh,role:appearanceRole(row),color:mesh.material.color.clone()})});
  applyPalette();return {root:g.scene,meta};
 });}
 const modCatalog=withFrameMods({assets:{},accessories:[]},frameMods);
 setupAccessories(modCatalog,{load:loadAccessory,update:applyPose});
 const stockProbe=$('#probeConfig');stockProbe.id='stockProbeConfig';document.querySelector('label[for="probeConfig"]').htmlFor='stockProbeConfig';
 probeMounts=await setupProbeMounts(probeCatalog,{selectId:'stockProbeConfig',load:loadAccessory,setHidden:(keys,hidden)=>{for(const key of keys){const node=adapter.nodes.get(key);if(!node)throw Error('プローブ交換部品がありません: '+key);node.visible=!hidden}},update:applyPose});
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.machine_id===profile.machine_id)for(const r of ['base','accent','frame'])if(valid(saved.colors?.[r]))palette[r]=saved.colors[r]}catch{}
 function applyPalette(){
  for(const [material,color] of originals)material.color.copy(color);
  adapter.setPalette(palette);
  machineHeads?.setPalette(Object.fromEntries(Object.entries(palette).map(([r,c])=>[r,c||profile.appearance.palette_defaults[r]])));
  for(const {mesh,role,color} of modMeshes){mesh.material.color.copy(color);if(role)mesh.material.color.set(palette[role]||profile.appearance.palette_defaults[role])}
  for(const role of ['base','accent','frame']){const value=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=value;$('#'+role+'Hex').value=value;$('#'+role+'Hex').removeAttribute('aria-invalid');document.body.dataset[role+'Color']=palette[role]||'original'}
  document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);
  $('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色を保存済み':'標準CADの配色';render();
  $('#frameFinish').disabled=false;$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame==='#25282d'?'black':'custom';
 }
 function savePalette(){try{localStorage.setItem(storageKey,JSON.stringify({machine_id:profile.machine_id,colors:palette}))}catch{$('#paletteStatus').textContent='この画面に配色を適用中'}}
 for(const role of ['base','accent','frame']){
  $('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;
  $('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();savePalette()};
  $('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v.toLowerCase();applyPalette();savePalette()};
 }
 const disco=await lighting.whenReady;disco?.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.led_role==='bracket')modMeshes.push({mesh,role:'base',color:mesh.material.color.clone()})});
 $('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();savePalette()};applyPalette();
 $('#frameFinish').onchange=e=>{if(e.target.value==='custom')return;palette.frame=e.target.value==='silver'?'#b9bec4':'#25282d';applyPalette();savePalette()};
 machineHeads=await setupV24MachineHeads({machine:'siboor_v24_350',profile,adapter,scene,render,applyPose,stockProbes:probeCatalog.probes,beforeInstall:async v=>{return workspaceTask(async()=>{program?.invalidate();await probeMounts.apply(v.baseline_probe||'none')});},onChange:()=>{program?.invalidate();applyPalette()}});stockProbe.closest('details').hidden=true;applyPalette();
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,getContext:()=>machineHeads.variant?.id||'stock',setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 setupRenderExport({renderer,scene,camera,controls:orbit,afterRender:render,name:'VORON_V24_R2_350_Reference'});
 document.body.dataset.geometryRevision=profile.geometry_revision;document.body.dataset.panelsVisible=String($('#enclosure').checked);
 document.body.dataset.endstopStatus=profile.endstop_registration_or_pending.status;
 document.body.dataset.qglStatus=profile.qgl.independent_corner_tilt;
 document.body.dataset.xyBeltWidthMm=profile.xy_belt_width_mm;document.body.dataset.zBeltWidthMm=profile.z_belt_width_mm;
 $('#beltWidths').textContent=`XYベルト ${profile.xy_belt_width_mm} mm ／ Zベルト ${profile.z_belt_width_mm} mm`;
 $('#badge').textContent='V2.4 R2 / 350 · '+manifest.parts.length.toLocaleString()+' PARTS';status.hidden=true;applyPose();resize();
}catch(e){status.textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}

}
