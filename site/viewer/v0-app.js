import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=8f347468def25922153c';
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask,workspaceListen} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import {v0NativeModelHash,v0NativeDependencyHash,v0NativeByteHash,guardV0NativeInstallations,guardV0NativeAdapter,v0NativeDisplayLimits,v0NativeRangeText,v0NativeStateProfile,assertV0NativePlayback} from './v0-native-installed-gate.mjs?v=2801ee4ab692384c0d13';
import {createV0Installations,v0Slots,v0TophatMaxAngle} from './v0-installations.mjs?v=52be32c4d360655dbf4f';
import {v0ConfigurationSchema,stockV0Mods,validateV0State,readV0ModsURL,v0ModsURL,createV0StateRestorer} from './v0-state.mjs?v=5c6698815b7212715492';
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {loadExternalComponent} from './component-assets.mjs?v=a912f0a87d5f3993e9ad';
import {v0ModCategories,componentCategory} from './v0-mod-library.mjs?v=abb4fafb1e86da0d3633';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=977c4d1e134e7fe27a0e';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=319442cce47f582793a9';
import {createV0Adapter} from './v0_adapter.mjs?v=649d5ff906cefaa9659f';
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {setupGrid} from './grid-control.js?v=workspace-belts-1';
import {setupRenderExport} from './render-export.js?v=92d6e71ee392361a4f7d';
import {setupPublicInfo} from './public-info.js?v=c3ec6db110aef990ae31';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=66041e969f9190a81416';
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
let assemblyView=null,assemblySnapshot=null,assemblyLocked=false,assemblyControlStates=new Map(),assemblyData=null;
function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);grid.position.y=-.026;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new WorkspaceResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.16,0);camera.position.set(...({iso:[.53,.45,.7],front:[0,.17,.9],top:[0,1,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3(),partBox=new THREE.Box3();function expand(node){if(!node.visible)return;if(node.isMesh&&node.geometry){node.geometry.computeBoundingBox();partBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);box.union(partBox)}for(const child of node.children)expand(child)}scene.updateMatrixWorld(true);for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)expand(node);for(const rows of installations?.roots.values()||[])for(const r of rows)if(r.spec.motion==='xy')expand(r.wrapper);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter||assemblyView)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';
 installations?.setPose(adapter.getPose());program?.updatePath(adapter.getPose());
 $('#motionStatus').textContent=pose.within_sampled_clearance_envelope===null?'換装後のノズルとベッドを基準に配置中':pose.within_sampled_clearance_envelope?'X/YヘッドとZベッドを配置中':'格子点で確認した範囲の外です。公称端の接触を確認する姿勢です。';
 $('#flexibleStatus').textContent=!pose.belts_visible?'ベルト・配線を非表示':'ベルト経路はXYに追従 · Zチェーン11リンクはベッドに追従';
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.belts_visible);document.body.dataset.chainVisible=String(pose.chain_visible);render();}
try{
 const nativeAssetReceipts={};
 const root='../machines/'+id+'/',json=async name=>{return workspaceTask(async()=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');const bytes=await r.arrayBuffer();nativeAssetReceipts[name]=await v0NativeByteHash(bytes);return JSON.parse(new TextDecoder().decode(bytes))});};
 const [manifest,p,g,library,registration]=await Promise.all([json('assembly_manifest.json'),json('machine_profile.json'),loadModel(new GLTFLoader(),root+'model.glb',undefined,{verifySha256:v0NativeModelHash(id)}),fetch('../COMPONENT_LIBRARY.json?v=trident-clearance-35',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Modカタログ');return r.json()}),fetch('../V0_INSTALLATIONS.json?v=65d0fcf808da644b5824',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('V0 Mod取付データ');return r.json()})]);
 nativeAssetReceipts['model.glb']=v0NativeModelHash(id);
 profile=p;stockProfile=structuredClone(p);profile.stock_display_limits_mm=structuredClone(stockProfile.display_limits_mm);currentManifest=manifest;scene.add(g.scene);adapter=createV0Adapter(g.scene,manifest,profile);const originals=new Map(),protectedMaterials=[];
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
  if(source.external){const loaded=await loadExternalComponent(new GLTFLoader(),source,import.meta.url);loaded.gltf.scene.userData.ledSourceAsset={id:loaded.meta.id,decoded_model_sha256:source.files['model.glb'].decoded_sha256||source.files['model.glb'].sha256};const rows=new Map(loaded.meta.parts.map(p=>[p.key,p]));loaded.gltf.scene.traverse(n=>{if(!n.isMesh)return;let owner=n;while(owner&&!rows.has(owner.userData?.part_key))owner=owner.parent;if(owner)n.userData.ledSourceRow=rows.get(owner.userData.part_key)});return loaded.gltf;}
  const r=await fetch('../'+(source.metadata||'modules/'+module+'/module.json'),{cache:'no-cache'});if(!r.ok)throw Error('Mod原本を読み込めません');
  const bytes=await r.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==registration.sources[module].metadata_sha256)throw Error('Mod原本のバージョンが一致しません');
  const hash=v0NativeDependencyHash(module);const loaded=await loadModel(new GLTFLoader(),'../'+(source.glb||'modules/'+module+'/module.glb'),undefined,{verifySha256:hash});if(hash)nativeAssetReceipts['module:'+module]=hash;return loaded;
 });}});
 guardV0NativeInstallations(installations,{registry:{...installations.registry,sources:registration.sources},manifest,stockProfile,receipts:nativeAssetReceipts});guardV0NativeAdapter(adapter,installations);
 stateRestorer=createV0StateRestorer({profile:stockProfile,registry:installations.registry,installations,commit:commitV0State,
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
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,beforePlayback:()=>{if(assemblyView)throw Error('組み立て手順を閉じてから動作を確認してください');return assertV0NativePlayback(installations)},getContext:()=>installations?.getNativeInstallationGate?.(),toNozzle:xyz=>programPoint(programFrame,xyz),pathOffset:xyz=>programPathOffset(programFrame,xyz),setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 try{const mods=readV0ModsURL(initialURL,{machine_id:id,registry:installations.registry});if(mods&&await setV0Mods(mods))configurationFeedback('共有リンクのMod構成を復元しました')}catch(e){configurationFeedback(loadError('共有リンクの読込エラー:',e))}
 setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
 setupAssemblyControls(nativeAssetReceipts);
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}

function refreshMods(){if(!installations)return;const state=installations.getState();$('#tophatAngle').max=String(v0TophatMaxAngle(installations.registry,state));$('#tophatAngle').value=adapter.tophat.getAngle();$('#tophatAnglev').textContent=adapter.tophat.getAngle().toFixed(0)+'°';for(const[slot]of v0Slots)$('#mod-'+slot).value=state[slot];$('#installationStatus').replaceChildren(...installations.getNotes().map(note=>{const p=document.createElement('p');p.textContent=note;return p}));const selected=installations.registry.options.find(o=>o.id===state.toolhead&&o.slot==='toolhead');$('#headSummary').textContent=(selected?.label||'Mini Stealthburner / 統合BMG / Revo Voron')+' · 固定ガントリー・単一Zベッド';$('#installationStatus').classList.toggle('notice',state.handles==='stealth-handles');document.body.dataset.v0Mods=JSON.stringify(state)}
function updateDatum({preservePhysicalPose=true}={}){
 const old=profile.display_reference_xyz_mm,pose=adapter.getPose(),state=installations.getState(),head=installations.registry.options.find(o=>o.slot==='toolhead'&&o.id===state.toolhead),bed=installations.registry.options.find(o=>o.slot==='bed'&&o.id===state.bed);
 profile.display_limits_mm=v0NativeDisplayLimits(state,stockProfile.display_limits_mm);
 for(const[i,a]of ['x','y','z'].entries()){const limits=profile.display_limits_mm['XYZ'[i]];$('#'+a).min=String(limits[0]);$('#'+a).max=String(limits[1])}
 profile.nozzle_tip_mm=[...(head?.nozzle_tip_mm||stockProfile.nozzle_tip_mm)];profile.bed_top_world_z_mm=bed?.bed_top_mm??stockProfile.bed_top_world_z_mm;
 profile.sampled_clearance_limits_mm=head||bed?null:structuredClone(stockProfile.sampled_clearance_limits_mm);
 $('#clearanceStatus').textContent=head||bed?'換装構成の全ストロークは下記の取付確認を参照してください':`CAD格子点の確認範囲 X 0–${stockProfile.sampled_clearance_limits_mm.X[1]} / Y 0–${stockProfile.sampled_clearance_limits_mm.Y[1]} / Z 0–${stockProfile.sampled_clearance_limits_mm.Z[1]} mm`;
 const nativeGate=installations.getNativeInstallationGate?.();
 if(nativeGate)$('#clearanceStatus').textContent=`Dragon Burner display range: ${v0NativeRangeText(nativeGate.display_limits_mm)} mm · sampled poses only`;
 const regionNotes=$('#x').closest('details').querySelectorAll('p.foot:not([id])'),restricted=Boolean(nativeGate);for(const[i,note]of [...regionNotes].entries()){note.dataset.stockMotionText??=note.textContent;note.textContent=restricted?(i===0?`Display range: ${v0NativeRangeText(nativeGate.display_limits_mm,', ')} mm. Increasing Z lowers the bed.`:'Selected native poses were checked. Complete tube/wire routing, continuous clearance and firmware calibration remain unverified.'):note.dataset.stockMotionText;}
 const bedMin=bed?.bed_xy_min_mm||stockProfile.bed_surface_min_xy_mm;
 profile.display_reference_xyz_mm=[profile.nozzle_tip_mm[0]-bedMin[0],profile.nozzle_tip_mm[1]-bedMin[1],profile.nozzle_tip_mm[2]-profile.bed_top_world_z_mm];
 programFrame.nozzle_mm=profile.nozzle_tip_mm;programFrame.reference_xyz_mm=profile.display_reference_xyz_mm;
 adapter.setChainEndpointShift(bed?.chain_endpoint_offset_mm||[0,0,0]);
 if(preservePhysicalPose)for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=Math.max(profile.display_limits_mm['XYZ'[i]][0],Math.min(profile.display_limits_mm['XYZ'[i]][1],pose[i]+profile.display_reference_xyz_mm[i]-old[i]));
}
function commitV0State(value){
 program?.invalidate();updateDatum({preservePhysicalPose:!value});refreshMods();
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
async function setV0Mods(state){if(assemblyView)throw Error('組み立て手順を閉じてから構成を変更してください');return workspaceTask(()=>stateRestorer.setMods(state));}
function setupAssemblyControls(receipts){
 const start=$('#assemblyStart');if(!start)return;
 start.disabled=false;
 const step=$('#assemblyStage'),status=$('#assemblyStatus');
 const fail=e=>{status.textContent=loadError('手順の読込エラー:',e)};
 function lockControls(){
  for(const n of document.querySelectorAll('aside input,aside select,aside button')){
   if(n.closest('#assemblyControls')||n.id==='viewerLanguage'||n.getAttribute('role')==='tab'||n.closest('.mobile-layout'))continue;
   if(!assemblyControlStates.has(n))assemblyControlStates.set(n,n.disabled);n.disabled=true;
  }
  start.disabled=true;
 }
 function unlockControls(){for(const[n,disabled]of assemblyControlStates)n.disabled=disabled;assemblyControlStates.clear();start.disabled=false}
 function focusAdded(){
  if(!assemblyView)return;
  const box=new THREE.Box3(),partBox=new THREE.Box3();scene.updateMatrixWorld(true);
  for(const key of assemblyView.getBoundsKeys()){
   const native=adapter.nodes.get(key),display=[...installations.roots.values()].flat().filter(r=>r.wrapper.visible&&r.option.replace_keys.includes(key)).map(r=>r.wrapper);
   for(const node of [...(native?.visible?[native]:[]),...display])node.traverse(n=>{
    for(let p=n;p&&p!==node.parent;p=p.parent)if(!p.visible)return;
    if(n.isMesh&&n.geometry){n.geometry.computeBoundingBox();partBox.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);box.union(partBox)}
   });
  }
  if(box.isEmpty())return;
  const extent=box.getSize(new THREE.Vector3()).length(),distance=Math.max(.05,extent/(2*Math.tan(camera.fov*Math.PI/360))*1.3);
  box.getCenter(orbit.target);camera.up.set(0,1,0);camera.position.copy(orbit.target).add(new THREE.Vector3(.65,.4,1).normalize().multiplyScalar(distance));frameResponsiveView(camera,orbit);render();
 }
 function present(index){
  const state=assemblyView.setStage(index);step.value=String(index);
  $('#assemblyPrevious').disabled=index===0;$('#assemblyNext').disabled=index===state.total-1;
  const stage=assemblyData.machines[id].stages[index];
  $('#assemblyStepNote').textContent=stage.note||'';
  $('#assemblyPartCount').textContent=`工程 ${index+1} / ${state.total} · 追加 ${state.added} 部品 · 表示 ${state.visible_count} 部品`;
  const manual=assemblyData.machines[id].manual;
  $('#assemblyManual').href=manual.url+'#page='+stage.page_start;
  $('#assemblyManual').textContent=`公式マニュアル ${stage.page_start}–${stage.page_end} ページ`;
  status.textContent='元CADの位置で組立状態を表示中';document.body.dataset.assemblyStage=stage.id;render();
 }
 async function finish(){
  if(assemblyLocked||!assemblyView)return;assemblyLocked=true;
  const saved=assemblySnapshot;
  try{assemblyView.leave();assemblyView=null;$('#assemblySteps').hidden=true;delete document.body.dataset.assemblyStage;
   if(!await restoreV0State(saved.configuration))throw Error('元の構成を復元できません');
   camera.position.copy(saved.camera);camera.up.copy(saved.up);orbit.target.copy(saved.target);orbit.update();render();status.textContent='元の構成を復元しました';
  }catch(e){fail(e)}finally{if(!assemblyView){unlockControls();assemblySnapshot=null}assemblyLocked=false}
 }
 start.onclick=()=>workspaceTask(async()=>{
  if(assemblyLocked||assemblyView)return;assemblyLocked=true;
  assemblySnapshot={configuration:captureV0State(),camera:camera.position.clone(),up:camera.up.clone(),target:orbit.target.clone()};lockControls();
  try{
   if(!assemblyData){const response=await fetch('../V0_ASSEMBLY_STAGES.json?v=cac666a318dc56cdae84',{cache:'no-cache'});if(!response.ok)throw Error('手順データを読み込めません');assemblyData=await response.json()}
   const {createV0AssemblyStages}=await import('./v0-assembly.mjs?v=ac576b8eed02781734ab');
   program?.invalidate();
   if(!await setV0Mods(stockV0Mods()))throw Error('標準構成を読み込めません');
   $('#enclosure').checked=true;$('#enclosure').onchange();$('#belts').checked=true;$('#belts').onchange();
   $('#doorAngle').value='0';$('#doorAngle').oninput();$('#tophatAngle').value='0';$('#tophatAngle').oninput();$('#reset').onclick();
   const companions=[...installations.roots.values()].flat().filter(r=>r.wrapper.visible).map(r=>({node:r.wrapper,part_keys:r.option.replace_keys}));
   assemblyView=createV0AssemblyStages({nodes:adapter.nodes,manifest:currentManifest,machine:assemblyData.machines[id],receipts,companions});
   step.replaceChildren(...assemblyData.machines[id].stages.map((stage,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=stage.title;return option}));
   lockControls();$('#assemblySteps').hidden=false;present(0);focusAdded();
  }catch(e){
   try{assemblyView?.leave();assemblyView=null;
    if(assemblySnapshot){if(!await restoreV0State(assemblySnapshot.configuration))throw Error('元の構成を復元できません');
     camera.position.copy(assemblySnapshot.camera);camera.up.copy(assemblySnapshot.up);orbit.target.copy(assemblySnapshot.target);orbit.update();render()}
   }catch(rollbackError){e=new Error(e.message+' / '+rollbackError.message)}
   assemblySnapshot=null;$('#assemblySteps').hidden=true;delete document.body.dataset.assemblyStage;fail(e);
  }finally{if(!assemblyView)unlockControls();assemblyLocked=false;start.disabled=Boolean(assemblyView)}
 });
 step.onchange=()=>{if(assemblyView)present(Number(step.value))};
 $('#assemblyPrevious').onclick=()=>{if(assemblyView)present(Math.max(0,Number(step.value)-1))};
 $('#assemblyNext').onclick=()=>{if(assemblyView)present(Math.min(assemblyData.machines[id].stages.length-1,Number(step.value)+1))};
 $('#assemblyFocus').onclick=focusAdded;$('#assemblyFinish').onclick=()=>workspaceTask(finish);
 scope.cleanup(()=>{try{assemblyView?.leave()}finally{assemblyView=null;assemblySnapshot=null;assemblyLocked=false;unlockControls();$('#assemblySteps').hidden=true;delete document.body.dataset.assemblyStage}});
}
function currentV0(){return {adapter,profile,manifest:currentManifest,installations,scene,camera,orbit}}
function captureV0State(){return validateV0State({profile,registry:installations.registry},{schema:v0ConfigurationSchema,machine_id:id,mods:installations.getState(),pose:adapter.getPose(),palette:{...palette},enclosure:$('#enclosure').checked,belts:$('#belts').checked,grid:$('#gridVisible').checked,door_angle_deg:adapter.door.getAngle(),tophat_angle_deg:adapter.tophat.getAngle()})}
async function restoreV0State(value){if(assemblyView)throw Error('組み立て手順を閉じてから構成を変更してください');return workspaceTask(()=>{const checked=validateV0State({profile:v0NativeStateProfile(stockProfile,value?.mods),registry:installations.registry},value);return stateRestorer.restore(checked)});}
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
