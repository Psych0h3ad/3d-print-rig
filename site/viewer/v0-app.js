import {createV0Installations,v0Slots,validateV0Mods,v0TophatMaxAngle} from './v0-installations.mjs?v=v0-mounts-39';
import {v0ModCategories,componentCategory} from './v0-mod-library.mjs?v=goliath-44';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=trident-clearance-35';
import {appearanceRole} from './appearance-role.mjs?v=trident-clearance-35';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=touch-37';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=trident-clearance-35';
import {poseDelta,createV0Adapter} from './v0_adapter.mjs?v=v0-mounts-39';
import {setupMachineNavigation} from './machines.js?v=e3ng-48';
import {setupGrid} from './grid-control.js?v=trident-clearance-35';
import {setupRenderExport} from './render-export.js?v=trident-clearance-35';
import {setupPublicInfo} from './public-info.js?v=standard-step-42';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=trident-clearance-35';
import {programPoint,programPathOffset} from './gcode-timeline.mjs?v=trident-clearance-35';
const $=s=>document.querySelector(s),ids=['voron_v02r1_120','voron_v02_120'];
const wanted=new URLSearchParams(location.search).get('machine'),id=ids.includes(wanted)?wanted:ids[0];
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=new OrbitControls(camera,renderer.domElement);scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
let adapter,profile,program,programFrame,stockProfile,installations,currentManifest,applyPalette,palette={base:null,accent:null,frame:null},pending=false,modRequest=0;
function render(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);grid.position.y=-.026;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new ResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.16,0);camera.position.set(...({iso:[.53,.45,.7],front:[0,.17,.9],top:[0,1,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3(),partBox=new THREE.Box3();function expand(node){if(!node.visible)return;if(node.isMesh&&node.geometry){node.geometry.computeBoundingBox();partBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);box.union(partBox)}for(const child of node.children)expand(child)}scene.updateMatrixWorld(true);for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)expand(node);for(const rows of installations?.roots.values()||[])for(const r of rows)if(r.spec.motion==='xy')expand(r.wrapper);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';
 installations?.setPose(adapter.getPose());program?.updatePath(adapter.getPose());
 $('#motionStatus').textContent=pose.within_sampled_clearance_envelope===null?'換装後のノズルとベッドを基準に配置中':pose.within_sampled_clearance_envelope?'X/YヘッドとZベッドを配置中':'格子点で確認した範囲の外です。公称端の接触を確認する姿勢です。';
 $('#flexibleStatus').textContent=!pose.belts_visible?'ベルト・配線を非表示':'ベルト経路はXYに追従 · Zチェーン11リンクはベッドに追従';
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.belts_visible);document.body.dataset.chainVisible=String(pose.chain_visible);render();}
try{
 const root='../machines/'+id+'/',json=async name=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');return r.json()};
 const [manifest,p,g,library,registration]=await Promise.all([json('assembly_manifest.json'),json('machine_profile.json'),loadModel(new GLTFLoader(),root+'model.glb'),fetch('../COMPONENT_LIBRARY.json?v=trident-clearance-35',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Modカタログ');return r.json()}),fetch('../V0_INSTALLATIONS.json?v=v0-mounts-39',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('V0 Mod取付データ');return r.json()})]);
 profile=p;stockProfile=structuredClone(p);currentManifest=manifest;scene.add(g.scene);adapter=createV0Adapter(g.scene,manifest,profile);const originals=new Map(),protectedMaterials=[];
 for(const [key,node] of adapter.nodes)node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(material,material.color.clone());if(!appearanceRole(adapter.records.get(key)))protectedMaterials.push(material);if(material.transparent)material.depthWrite=false}});
 $('#machineTitle').textContent=id==='voron_v02r1_120'?'V0.2r1 / 120':'V0.2 / 120';$('#badge').textContent=$('#machineTitle').textContent+' · '+manifest.parts.length.toLocaleString()+' PARTS';
 const limits=profile.sampled_clearance_limits_mm;$('#clearanceStatus').textContent=`CAD格子点の確認範囲 X 0–${limits.X[1]} / Y 0–${limits.Y[1]} / Z 0–${limits.Z[1]} mm`;
 for(const [i,a] of ['x','y','z'].entries()){$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose}
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a] of ['x','y','z'].entries()){const limits=profile.display_limits_mm['XYZ'[i]];$('#'+a).value=Math.max(limits[0],Math.min(limits[1],profile.display_reference_xyz_mm[i]))}applyPose()};$('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};$('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);installations?.setEnclosureVisible($('#enclosure').checked);render()};
 $('#doorAngle').disabled=false;$('#doorAngle').oninput=()=>{adapter.setDoorAngle(Number($('#doorAngle').value));$('#doorAnglev').textContent=Number($('#doorAngle').value).toFixed(0)+'°';render()};$('#doorAngle').oninput();
 $('#tophatAngle').disabled=false;$('#tophatAngle').oninput=()=>{installations?.setTophatAngle(Number($('#tophatAngle').value));$('#tophatAnglev').textContent=Number($('#tophatAngle').value).toFixed(0)+'°';render()};
 const mods=library.items.filter(m=>m.kind==='mod'&&m.id.startsWith('v0mod_')),modHistory=new Map();
 const option=(id,label)=>{const o=document.createElement('option');o.value=id;o.textContent=label;return o};
 for(const category of v0ModCategories.filter(c=>mods.some(m=>componentCategory(m)===c.id)))$('#modCategory').append(option(category.id,category.label));
 function updateModLink(){const mod=mods.find(m=>m.id===$('#modLibrary').value);modHistory.set($('#modCategory').value,mod.id);$('#modLink').href='./components.html?component='+encodeURIComponent(mod.id);$('#modSelection').textContent=mod.label;$('#modLink').textContent='選んだModの部品・種類を開く ↗'}
 function updateModOptions(){const selected=modHistory.get($('#modCategory').value),items=mods.filter(m=>componentCategory(m)===$('#modCategory').value);$('#modLibrary').replaceChildren(...items.map(m=>option(m.id,m.label)));$('#modLibrary').value=selected||items[0].id;updateModLink()}
 $('#modCategory').onchange=updateModOptions;$('#modLibrary').onchange=updateModLink;$('#modCategory').disabled=false;$('#modLibrary').disabled=false;updateModOptions();

 installations=await createV0Installations({scene,adapter,profile,registry:registration.machines[id],loadModule:async module=>{
  const source=registration.sources[module];if(!source)throw Error('Mod原本を読み込めません');const r=await fetch('../'+(source.metadata||'modules/'+module+'/module.json'),{cache:'no-cache'});if(!r.ok)throw Error('Mod原本を読み込めません');
  const bytes=await r.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==registration.sources[module].metadata_sha256)throw Error('Mod原本のバージョンが一致しません');
  return loadModel(new GLTFLoader(),'../'+(source.glb||'modules/'+module+'/module.glb'));
 }});
 for(const[slot,label]of v0Slots){
  const caption=document.createElement('label');caption.htmlFor='mod-'+slot;caption.textContent=label;
  const select=document.createElement('select');select.id='mod-'+slot;
  select.append(option('stock','純正'));if(slot==='accelerometer')select.append(option('none','取り外す'));
  for(const o of installations.registry.options.filter(o=>o.slot===slot&&o.id!=='stock'))select.append(option(o.id,o.label));
  if(select.options.length===1)select.disabled=true;
  select.onchange=async()=>{const state=Object.fromEntries(v0Slots.map(([k])=>[k,$('#mod-'+k).value]));const chosen=installations.registry.options.find(o=>o.id===select.value);Object.assign(state,chosen?.requires||{});try{await setV0Mods(state)}catch{}};
  $('#v0ModFields').append(caption,select);
 }
 $('#resetMods').onclick=()=>setV0Mods(Object.fromEntries(v0Slots.map(([slot])=>[slot,'stock'])));
 $('#saveConfiguration').onclick=()=>{const blob=new Blob([JSON.stringify(captureV0State(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id+'-configuration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('#loadConfiguration').onclick=()=>$('#configurationFile').click();
 $('#configurationFile').onchange=async()=>{try{const file=$('#configurationFile').files[0];if(!file)return;if(file.size>1048576)throw Error('設定ファイルが大きすぎます');await restoreV0State(JSON.parse(await file.text()));$('#configurationStatus').textContent='構成を復元しました'}catch(e){$('#configurationStatus').textContent='読込エラー: '+e.message}finally{$('#configurationFile').value=''}};
 refreshMods();
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);try{const saved=JSON.parse(localStorage.getItem(profile.appearance.storage_key)||'null');if(saved?.machine_id===id)for(const role of Object.keys(palette))if(valid(saved.colors?.[role]))palette[role]=saved.colors[role]}catch{}
 applyPalette=function(){for(const [m,c] of originals)m.color.copy(c);adapter.setPalette(palette);installations?.setPalette(palette);for(const role of Object.keys(palette)){const v=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=v;$('#'+role+'Hex').value=v;$('#'+role+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame==='#0e0f11'?'black':'custom';document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);$('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色':'標準CADの配色';render()};
 function save(){try{localStorage.setItem(profile.appearance.storage_key,JSON.stringify({machine_id:id,colors:palette}))}catch{}}
 for(const role of Object.keys(palette)){$('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();save()};$('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v;applyPalette();save()}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=()=>{if($('#frameFinish').value==='custom')return;palette.frame=$('#frameFinish').value==='silver'?'#b9bec4':'#0e0f11';applyPalette();save()};$('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();save()};applyPalette();
 programFrame={nozzle_mm:profile.nozzle_tip_mm,reference_xyz_mm:profile.display_reference_xyz_mm,moving_bed_z:true};
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,toNozzle:xyz=>programPoint(programFrame,xyz),pathOffset:xyz=>programPathOffset(programFrame,xyz),setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}

function refreshMods(){if(!installations)return;const state=installations.getState();$('#tophatAngle').max=String(v0TophatMaxAngle(installations.registry,state));$('#tophatAngle').value=adapter.tophat.getAngle();$('#tophatAnglev').textContent=adapter.tophat.getAngle().toFixed(0)+'°';for(const[slot]of v0Slots)$('#mod-'+slot).value=state[slot];$('#installationStatus').replaceChildren(...installations.getNotes().map(note=>{const p=document.createElement('p');p.textContent=note;return p}));const selected=installations.registry.options.find(o=>o.id===state.toolhead&&o.slot==='toolhead');$('#headSummary').textContent=(selected?.label||'Mini Stealthburner / 統合BMG / Revo Voron')+' · 固定ガントリー・単一Zベッド';$('#installationStatus').classList.toggle('notice',state.handles==='stealth-handles');document.body.dataset.v0Mods=JSON.stringify(state)}
function updateDatum({preservePhysicalPose=true}={}){
 const old=profile.display_reference_xyz_mm,pose=adapter.getPose(),state=installations.getState(),head=installations.registry.options.find(o=>o.id===state.toolhead),bed=installations.registry.options.find(o=>o.id===state.bed);
 profile.nozzle_tip_mm=[...(head?.nozzle_tip_mm||stockProfile.nozzle_tip_mm)];profile.bed_top_world_z_mm=bed?.bed_top_mm??stockProfile.bed_top_world_z_mm;
 profile.sampled_clearance_limits_mm=head||bed?null:structuredClone(stockProfile.sampled_clearance_limits_mm);
 $('#clearanceStatus').textContent=head||bed?'換装構成の全ストロークは下記の取付確認を参照してください':`CAD格子点の確認範囲 X 0–${stockProfile.sampled_clearance_limits_mm.X[1]} / Y 0–${stockProfile.sampled_clearance_limits_mm.Y[1]} / Z 0–${stockProfile.sampled_clearance_limits_mm.Z[1]} mm`;
 const bedMin=bed?.bed_xy_min_mm||stockProfile.bed_surface_min_xy_mm;
 profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-bedMin[0],profile.nozzle_tip_mm[1]-bedMin[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm];
 programFrame.nozzle_mm=profile.nozzle_tip_mm;programFrame.reference_xyz_mm=profile.display_reference_xyz_mm;
 adapter.setChainEndpointShift(bed?.chain_endpoint_offset_mm||[0,0,0]);
 if(preservePhysicalPose)for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=Math.max(profile.display_limits_mm['XYZ'[i]][0],Math.min(profile.display_limits_mm['XYZ'[i]][1],pose[i]+profile.display_reference_xyz_mm[i]-old[i]));
}
export async function setV0Mods(state){const request=++modRequest;$('#saveConfiguration').disabled=true;try{$('#installationStatus').textContent='Modを読み込み中…';const applied=await installations.setState(state);if(applied){updateDatum();refreshMods();applyPose()}return applied}catch(e){if(request===modRequest){refreshMods();$('#installationStatus').textContent='取付エラー: '+e.message}throw e}finally{if(request===modRequest)$('#saveConfiguration').disabled=false}}
export function currentV0(){return {adapter,profile,manifest:currentManifest,installations,scene,camera,orbit}}
export function captureV0State(){return {schema:'v0-configuration-v1',machine_id:id,mods:installations.getState(),pose:adapter.getPose(),palette:{...palette},enclosure:$('#enclosure').checked,belts:$('#belts').checked,grid:$('#gridVisible').checked,door_angle_deg:adapter.door.getAngle(),tophat_angle_deg:adapter.tophat.getAngle()}}
export async function restoreV0State(value){
 if(value?.schema!=='v0-configuration-v1'||value.machine_id!==id)throw Error('この機種の設定ファイルではありません');
 validateV0Mods(installations.registry,value.mods);if(!Array.isArray(value.pose)||value.pose.length!==3)throw Error('XYZ設定が不正です');poseDelta(profile,Object.fromEntries(['x','y','z'].map((a,i)=>[a,value.pose[i]])));
 if(!value.palette||['base','accent','frame'].some(k=>value.palette[k]!==null&&!/^#[0-9a-f]{6}$/i.test(value.palette[k])))throw Error('色設定が不正です');
 if(['enclosure','belts','grid'].some(k=>typeof value[k]!=='boolean'))throw Error('表示設定が不正です');
 const doorAngle=value.door_angle_deg??0;if(typeof doorAngle!=='number'||!Number.isFinite(doorAngle)||doorAngle<0||doorAngle>110)throw Error('ドア角度が不正です');
 const tophatAngle=value.tophat_angle_deg??0;if(typeof tophatAngle!=='number'||!Number.isFinite(tophatAngle)||tophatAngle<0||tophatAngle>v0TophatMaxAngle(installations.registry,value.mods))throw Error('トップハット角度が不正です');
 if(!await installations.setState(value.mods))return false;
 updateDatum({preservePhysicalPose:false});
 palette={...value.palette};applyPalette();for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=value.pose[i];
 for(const key of ['enclosure','belts']){$('#'+key).checked=value[key];$('#'+key).onchange()}
 $('#gridVisible').checked=value.grid;$('#gridVisible').onchange();$('#doorAngle').value=doorAngle;$('#doorAngle').oninput();$('#tophatAngle').value=tophatAngle;$('#tophatAngle').oninput();refreshMods();applyPose();return true;
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;installations?.dispose();orbit.dispose();renderer.dispose();adapter=null;installations=null});
