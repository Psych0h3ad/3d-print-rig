import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=bundle-v2';
import {loadFrameMods,withFrameMods} from './frame-mods.js?v=frame-mods-v1';
import {setupGrid} from './grid-control.js?v=grid-v1';
import {setupLighting} from './lighting.js?v=frame-lighting-v1';
import {setupFlexible} from './flexible.js?v=public-v5';
import {setupConfigurations} from './configurations.js?v=clearance-v1';
import {setupAccessories} from './accessories.js?v=frame-mods-v1';
import {setupAppearance} from './appearance.js?v=public-v5';
import {setupRenderExport} from './render-export.js?v=public-v5';
import {setupPublicInfo} from './public-info.js?v=mounts-v5';
const $=s=>document.querySelector(s),scene=new THREE.Scene();
scene.background=new THREE.Color('#edf1f5');
const stage=$('#stage');
const viewWidth=()=>Math.max(1,stage.clientWidth),viewHeight=()=>Math.max(1,stage.clientHeight);
const sidebarWidth=()=>stage.getBoundingClientRect().left;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(viewWidth(),viewHeight());renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
stage.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(35,viewWidth()/viewHeight(),.002,100);
camera.position.set(1.05,.78,1.18);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.22,0);controls.enableDamping=true;
let renderRequested=true,lastMotionFrame=0,renderedFrames=0;
controls.addEventListener('change',()=>{renderRequested=true});
for(const event of ['click','input','change'])document.addEventListener(event,()=>{renderRequested=true},true);
setupGrid(scene,()=>{renderRequested=true});
const frameMods=await loadFrameMods('siboor_trident_350');
const lighting=setupLighting(scene,renderer,{registration:frameMods.disco,update:()=>{renderRequested=true}});
$('#focusDisco').onclick=()=>{unfocus();stop();for(const o of allMeshes){o.material.opacity=.035;o.material.transparent=true;o.material.depthWrite=false}camera.position.set(.10,.24,.38);controls.target.set(-.243,.472,0);controls.update()};
let model,pivot,mode=null,start=0,ready=false,registration,refX=0,refY=0,current={x:0,y:0,z:0},homeStart,focusAxis=null,flexible;
const levers={},plungers={};
const groups={},moving={y:[],xy:[],z:[],reference_flexible:[]},panes=[],parts=new Map();
const allMeshes=[];
let installed='stock',stockRegistration,stockRefX,stockLeverX,stockPlungerX,xolMeta,xolScene;
let activeConfig,catalog,r2Registration,appearance,stockRows,accessories;
const assetRoots=new Map(),assets=new Map(),xolMechanisms={},stockSwitchMeshes=[],r2Belts=[];
const stockHeadGroup='03_Stock_Stealthburner_CW2_Rapido2_UHF';
const cadPoint=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
function registerModule(root,metadata){
 const lookup=new Map(metadata.parts.map(p=>[p.key,p])),meshes=[];
 root.traverse(o=>{if(!o.isMesh)return;const key=o.userData.part_key||o.name,p=lookup.get(key);
 o.userData.originalKey=key;o.userData.partKey=o.userData.mechanism&&key.startsWith('Xol_X')?'480':key;
 o.material=o.material.clone();o.material.side=THREE.DoubleSide;o.userData.baseOpacity=o.material.opacity;o.userData.baseTransparent=o.material.transparent;
 allMeshes.push(o);meshes.push(o);parts.set(key,o);
 if(key.startsWith('Xol_X'))xolMechanisms[o.userData.mechanism]=o;
 if(!['Lever','Plunger','X_Lever','X_Plunger','Y_Lever','Y_Plunger'].includes(o.userData.mechanism)){
 const motion=p?.motion||o.userData.motion||'xy';if(moving[motion])moving[motion].push(o);
 }
 if(o.userData.flex_belt){const attr=o.geometry.attributes.position,original=attr.array.slice(),weights=[];
 for(let i=0;i<attr.count;i++){const x=original[i*3]*1000,y=-original[i*3+2]*1000;let wx=0,wy=0;
 if(y>-20&&y<5){wy=1;if(Math.abs(x)<216)wx=Math.max(0,Math.min(1,(216-Math.abs(x))/196))}
 else if(Math.abs(x)>215)wy=y>5?Math.max(0,1-(y-5)/233):Math.max(0,1-(-20-y)/208);
 weights.push(wx,wy)}r2Belts.push({mesh:o,attr,original,weights});}
 if(o.material.transparent){o.material.depthWrite=false;o.renderOrder=2}
 });appearance?.registerMeshes(meshes);return meshes;
}
async function asset(id){
 if(assets.has(id))return assets.get(id);
 const spec=id==='xol'?{meta:'XOL_MOD.json',glb:'Xol_SherpaMini_Rapido2UHF_AWD9.glb'}:catalog.assets[id];
 const promise=Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error(spec.meta);return r.json()}),loadGLB('../'+spec.glb)]).then(([meta,g])=>{model.add(g.scene);g.scene.visible=false;const meshes=registerModule(g.scene,meta);const result={meta,root:g.scene,meshes};assetRoots.set(id,result);if(id==='xol'){xolMeta=meta;xolScene=g.scene}return result}).catch(e=>{assets.delete(id);throw e});assets.set(id,promise);return promise;
}
function showHead(){
 if(!activeConfig)return;const shown=$('#head').checked,removed=new Set(activeConfig.removed_stock_keys);
 for(const o of allMeshes){if(!o.userData.stock)continue;const k=o.userData.originalKey||o.userData.partKey;
 o.visible=!removed.has(k)&&!(o.userData.stockGroup===stockHeadGroup&&!shown)&&o.name!=='P480__Switch_Housing'&&o.name!=='P408__Switch_Housing';
 if(k==='480')o.visible=o.visible&&installed==='stock'&&activeConfig.gantry==='siboor_awd'&&shown;
 }
 groups[stockHeadGroup].visible=installed==='stock'&&shown;
 if(xolScene)xolScene.visible=installed==='xol'&&shown;
 for(const p of panes)p.visible=$('#panels').checked;
 for(const m of activeConfig.modules){const a=assetRoots.get(m.id);if(a?.root.userData.headModule)a.root.visible=shown}
}
async function installConfiguration(v){
 const required=[...new Set(v.modules.map(m=>m.id)),...(v.toolhead==='xol'?['xol']:[])];await Promise.all(required.map(asset));
 const headLink=new URL('./toolheads.html',location.href);headLink.searchParams.set('configuration',v.id);$('#toolheadLink').href=headLink;
 stop();unfocus();activeConfig=v;installed=v.toolhead==='xol'?'xol':'stock';
 for(const a of assetRoots.values()){a.root.visible=false;a.root.position.set(0,0,0);for(const o of a.meshes)o.visible=true}
 groups[stockHeadGroup].position.copy(cadPoint(v.head_translation_mm));
 if(installed==='xol'){xolScene.visible=true;xolScene.position.copy(cadPoint(v.head_translation_mm));const hidden=new Set(v.hidden_xol_keys);xolScene.traverse(o=>{if(o.isMesh)o.visible=!hidden.has(o.userData.originalKey)})}
 for(const m of v.modules){const a=assetRoots.get(m.id),hidden=new Set(m.hidden_keys||[]);a.root.visible=true;a.root.position.copy(cadPoint(m.translation_mm));a.root.userData.headModule=m.id!=='trident_r2_gantry_350';for(const mesh of a.meshes)mesh.visible=!hidden.has(mesh.userData.originalKey)}
 registration=v.gantry==='trident_r2'?{switches:r2Registration.heads[v.toolhead==='xol'&&v.hotend!=='rapido2_uhf'?'xol_standard':v.toolhead]}:{...stockRegistration,switches:{...stockRegistration.switches,X:installed==='xol'?xolMeta.X_registration:stockRegistration.switches.X}};
 refX=registration.switches.X.cad_reference_display_coordinate_mm;refY=registration.switches.Y.cad_reference_display_coordinate_mm;
 for(const a of ['X','Y']){const r=registration.switches[a];levers[a]=allMeshes.find(o=>o.name===r.lever_mesh_name);plungers[a]=allMeshes.find(o=>o.name===r.plunger_mesh_name);if(!levers[a]||!plungers[a])throw Error('Missing '+a+' mechanism')}
 $('#headStatus').textContent=[catalog.toolheads.find(x=>x.id===v.toolhead).label,catalog.hotends.find(x=>x.id===v.hotend).label,catalog.extruders.find(x=>x.id===v.extruder).label].join(' · ');
 $('#headStatus').dataset.gantryGeometryRevision=v.gantry==='trident_r2'?assetRoots.get('trident_r2_gantry_350').meta.geometry_revision:'stock-original';
 $('#headNotes').textContent=v.notes.filter(x=>!x.startsWith('SIBOOR')&&!x.startsWith('ベルト')).join(' ');
 $('#badge').textContent=`${v.gantry==='trident_r2'?'TRIDENT R2':'SIBOOR CNC AWD'} · ${v.xy_motors} XY MOTORS · ${v.belt_width_mm} mm BELTS`;
 $('#machineSubtitle').textContent=`SIBOOR JUNE本体 · ${v.gantry==='trident_r2'?'VORON R2':'CNC AWD'} / ${v.belt_width_mm} mm`;
 accessories?.refresh();showHead();setPose(refX,refY,current.z);
}
const guideMeshes=[],guideRails=[];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function stop(){mode=null;$('#demo').textContent='動作デモ';$('#home').textContent='ホーミング（Y→X）'}
function leverPose(axis,value,dx,dy){
 const r=registration.switches[axis],curve=r.contact_curve,translation=value-r.cad_reference_display_coordinate_mm;
 let angle=0,plungerTravel=curve[0].plunger_travel_mm;
 for(let i=1;i<curve.length;i++)if(translation>=curve[i-1].translation_mm){const a=curve[i-1],b=curve[i],f=clamp((translation-a.translation_mm)/(b.translation_mm-a.translation_mm),0,1);angle=THREE.MathUtils.lerp(a.angle_deg,b.angle_deg,f);plungerTravel=THREE.MathUtils.lerp(a.plunger_travel_mm,b.plunger_travel_mm,f)}
 const o=levers[axis],h=new THREE.Vector3(r.hinge_point_mm[0],r.hinge_point_mm[2],-r.hinge_point_mm[1]).multiplyScalar(.001);
 const a=new THREE.Vector3(r.hinge_axis[0],r.hinge_axis[2],-r.hinge_axis[1]);
 o.quaternion.setFromAxisAngle(a,THREE.MathUtils.degToRad(angle));o.position.copy(h).sub(h.clone().applyQuaternion(o.quaternion));
 const motion=r.switch_motion||(axis==='X'?'xy':'fixed');if(motion==='xy')o.position.x+=dx/1000;if(motion==='xy'||motion==='y')o.position.z-=dy/1000;
 const button=plungers[axis];button.position.set(r.plunger_axis[0]*plungerTravel/1000,r.plunger_axis[2]*plungerTravel/1000,-r.plunger_axis[1]*plungerTravel/1000);
 if(motion==='xy')button.position.x+=dx/1000;if(motion==='xy'||motion==='y')button.position.z-=dy/1000;
 const pressed=Math.max(0,translation-curve[0].translation_mm);
 o.userData.depressionDeg=-angle;o.userData.depressionMm=pressed;
 $('#status').dataset[axis.toLowerCase()+'PlungerMm']=plungerTravel.toFixed(6);
 return pressed>.0001?`押下 ${pressed.toFixed(2)} mm`:translation>=curve[0].translation_mm-1e-5?'接触':'未接触';
}
function setPose(x,y,z){
 renderRequested=true;
 const bedReferenceDrop=activeConfig?.fit?.bed_reference_drop_mm||0,zMax=230-bedReferenceDrop;
 x=clamp(x,0,350);y=clamp(y,0,360);z=clamp(z,0,zMax);current={x,y,z};$('#z').max=zMax;
 const dx=x-refX,dy=y-refY;
 const bedDown=z+bedReferenceDrop;
 for(const o of moving.y)o.position.z=-dy/1000;
 for(const o of moving.xy){o.position.x=dx/1000;o.position.z=-dy/1000}
 for(const o of moving.z)o.position.y=-bedDown/1000;
 const drift=Math.max(0,...guideMeshes.map(o=>Math.abs(o.position.y+bedDown/1000)))*1000,railShift=Math.max(0,...guideRails.map(o=>Math.abs(o.position.y)))*1000;
 $('#zGuideStatus').textContent=`Zガイドブロック3箇所 · ${drift<.001&&railShift<.001?'ベッドに追従':'追従を確認してください'}`;
 $('#zGuideStatus').dataset.maxDriftMm=drift.toFixed(6);$('#zGuideStatus').dataset.railShiftMm=railShift.toFixed(6);
 const rest=Math.abs(dx)+Math.abs(dy)+Math.abs(bedDown)<.001;
 for(const o of moving.reference_flexible)o.visible=rest&&$('#cables').checked;
 for(const[a,v]of [['x',x],['y',y],['z',z]]){$('#'+a).value=v;$('#'+a+'v').textContent=v.toFixed(1)+' mm'}
 const hitX=x>registration.switches.X.first_contact_display_coordinate_mm,hitY=y>registration.switches.Y.first_contact_display_coordinate_mm;
 $('#status').textContent=`X ${leverPose('X',x,dx,dy)} ／ Y ${leverPose('Y',y,dx,dy)}`;
 $('#status').dataset.xAngle=levers.X.userData.depressionDeg.toFixed(4);$('#status').dataset.yAngle=levers.Y.userData.depressionDeg.toFixed(4);
 $('#status').style.background=hitX||hitY?'#e0f1e9':'#eff5f7';
 const r2=activeConfig?.gantry==='trident_r2';
 let variant=null;
 if(installed==='xol'||r2){const inlet=installed==='xol'?(activeConfig.extruder==='orbiter2'?[-.09999426211,-24.11,427.2598619]:xolMeta.filament_inlet_mm):[-.05,-28.76,414];const off=activeConfig.head_translation_mm;variant={id:activeConfig.id,includeStockBelts:!r2,filament_inlet_mm:inlet.map((n,i)=>n+off[i]),can_inlet_mm:[-.1,18,438].map((n,i)=>n+off[i])}}
 const routing=flexible.update(dx,dy,bedDown,$('#cables').checked,variant);
 if(r2){for(const key of ['580','Upper_Belt'])parts.get(key).visible=false;for(const {mesh,attr,original,weights} of r2Belts){mesh.visible=$('#cables').checked;for(let i=0;i<attr.count;i++){attr.array[3*i]=original[3*i]+dx*weights[2*i]/1000;attr.array[3*i+2]=original[3*i+2]-dy*weights[2*i+1]/1000}attr.needsUpdate=true;mesh.geometry.computeBoundingSphere()}}
 $('#routing').textContent=!$('#cables').checked?'ベルト・配線：非表示':variant?`${activeConfig.belt_width_mm} mmベルト・PTFE経路プレビュー ／ ヘッド用チェーン未取付`:rest?'CAD基準姿勢 · 元の配線形状':routing.chainRouteValid?'経路プレビュー · ベルト・PTFE・47リンク追従':'経路プレビュー · ベルト・PTFE追従 ／ チェーンは経路範囲外';
 $('#routing').dataset.chain=String(routing.chain);$('#routing').dataset.belts=String(routing.belts);$('#routing').dataset.ptfe=String(routing.ptfe);
 $('#routing').dataset.chainLinks=String(routing.chainLinks||0);$('#routing').dataset.chainCulledLinks=String(routing.chainCulledLinks||0);
 const hd=$('#headStatus');hd.dataset.installed=installed;hd.dataset.stockVisible=String(groups[stockHeadGroup].visible);hd.dataset.xolVisible=String(!!xolScene?.visible);
 hd.dataset.xMm=x;hd.dataset.yMm=y;hd.dataset.referenceXMm=refX;hd.dataset.referenceYMm=refY;
 if(activeConfig){hd.dataset.variant=activeConfig.id;hd.dataset.gantry=activeConfig.gantry;hd.dataset.beltWidthMm=activeConfig.belt_width_mm;hd.dataset.xyMotors=activeConfig.xy_motors;
 const visible=o=>o.visible&&(!o.parent||visible(o.parent));hd.dataset.visibleR2Parts=allMeshes.filter(o=>o.name.startsWith('trident_r2_gantry_350_')&&visible(o)).length;
 hd.dataset.visibleAwdParts=allMeshes.filter(o=>o.userData.stockGroup==='02_CNC_AWD_Gantry'&&visible(o)).length;
 hd.dataset.visibleXolParts=allMeshes.filter(o=>o.userData.originalKey?.startsWith('xol_')&&visible(o)).length;
 hd.dataset.loadedAssets=assets.size;
 hd.dataset.visibleModules=JSON.stringify(Object.fromEntries([...assetRoots].map(([id,a])=>[id,a.meshes.filter(visible).length])));
 hd.dataset.clip6Visible=allMeshes.filter(o=>o.name.startsWith('xol_clips_6mm_')&&visible(o)).length;
 hd.dataset.clip9Visible=allMeshes.filter(o=>['xol_22','xol_62'].includes(o.userData.originalKey)&&visible(o)).length;
 hd.dataset.visibleHeadSwitchParts=allMeshes.filter(o=>o.userData.originalKey?.startsWith('Xol_X_Switch_')&&visible(o)).length;
 const moduleId=activeConfig.modules.find(m=>m.id===(installed==='stock'?'sb':'xol')+'_'+activeConfig.hotend)?.id;
 const mount=parts.get(moduleId+'_mount')||parts.get('xol_Rapido2UHF_Mount');if(mount){hd.dataset.mountOffsetMm=(mount.position.x*1000).toFixed(6);hd.dataset.mountColor='#'+mount.material.color.getHexString()}
 }
 if(activeConfig)for(const m of activeConfig.modules){const a=assetRoots.get(m.id);if(a?.root.userData.headModule)a.root.visible=$('#head').checked}

}
const callout=document.createElement('div');callout.style.cssText='display:none;position:absolute;z-index:1;padding:8px 12px;border:1px solid #dc9a37;background:#fff8e8ee;border-radius:7px;color:#825318;pointer-events:none;font-size:12px';document.body.appendChild(callout);
const marker=new THREE.Mesh(new THREE.SphereGeometry(.00065,16,12),new THREE.MeshBasicMaterial({color:0xf4a934,depthTest:false,transparent:true,opacity:.8}));marker.visible=false;marker.renderOrder=10;scene.add(marker);
function focusSwitch(axis){
 stop();unfocus();setPose(axis==='X'?350:refX,360,current.z);focusAxis=axis;
 const highlighted=new Set([registration.switches[axis].switch_key,...registration.switches[axis].actuator_keys,...(activeConfig.gantry==='trident_r2'&&installed==='xol'?['xol_probe_module','xol_standard_probe_bracket']:[])]);
 for(const o of allMeshes){if(o.userData.partKey===registration.switches[axis].switch_key||o===levers[axis]||o===plungers[axis])continue;o.material.opacity=Math.min(o.userData.baseOpacity,highlighted.has(o.userData.partKey)?.4:.022);o.material.transparent=true;o.material.depthWrite=false;o.renderOrder=1}
 const cp=registration.switches[axis].contact_point_mm.slice();if(axis==='X'||registration.switches[axis].switch_motion==='y')cp[1]+=360-refY;
 const target=new THREE.Vector3(cp[0]/1000,cp[2]/1000,-cp[1]/1000);marker.position.copy(target);marker.visible=true;
 controls.target.copy(target);
 camera.position.copy(target).add(axis==='X'?new THREE.Vector3(.115,-.06,.13):new THREE.Vector3(.10,-.045,.12));
 controls.update();callout.textContent=axis+'スイッチ · レバー'+(registration.switches[axis].homing_angle_deg||6)+'°押下（周辺を透過）';callout.style.display='block';
}
async function loadGLB(url){
 let last;for(let attempt=0;attempt<3;attempt++){try{return await loadModel(new GLTFLoader(),url+(attempt?(url.includes('?')?'&':'?')+'retry='+attempt:''))}catch(e){last=e}}
 throw last;
}
setupPublicInfo();
Promise.all([fetch('../assembly_manifest.json',{cache:'no-cache'}).then(r=>r.json()),fetch('../flexible_routes.json',{cache:'no-cache'}).then(r=>r.json()),loadModel(new GLTFLoader(),'../SIBOOR_Trident_350.glb',p=>{$('#loading').textContent=p.total?'読み込み '+Math.round(p.loaded/p.total*100)+'%':'3Dモデルを読み込み中…'}),loadGLB('../Endstop_Mechanisms.glb'),fetch('../COLOR_OPTIONS.json',{cache:'no-cache'}).then(r=>r.json()),fetch('../ASSEMBLY_CONFIGURATIONS.json',{cache:'no-cache'}).then(r=>r.json()),fetch('../R2_ENDSTOP_REGISTRATION.json',{cache:'no-cache'}).then(r=>r.json())]).then(async([manifest,routes,g,endstops,colorOptions,configs,r2Meta])=>{
 registration=manifest.motion_preview.endstop_registration;catalog=withFrameMods(configs,frameMods);r2Registration=r2Meta;stockRows=manifest.parts;
 refX=registration.switches.X.cad_reference_display_coordinate_mm;refY=registration.switches.Y.cad_reference_display_coordinate_mm;
 const lookup=new Map(manifest.parts.map(r=>[r.key,r]));model=g.scene;model.add(endstops.scene);scene.add(model);
 model.traverse(o=>{
 if(o.name.startsWith('0')||o.name.startsWith('1'))groups[o.name]=o;
 if(!o.isMesh)return;const key=o.userData.part_key||o.name.slice(1).split('__')[0],r=lookup.get(key);parts.set(key,o);
 for(const a of ['X','Y']){if(o.name===registration.switches[a].lever_mesh_name)levers[a]=o;if(o.name===registration.switches[a].plunger_mesh_name)plungers[a]=o}
 if(o.name==='P480__Switch_Housing'||o.name==='P408__Switch_Housing')o.visible=false;
 o.material=o.material.clone();o.userData.partKey=key;o.userData.originalKey=key;o.userData.stock=true;o.userData.stockGroup=r?.group;o.userData.baseOpacity=o.material.opacity;o.userData.baseTransparent=o.material.transparent;allMeshes.push(o);
 if(r&&moving[r.motion])moving[r.motion].push(o);
 if(r&&manifest.motion_preview.Z_guide_registration.guide_keys.includes(key))guideMeshes.push(o);
 if(r&&manifest.motion_preview.Z_guide_registration.rail_keys.includes(key))guideRails.push(o);
 if(manifest.appearance.transparent_panels.includes(key))panes.push(o);
 o.material.side=THREE.DoubleSide;if(o.material.transparent){o.material.depthWrite=false;o.renderOrder=2}
 });
 stockRegistration=registration;stockRefX=refX;stockLeverX=levers.X;stockPlungerX=plungers.X;
 flexible=setupFlexible(scene,allMeshes,manifest,routes);appearance=setupAppearance(allMeshes,await lighting.whenReady,colorOptions);
 const door=groups['09_ClickyClacky_Door'];if(door){pivot=new THREE.Group();pivot.position.set(-.26205,0,.2565);scene.add(pivot);pivot.attach(door)}
 for(const s of ['#door','#x','#y','#z','#demo','#reset','#home','#focusX','#focusY','#releaseSwitch','#focusZ'])$(s).disabled=false;
 accessories=setupAccessories(catalog,{load:asset,update:()=>setPose(current.x,current.y,current.z)});
 ready=true;$('#loading').remove();await setupConfigurations(catalog,installConfiguration,accessories);
 setupRenderExport({renderer,scene,camera,beforeRender:stop,afterRender:()=>{renderRequested=true},name:'Trident_350'});
}).catch(e=>{if($('#loading'))$('#loading').textContent='モデルを読み込めませんでした。'+e.message;console.error(e)});
$('#door').oninput=e=>{$('#angle').textContent=e.target.value+'°';if(pivot)pivot.rotation.y=-THREE.MathUtils.degToRad(+e.target.value)};
function unfocus(){focusAxis=null;marker.visible=false;callout.style.display='none';for(const o of allMeshes){o.material.opacity=o.userData.baseOpacity;o.material.transparent=o.userData.baseTransparent;o.material.depthWrite=!o.userData.baseTransparent;o.renderOrder=o.userData.baseTransparent?2:0}}
for(const a of ['x','y','z'])$('#'+a).oninput=()=>{stop();unfocus();setPose(+$('#x').value,+$('#y').value,+$('#z').value)};
$('#reset').onclick=()=>{stop();unfocus();setPose(refX,refY,0);$('#door').value=0;$('#angle').textContent='0°';if(pivot)pivot.rotation.y=0};
$('#demo').onclick=()=>{if(mode==='demo'){stop();return}stop();unfocus();mode='demo';start=performance.now();$('#demo').textContent='デモを停止'};
$('#home').onclick=()=>{if(mode==='home'){stop();return}stop();unfocus();homeStart={...current};mode='home';start=performance.now();$('#home').textContent='終端へ移動中…'};
$('#focusX').onclick=()=>focusSwitch('X');$('#focusY').onclick=()=>focusSwitch('Y');
$('#focusHead').onclick=()=>{if(!ready)return;stop();unfocus();const dx=(current.x-refX)/1000,dy=-(current.y-refY)/1000;controls.target.set(dx,.367,dy+.025);camera.position.copy(controls.target).add(new THREE.Vector3(.16,.10,.29));controls.update()};
$('#focusZ').onclick=()=>{
 stop();unfocus();setPose(refX,refY,150);focusAxis='Z';
 for(const o of allMeshes){
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
  const box=o.geometry.boundingBox,near=box.min.x<-.19&&box.min.z>.15;
  const guide=near&&(guideMeshes.includes(o)||guideRails.includes(o));
  const mount=near&&moving.z.includes(o);
  o.material.opacity=Math.min(o.userData.baseOpacity,guide?.95:mount?.55:.018);
  o.material.transparent=true;o.material.depthWrite=false;
 }
 const target=new THREE.Vector3(-.24486,.14377,.229);
 marker.position.copy(target);controls.target.copy(target);
 camera.position.copy(target).add(new THREE.Vector3(.11,.05,.13));controls.update();
 callout.textContent='Zガイド · ベッド150 mm下降（周辺を透過）';callout.style.display='block';
};
$('#releaseSwitch').onclick=()=>{stop();if(focusAxis==='Z')focusSwitch('X');const a=focusAxis==='Y'?'Y':'X',r=registration.switches[a];setPose(a==='X'?r.first_contact_display_coordinate_mm-1:refX,a==='Y'?r.first_contact_display_coordinate_mm-1:360,current.z);marker.visible=false;callout.textContent=a+'スイッチ · 押下直前（1 mm手前）';};
$('#panels').onchange=e=>{for(const p of panes)p.visible=e.target.checked};
$('#head').onchange=()=>{showHead();setPose(current.x,current.y,current.z)};
$('#cables').onchange=()=>setPose(current.x,current.y,current.z);
for(const[id,p]of [['iso',[1.05,.78,1.18]],['front',[0,.24,1.65]],['top',[.001,1.8,.001]]])$('#'+id).onclick=()=>{unfocus();camera.position.set(...p);controls.target.set(0,.22,0);controls.update()};
$('#nightOn').addEventListener('click',()=>{unfocus();camera.position.set(0,.24,1.65);controls.target.set(0,.22,0);controls.update()});
new ResizeObserver(()=>{renderRequested=true;camera.aspect=viewWidth()/viewHeight();camera.updateProjectionMatrix();renderer.setSize(viewWidth(),viewHeight())}).observe(stage);
renderer.setAnimationLoop(t=>{
 if(mode&&t-lastMotionFrame<1000/24)return;if(mode)lastMotionFrame=t;
 if(ready&&mode==='demo'){const phase=((t-start)/18000)%1;setPose(refX+110*Math.sin(phase*Math.PI*2),refY+95*Math.sin(phase*Math.PI*4),50*(1-Math.cos(phase*Math.PI*2)))}
 if(ready&&mode==='home'){
  const seconds=(t-start)/1000;
  const approach=(from,to,sec)=>{const near=Math.max(from,to-3);return sec<3?THREE.MathUtils.lerp(from,near,sec/3):THREE.MathUtils.lerp(near,to,clamp(sec-3,0,1))};
  if(seconds<4)setPose(homeStart.x,approach(homeStart.y,360,seconds),homeStart.z);
  else if(seconds<8)setPose(approach(homeStart.x,350,seconds-4),360,homeStart.z);
  else{setPose(350,360,homeStart.z);stop()}
 }
 controls.update();
 if(focusAxis){const p=marker.position.clone().project(camera);callout.style.left=(sidebarWidth()+(p.x+1)*viewWidth()/2+12)+'px';callout.style.top=(stage.getBoundingClientRect().top+(1-p.y)*viewHeight()/2-30)+'px'}
 if(renderRequested){renderer.render(scene,camera);renderRequested=false;$('#badge').dataset.renderedFrames=++renderedFrames}
});
