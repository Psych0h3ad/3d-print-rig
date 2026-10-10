import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=3b735c3e32640589ed26';
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask,workspaceListen} from './workspace-lifecycle.mjs?v=823ad76bd9034ec8d6ff';
import {createV0Installations,v0Slots,v0TophatMaxAngle} from './v0-installations.mjs?v=a686041ca15d51c1c316';
import {v0ConfigurationSchema,stockV0Mods,validateV0State,readV0ModsURL,v0ModsURL,createV0StateRestorer} from './v0-state.mjs?v=ac57444f3e83c636f074';
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {loadExternalComponent} from './component-assets.mjs?v=9f8ef058f1297ab60e53';
import {v0ModCategories,componentCategory} from './v0-mod-library.mjs?v=ddeeafeb04155ab0838b';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=6eb709afed84945151b8';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {createV0Adapter} from './v0_adapter.mjs?v=4ee2ec34955631397cf3';
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {setupGrid} from './grid-control.js?v=workspace-belts-1';
import {setupRenderExport} from './render-export.js?v=9c6b06804a9e64da0b2f';
import {setupPublicInfo} from './public-info.js?v=febd8f5505a0d08a35b2';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=a84362027155c83c4e26';
import {programPoint,programPathOffset} from './gcode-timeline.mjs?v=a07bc2dcf7216407fe8c';
export async function mount(scope){
const $=s=>document.querySelector(s),ids=['voron_v02r1_120','voron_v02_120'];
const wanted=new URLSearchParams(location.search).get('machine'),id=ids.includes(wanted)?wanted:ids[0];
const initialURL=location.href;
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const feedback=$('#configurationStatus'),feedbackFooter=$('#saveConfiguration').closest?.('.inspector-footer');
if(feedbackFooter){feedback.style.flex='1 0 100%';feedback.style.margin='0';feedbackFooter.append(feedback)}feedback.hidden=true;
function configurationFeedback(text){feedback.hidden=!text;feedback.textContent=text}
// Keep the source message in the DOM so language changes can translate it again.
function loadError(prefix,error){return prefix+' '+error.message}
const stage=$('#stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
let adapter,profile,program,programFrame,stockProfile,installations,stateRestorer,currentManifest,applyPalette,palette={base:null,accent:null,frame:null},pending=false;
function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);grid.position.y=-.026;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new WorkspaceResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.16,0);camera.position.set(...({iso:[.53,.45,.7],front:[0,.17,.9],top:[0,1,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3(),partBox=new THREE.Box3();function expand(node){if(!node.visible)return;if(node.isMesh&&node.geometry){node.geometry.computeBoundingBox();partBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);box.union(partBox)}for(const child of node.children)expand(child)}scene.updateMatrixWorld(true);for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)expand(node);for(const rows of installations?.roots.values()||[])for(const r of rows)if(r.spec.motion==='xy')expand(r.wrapper);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';
 installations?.setPose(adapter.getPose());program?.updatePath(adapter.getPose());
 $('#motionStatus').textContent=pose.within_sampled_clearance_envelope===null?'換装後のノズルとベッドを基準に配置中':pose.within_sampled_clearance_envelope?'X/YヘッドとZベッドを配置中':'格子点で確認した範囲の外です。公称端の接触を確認する姿勢です。';
 $('#flexibleStatus').textContent=!pose.belts_visible?'ベルト・配線を非表示':'ベルト経路はXYに追従 · Zチェーン11リンクはベッドに追従';
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.belts_visible);document.body.dataset.chainVisible=String(pose.chain_visible);render();}
try{
 const root='../machines/'+id+'/',json=async name=>{return workspaceTask(async()=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');return r.json()});};
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
 function updateModLink(){const mod=mods.find(m=>m.id===$('#modLibrary').value);modHistory.set($('#modCategory').value,mod.id);$('#modLink').href='./components.html?component='+encodeURIComponent(mod.id);$('#modSelection').textContent=mod.label;$('#modLink').textContent='選んだModの部品・種類を開く'}
 function updateModOptions(){const selected=modHistory.get($('#modCategory').value),items=mods.filter(m=>componentCategory(m)===$('#modCategory').value);$('#modLibrary').replaceChildren(...items.map(m=>option(m.id,m.label)));$('#modLibrary').value=selected||items[0].id;updateModLink()}
 $('#modCategory').onchange=updateModOptions;$('#modLibrary').onchange=updateModLink;$('#modCategory').disabled=false;$('#modLibrary').disabled=false;updateModOptions();

 installations=await createV0Installations({scene,adapter,profile,registry:registration.machines[id],loadModule:async module=>{return workspaceTask(async()=>{
  const source=registration.sources[module];if(!source)throw Error('Mod原本を読み込めません');
  if(source.external)return (await loadExternalComponent(new GLTFLoader(),source,import.meta.url)).gltf;
  const r=await fetch('../'+(source.metadata||'modules/'+module+'/module.json'),{cache:'no-cache'});if(!r.ok)throw Error('Mod原本を読み込めません');
  const bytes=await r.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==registration.sources[module].metadata_sha256)throw Error('Mod原本のバージョンが一致しません');
  return loadModel(new GLTFLoader(),'../'+(source.glb||'modules/'+module+'/module.glb'));
 });}});
 stateRestorer=createV0StateRestorer({profile,registry:installations.registry,installations,commit:commitV0State,
  busy:value=>{$('#saveConfiguration').disabled=value;if(value)$('#installationStatus').textContent='Modを読み込み中…'},
  error:e=>{refreshMods();$('#installationStatus').textContent=loadError('取付エラー:',e)},
 });
 for(const[slot,label]of v0Slots){
  const caption=document.createElement('label');caption.htmlFor='mod-'+slot;caption.textContent=label;
  const select=document.createElement('select');select.id='mod-'+slot;
  select.append(option('stock','純正'));if(slot==='accelerometer')select.append(option('none','取り外す'));
  for(const o of installations.registry.options.filter(o=>o.slot===slot&&o.id!=='stock'))select.append(option(o.id,o.label));
  if(select.options.length===1)select.disabled=true;
  select.onchange=async()=>{return workspaceTask(async()=>{const state=Object.fromEntries(v0Slots.map(([k])=>[k,$('#mod-'+k).value]));const chosen=installations.registry.options.find(o=>o.id===select.value);Object.assign(state,chosen?.requires||{});try{await setV0Mods(state)}catch{}});};
  $('#v0ModFields').append(caption,select);
 }
 $('#resetMods').onclick=()=>setV0Mods(stockV0Mods()).catch(()=>{});
 $('#saveConfiguration').onclick=()=>{const blob=new Blob([JSON.stringify(captureV0State(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id+'-configuration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('#loadConfiguration').onclick=()=>$('#configurationFile').click();
 $('#configurationFile').onchange=async()=>{return workspaceTask(async()=>{try{const file=$('#configurationFile').files[0];if(!file)return;if(file.size>1048576)throw Error('設定ファイルが大きすぎます');if(await restoreV0State(JSON.parse(await file.text())))configurationFeedback('構成を復元しました')}catch(e){configurationFeedback(loadError('読込エラー:',e))}finally{$('#configurationFile').value=''}});};
 refreshMods();
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);try{const saved=JSON.parse(localStorage.getItem(profile.appearance.storage_key)||'null');if(saved?.machine_id===id)for(const role of Object.keys(palette))if(valid(saved.colors?.[role]))palette[role]=saved.colors[role]}catch{}
 applyPalette=function(){for(const [m,c] of originals)m.color.copy(c);adapter.setPalette(palette);installations?.setPalette(palette);for(const role of Object.keys(palette)){const v=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=v;$('#'+role+'Hex').value=v;$('#'+role+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame==='#0e0f11'?'black':'custom';document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);$('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色':'標準CADの配色';render()};
 function save(){try{localStorage.setItem(profile.appearance.storage_key,JSON.stringify({machine_id:id,colors:palette}))}catch{}}
 for(const role of Object.keys(palette)){$('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();save()};$('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v;applyPalette();save()}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=()=>{if($('#frameFinish').value==='custom')return;palette.frame=$('#frameFinish').value==='silver'?'#b9bec4':'#0e0f11';applyPalette();save()};$('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();save()};applyPalette();
 programFrame={nozzle_mm:profile.nozzle_tip_mm,reference_xyz_mm:profile.display_reference_xyz_mm,moving_bed_z:true};
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,toNozzle:xyz=>programPoint(programFrame,xyz),pathOffset:xyz=>programPathOffset(programFrame,xyz),setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 try{const mods=readV0ModsURL(initialURL,{machine_id:id,registry:installations.registry});if(mods&&await setV0Mods(mods))configurationFeedback('共有リンクのMod構成を復元しました')}catch(e){configurationFeedback(loadError('共有リンクの読込エラー:',e))}
 setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}

function refreshMods(){if(!installations)return;const state=installations.getState();$('#tophatAngle').max=String(v0TophatMaxAngle(installations.registry,state));$('#tophatAngle').value=adapter.tophat.getAngle();$('#tophatAnglev').textContent=adapter.tophat.getAngle().toFixed(0)+'°';for(const[slot]of v0Slots)$('#mod-'+slot).value=state[slot];$('#installationStatus').replaceChildren(...installations.getNotes().map(note=>{const p=document.createElement('p');p.textContent=note;return p}));const selected=installations.registry.options.find(o=>o.id===state.toolhead&&o.slot==='toolhead');$('#headSummary').textContent=(selected?.label||'Mini Stealthburner / 統合BMG / Revo Voron')+' · 固定ガントリー・単一Zベッド';$('#installationStatus').classList.toggle('notice',state.handles==='stealth-handles');document.body.dataset.v0Mods=JSON.stringify(state)}
function updateDatum({preservePhysicalPose=true}={}){
 const old=profile.display_reference_xyz_mm,pose=adapter.getPose(),state=installations.getState(),head=installations.registry.options.find(o=>o.slot==='toolhead'&&o.id===state.toolhead),bed=installations.registry.options.find(o=>o.slot==='bed'&&o.id===state.bed);
 profile.nozzle_tip_mm=[...(head?.nozzle_tip_mm||stockProfile.nozzle_tip_mm)];profile.bed_top_world_z_mm=bed?.bed_top_mm??stockProfile.bed_top_world_z_mm;
 profile.sampled_clearance_limits_mm=head||bed?null:structuredClone(stockProfile.sampled_clearance_limits_mm);
 $('#clearanceStatus').textContent=head||bed?'換装構成の全ストロークは下記の取付確認を参照してください':`CAD格子点の確認範囲 X 0–${stockProfile.sampled_clearance_limits_mm.X[1]} / Y 0–${stockProfile.sampled_clearance_limits_mm.Y[1]} / Z 0–${stockProfile.sampled_clearance_limits_mm.Z[1]} mm`;
 const bedMin=bed?.bed_xy_min_mm||stockProfile.bed_surface_min_xy_mm;
 profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-bedMin[0],profile.nozzle_tip_mm[1]-bedMin[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm];
 programFrame.nozzle_mm=profile.nozzle_tip_mm;programFrame.reference_xyz_mm=profile.display_reference_xyz_mm;
 adapter.setChainEndpointShift(bed?.chain_endpoint_offset_mm||[0,0,0]);
 if(preservePhysicalPose)for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=Math.max(profile.display_limits_mm['XYZ'[i]][0],Math.min(profile.display_limits_mm['XYZ'[i]][1],pose[i]+profile.display_reference_xyz_mm[i]-old[i]));
}
function commitV0State(value){
 updateDatum({preservePhysicalPose:!value});refreshMods();
 if(value){
  palette={...value.palette};applyPalette();for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=value.pose[i];
  for(const key of ['enclosure','belts']){$('#'+key).checked=value[key];$('#'+key).onchange()}
  $('#gridVisible').checked=value.grid;$('#gridVisible').onchange();$('#doorAngle').value=value.door_angle_deg;$('#doorAngle').oninput();$('#tophatAngle').value=value.tophat_angle_deg;$('#tophatAngle').oninput();
 }
 applyPose();
 // Sharing and embed controls already preserve the page's query parameters.
 // Write only committed installation state and retain workspace history data.
 const url=v0ModsURL(location.href,{machine_id:id,registry:installations.registry},installations.getState());
 replaceWorkspaceURL(history.state,'',url);
}
async function setV0Mods(state){return workspaceTask(()=>stateRestorer.setMods(state));}
function currentV0(){return {adapter,profile,manifest:currentManifest,installations,scene,camera,orbit}}
function captureV0State(){return validateV0State({profile,registry:installations.registry},{schema:v0ConfigurationSchema,machine_id:id,mods:installations.getState(),pose:adapter.getPose(),palette:{...palette},enclosure:$('#enclosure').checked,belts:$('#belts').checked,grid:$('#gridVisible').checked,door_angle_deg:adapter.door.getAngle(),tophat_angle_deg:adapter.tophat.getAngle()})}
async function restoreV0State(value){return workspaceTask(()=>stateRestorer.restore(value));}
workspaceListen(window,'pagehide',event=>{if(event.persisted)return;installations?.dispose();orbit.dispose();renderer.dispose();adapter=null;installations=null});

setupSceneDisplay(scene,renderer,camera,scope,THREE);
instance = {setV0Mods,currentV0,captureV0State,restoreV0State};
scope.cleanup(()=>{instance=null});
}
let instance;
export const setV0Mods=(...args)=>instance?.setV0Mods(...args);
export const currentV0=(...args)=>instance?.currentV0(...args);
export const captureV0State=(...args)=>instance?.captureV0State(...args);
export const restoreV0State=(...args)=>instance?.restoreV0State(...args);
