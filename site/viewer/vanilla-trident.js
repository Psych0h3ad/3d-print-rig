import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask} from './workspace-lifecycle.mjs';
import {loadMonolithMachines,stockGantryVisibility} from './monolith-machine.js?v=00b77b5268c44e283d7a';
import {monolithDisplayLimits} from './monolith-machine-model.mjs?v=a444255dc35e7c15a082';
import {bankBedReferenceDrop} from './changer-bank-model.mjs?v=024cc52a5bbc61da7506';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=workspace-belts-1';
import * as THREE from 'three';
import {loadFrameMods,withFrameMods} from './frame-mods.js?v=workspace-belts-1';
import {setupLighting} from './lighting.js?v=16f9cd983dca18754bc2';
import {setupGrid} from './grid-control.js?v=workspace-belts-1';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=workspace-belts-1';
import {setupMachineNavigation} from './machines.js?v=9383d20caf1cef38e5d4';
import {setupConfigurations} from './configurations.js?v=9d347c03f3b6b7bd977d';
import {setupAccessories} from './accessories.js?v=workspace-belts-2';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {createTridentMotion} from './trident-motion.mjs?v=extra-machines-55';
import {headPlan,partKey} from './head-assembly.js?v=workspace-belts-1';
import {loadMachineHeadCatalog,createMachineHeads,ensureMachineHeadControls} from './machine-heads.js?v=22e49edc49a2b3b9342f';
import {setupChangerBank} from './changer-bank.js?v=2575f5e3fafcf4c76da2';
import {expandedPrinterCatalog} from './machine-head-model.mjs?v=03db7c7d900ff7f5b2c0';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=workspace-belts-2';
import {programPoint,programPathOffset} from './gcode-timeline.mjs?v=workspace-belts-1';
import {createHeadMarkers} from './head-markers.mjs?v=workspace-belts-1';
export async function mount(scope){
const requestedMachine=new URL(location.href).searchParams.get('machine');
const machine=/^voron_trident_(250|300|350)$/.test(requestedMachine)?requestedMachine:'voron_trident_350',size=Number(machine.split('_').at(-1)),gantryId='trident_r2_gantry_'+size,referenceOffset=(size-350)/2;
setupMachineNavigation(machine);document.querySelector('h1').textContent='Trident / '+size;setupPublicInfo({machineId:machine});
const $=s=>document.querySelector(s),stage=$('#stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#edf1f4');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.005,10),controls=scope.resource(new OrbitControls(camera,renderer.domElement));
camera.position.set(.98,.83,1.4);controls.target.set(0,.22,0);controls.update();
let pending=false,frames=0,motion,catalog,profile,originalLimits,current,active,accessories,installedHeads,toolBank,gantryVisibility,program,headMarkers;
const cached=new Map(),meshes=[],palette={base:'#24272c',accent:'#e32636',frame:'#25282d'};
function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera);document.body.dataset.renderedFrames=++frames})}
setupGrid(scene,render);
const frameMods=await loadFrameMods(machine);
const lighting=setupLighting(scene,renderer,{registration:frameMods.disco,machine,update:render});
$('#focusDisco').onclick=()=>{lighting.focus(camera,controls);render()};
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,controls,b.width,b.height);render()}
controls.addEventListener('change',render);new WorkspaceResizeObserver(resize).observe(stage);
const point=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
function paletteApply(){for(const {mesh,role} of meshes)if(palette[role])mesh.material.color.set(palette[role]);installedHeads?.setPalette(palette);render()}
function register(root,meta){const lookup=new Map(meta.parts.map(p=>[p.key,p]));const records=[];
 root.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh),row=lookup.get(key);if(!row)throw Error('CAD部品表にない部品です: '+key);
  mesh.material=mesh.material.clone();mesh.material.side=THREE.DoubleSide;
  if(row.color?.[3]!=null){mesh.material.opacity=row.color[3];mesh.material.transparent=row.color[3]<1}
  if(mesh.material.transparent)mesh.material.depthWrite=false;
  const r={mesh,key,role:appearanceRole(row),panel:row.panel_surface};meshes.push(r);records.push(r);
 });motion.register(root,meta);paletteApply();return records;
}
async function asset(id){return workspaceTask(async()=>{if(cached.has(id))return cached.get(id);
 const spec=catalog.base_assets[id]||catalog.assets[id];if(!spec)throw Error('未登録のCAD: '+id);
 const promise=Promise.all([fetch('../'+spec.meta).then(r=>{if(!r.ok)throw Error(spec.meta);return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb)]).then(([meta,g])=>{
  const root=g.scene;root.visible=false;scene.add(root);const records=register(root,meta);return {root,meta,meshes:records.map(r=>r.mesh),records};
 }).catch(e=>{cached.delete(id);throw e});cached.set(id,promise);return promise;
});}
function applyPose(){if(!motion)return;
 const reference=active?.machine_gantry?[...active.machine_head.nozzle_mm.slice(0,2).map((n,i)=>n-active.machine_gantry.bed_min_xy_mm[i]),0]:profile.display_reference_xyz_mm;
 profile.display_limits_mm=monolithDisplayLimits(originalLimits||profile.display_limits_mm,reference,active);
 for(const a of ['x','y','z']){const range=profile.display_limits_mm[a.toUpperCase()];$('#'+a).min=range[0];$('#'+a).max=range[1]}
 const selected=accessories?.getExtras().accessories||[];
 const bedReferenceDrop=bankBedReferenceDrop(catalog,catalog.bank_data,installedHeads?.bankState,active);motion.setBedReferenceDrop(bedReferenceDrop);
 const zMax=Math.min(profile.display_limits_mm.Z[1],...selected.map(id=>catalog.accessories.find(a=>a.id===id).z_max_mm??profile.display_limits_mm.Z[1]))-Math.max(0,bedReferenceDrop);
 $('#z').max=zMax;if(Number($('#z').value)>zMax)$('#z').value=zMax;
 current=motion.setPose({x:$('#x').value,y:$('#y').value,z:$('#z').value},{flexibleVisible:$('#belts').checked,toolheadReference:!active?.machine_head});
 program?.updatePath([current.x,current.y,current.z]);
 installedHeads?.setDelta([current.dx,current.dy,0]);installedHeads?.gantry.setFlexibleVisible($('#belts').checked);gantryVisibility?.update();
 headMarkers?.update();
 for(const a of ['x','y','z']){$('#'+a).value=current[a];$('#'+a+'v').textContent=current[a].toFixed(1)+' mm'}
 document.body.dataset.pose=JSON.stringify(current);document.body.dataset.zGuidePositions=JSON.stringify(profile.z_guide_block_keys.map(k=>{const entry=[...motion.entries].find(([mesh,{row}])=>row.key===k);return entry?.[0].position.toArray()}));
 $('#motionStatus').textContent='ベッド・サーミスタ・3Zガイドが下降に追従'+(selected.some(id=>(catalog.accessories.find(a=>a.id===id).z_max_mm??250)<250)?' · ベッドファン装着時はZ 230 mmまで':'')+'。XYベルトは滑らかな経路表示。ベッドチェーンは20リンクが追従。歯・テンションの再現は未対応。';if(Math.abs(bedReferenceDrop)>.001)$('#motionStatus').append(Object.assign(document.createElement('span'),{textContent:` · ベッド基準位置の移動 ${(-bedReferenceDrop).toFixed(2)} mm`}));document.body.dataset.bedReferenceDropMm=bedReferenceDrop.toFixed(6);render();
}
async function install(variant){return workspaceTask(async()=>{program?.invalidate();headMarkers?.clear();const plan=headPlan(variant),required=variant.machine_gantry?[]:variant.machine_head?[gantryId]:[gantryId,plan.base,...plan.modules.map(m=>m.id)];await Promise.all(required.map(asset));await toolBank.install(variant);gantryVisibility.install(variant);
 for(const promise of cached.values()){const a=await promise;a.root.visible=false;a.root.position.set(0,0,0);for(const r of a.records)r.mesh.visible=true}
 if(!variant.machine_gantry){const gantry=await asset(gantryId);gantry.root.visible=true;}
 $('#badge').textContent=`VORON TRIDENT ${size} · ${variant.machine_gantry?'Monolith · ':''}XY ${variant.belt_width_mm} mm`;
 if(variant.machine_head){
  const refs=await fetch('../R2_ENDSTOP_REGISTRATION.json?v=trident-clearance-35').then(r=>r.json()),ref=refs.heads.stealthburner;motion.setReference(variant.machine_gantry?[...variant.machine_head.nozzle_mm.slice(0,2).map((n,i)=>n-variant.machine_gantry.bed_min_xy_mm[i]),0]:[ref.X.cad_reference_display_coordinate_mm+referenceOffset,ref.Y.cad_reference_display_coordinate_mm+referenceOffset,0]);motion.setBedReferenceDrop(variant.fit.bed_reference_drop_mm||0);active=variant;accessories?.refresh();paletteApply();applyPose();
  const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',variant.source_head_configuration);$('#toolheadLink').href=url.href;document.body.dataset.configuration=variant.id;document.body.dataset.ready='true';return;
 }
 const base=await asset(plan.base);base.root.visible=true;base.root.position.copy(point(plan.translation));for(const r of base.records)r.mesh.visible=!plan.hidden.has(r.key);
 for(const module of plan.modules){const a=await asset(module.id),hidden=new Set(module.hidden_keys||[]);a.root.visible=true;a.root.position.copy(point(module.translation_mm));for(const r of a.records)r.mesh.visible=!hidden.has(r.key)}
 const endstops=await fetch('../R2_ENDSTOP_REGISTRATION.json?v=trident-clearance-35').then(r=>r.json()),ref=endstops.heads[variant.toolhead==='xol'?(variant.hotend==='rapido2_uhf'?'xol':'xol_standard'):'stealthburner'];
 motion.setReference([ref.X.cad_reference_display_coordinate_mm+referenceOffset,ref.Y.cad_reference_display_coordinate_mm+referenceOffset,0]);motion.setBedReferenceDrop(variant.fit.bed_reference_drop_mm||0);active=variant;accessories?.refresh();applyPose();
 const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',variant.id);$('#toolheadLink').href=url;
 $('#badge').textContent=`VORON TRIDENT ${size} · XY 6 mm`;document.body.dataset.configuration=variant.id;
 document.body.dataset.ready='true';
});}
try{
 const getJSON=async path=>{return workspaceTask(async()=>{const r=await fetch('../'+path,{cache:'no-cache'});if(!r.ok)throw Error(path);return r.json()});};
 [profile,catalog]=await Promise.all([getJSON(`machines/${machine}/machine_profile.json`),getJSON(`machines/${machine}/configurations.json`)]);
 originalLimits=JSON.parse(JSON.stringify(profile.display_limits_mm));
 const headData=await loadMachineHeadCatalog(machine);catalog=await loadMonolithMachines(expandedPrinterCatalog(withFrameMods(catalog,frameMods),headData.heads,headData.registry,machine),headData);catalog.bank_data=headData.bank;installedHeads=createMachineHeads(scene,{...catalog,base_assets:headData.heads.base_assets},{render});ensureMachineHeadControls({gantry:true,monolithUnavailable:catalog.monolith_unavailable});motion=createTridentMotion(profile);const [base,g]=await Promise.all([getJSON(profile.base_assets.meta),loadModel(new GLTFLoader(),'../'+profile.base_assets.glb)]);scene.add(g.scene);register(g.scene,base);gantryVisibility=stockGantryVisibility(new Map(meshes.map(r=>[r.key,r.mesh])));
 headMarkers=createHeadMarkers(scene,{rig:installedHeads,fixture:key=>meshes.find(r=>r.key===key)?.mesh,render,setPose:xyz=>{program?.invalidate();if(xyz.some((n,i)=>n<Number($('#'+['x','y','z'][i]).min)-1e-7||n>Number($('#'+['x','y','z'][i]).max)+1e-7))return false;for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];$('#enclosure').checked=true;$('#enclosure').onchange?.({target:$('#enclosure')});applyPose();return true}});
 for(const [i,a] of ['x','y','z'].entries()){const limits=profile.display_limits_mm[a.toUpperCase()];$('#'+a).min=limits[0];$('#'+a).max=limits[1];$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose}
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose()};
 const key='3d-print-rig-vanilla-trident-palette-'+machine,valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 try{const saved=JSON.parse(localStorage.getItem(key)||(size===350?localStorage.getItem('3d-print-rig-vanilla-trident-palette'):null)||'null');for(const r of ['base','accent','frame'])if(valid(saved?.[r]))palette[r]=saved[r]}catch{}
 const update=()=>{paletteApply();for(const r of ['base','accent','frame']){$('#'+r).value=palette[r];$('#'+r+'Hex').value=palette[r];$('#'+r+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':palette.frame==='#25282d'?'black':'custom';try{localStorage.setItem(key,JSON.stringify(palette))}catch{}$('#paletteStatus').textContent='機種別の配色'};
 for(const r of ['base','accent','frame']){$('#'+r).disabled=false;$('#'+r+'Hex').disabled=false;$('#'+r).oninput=e=>{palette[r]=e.target.value;update()};$('#'+r+'Hex').oninput=e=>{if(valid(e.target.value)){palette[r]=e.target.value;update()}else e.target.setAttribute('aria-invalid','true')}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=e=>{palette.frame=e.target.value==='silver'?'#b9bec4':'#25282d';update()};
 const disco=await lighting.whenReady;disco?.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.led_role==='bracket')meshes.push({mesh,role:'base'})});
 $('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{Object.assign(palette,{base:'#24272c',accent:'#e32636',frame:'#25282d'});update()};update();
 $('#enclosure').onchange=e=>{for(const r of meshes)if(r.panel)r.mesh.visible=e.target.checked;render()};$('#belts').onchange=applyPose;
 accessories=setupAccessories(catalog,{load:asset,update:applyPose,stockNodes:new Map(meshes.map(r=>[r.key,r.mesh]))});toolBank=setupChangerBank({catalog,rig:installedHeads,data:headData.bank,extras:{...accessories,onSettled:applyPose}});await toolBank.bind(await setupConfigurations(catalog,install,{...toolBank.options,inspectPose:headMarkers.inspect}));
 if(!active)throw Error('構成のCADを表示できませんでした');
 const programFrame=()=>({nozzle_mm:active.fit.nozzle_mm,reference_xyz_mm:motion.getReference(),moving_bed_z:true});
 program=setupGcodePanel({container:document.querySelector('aside'),scene,render,getPose:()=>[current.x,current.y,current.z],getLimits:displayedMachineLimits,toNozzle:xyz=>programPoint(programFrame(),xyz),pathOffset:xyz=>programPathOffset(programFrame(),xyz),getContext:()=>({configuration:active.id,bank:installedHeads.bankState}),setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 $('#status').hidden=true;setupRenderExport({renderer,scene,camera,controls,afterRender:render,name:'VORON_Trident_'+size});resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}
for(const [id,p] of [['iso',[.98,.83,1.4]],['front',[0,.24,1.65]],['top',[0,1.8,0]]])$('#'+id).onclick=()=>{camera.up.set(0,id==='top'?0:1,id==='top'?-1:0);camera.position.set(...p);controls.target.set(0,.22,0);frameResponsiveView(camera,controls);render()};
$('#focusHead').onclick=async()=>{return workspaceTask(async()=>{if(!active||installedHeads?.focus(camera,controls))return;const a=await asset(active.toolhead),box=new THREE.Box3().setFromObject(a.root);box.getCenter(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(.15,.08,.3));controls.update();render()});};

}
