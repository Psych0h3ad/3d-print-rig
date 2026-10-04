import {sceneLightingState} from './scene-lighting-state.mjs?v=extra-machines-55';
import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {rememberDisplayControl} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=463f121958ea463c3a61';
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask,workspaceListen} from './workspace-lifecycle.mjs';
import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js?v=workspace-belts-1';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadRatRigMachine,disposeRatRig} from './ratrig-loader.mjs?v=workspace-belts-2';
import {createRatRigGcodePreview} from './ratrig_gcode_preview.mjs';
import {ratRigSchema,validateRatRigConfiguration,ratRigAxisRanges} from './ratrig-ui-state.mjs?v=workspace-belts-1';
import {setupMachineNavigation} from './machines.js?v=b4593761cfecac3b686b';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
export async function mount(scope){
const $=id=>document.getElementById(id),stage=$('stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.01,30),controls=scope.resource(new OrbitControls(camera,renderer.domElement));controls.enableDamping=true;
camera.position.set(1.5,1.2,1.5);controls.target.set(0,.4,0);
const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(new RoomEnvironment(),.03);scene.environment=environment.texture;
const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(ambient,sun);
const grid=new THREE.GridHelper(4,40,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
let current,index,busy=false,disposed=false,pending,initialSnapshot,frameRequest=null;
const mutable=['x0','x1','y','z','carriageMode','copyOffset','mirrorSum','applyMode','resetPose','base','accent','frame','resetPalette','chamber','vaoc','night','gridVisible','enclosure','flexible','saveConfiguration','loadConfiguration','runGcode','resetGcode'];
const request=()=>{if(disposed||frameRequest!==null)return;frameRequest=workspaceFrame(()=>{frameRequest=null;controls.update();renderer.render(scene,camera)})};
controls.addEventListener('change',request);
function resize(){const rect=stage.getBoundingClientRect(),width=Math.max(rect.width,1),height=Math.max(rect.height,1);renderer.setSize(width,height);setResponsiveAspect(camera,controls,width,height);request()}
const observer=new WorkspaceResizeObserver(resize);observer.observe(stage);
function setBusy(value){busy=value;for(const id of mutable)$(id).disabled=value||!current;if(!value&&current)sync()}
function lighting(){const room=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(room.background);scene.environment=environment.texture;scene.environmentIntensity=room.environmentIntensity;renderer.toneMappingExposure=room.exposure;ambient.intensity=room.ambientIntensity;sun.intensity=1.4;document.body.dataset.roomDark='false';request()}
function sync(){
 if(!current)return;const s=current.adapter.getSnapshot(),p=current.profile,ranges=ratRigAxisRanges(p,s);
 for(const a of ['x0','x1','y','z'])if(ranges[a]){$(a).min=ranges[a][0];$(a).max=ranges[a][1];$(a).value=s.pose[a];$(a+'v').textContent=s.pose[a].toFixed(2)+' mm';$(a).disabled=busy||a==='x1'&&s.mode!=='independent'}
 $('secondaryCarriage').hidden=p.mode!=='idex';$('idexModes').hidden=p.mode!=='idex';$('carriageMode').value=s.mode;$('copyOffset').value=s.copy_offset_mm;$('mirrorSum').value=s.mirror_sum_mm;
 for(const c of ['chamber','vaoc'])$(c).value=s.lights[c];$('vaocControl').hidden=!p.lights.vaoc.keys.length;
 for(const c of ['base','accent','frame'])$(c).value=s.appearance.palette[c];$('flexible').checked=s.appearance.flexible_visible;$('enclosure').checked=s.appearance.enclosure_visible;
 $('motionStatus').textContent='座標・配線プレビュー更新済み';$('motionStatus').classList.remove('notice');$('motionStatus').dataset.machine=p.machine_id;
 $('badge').textContent='V-Core '+(p.series==='v-core-4-1'?'4.1':'4.0')+' / '+p.size_mm+' · '+current.row.assembled_parts.toLocaleString()+' PARTS';request();
 const code=current.gcode.snapshot();$('gcodeState').textContent='EXTRUDER '+code.tool+' / CARRIAGE '+code.carriage+' · '+(code.absolute?'G90':'G91');
}
function action(fn,status='motionStatus'){if(busy||!current)return false;try{fn();sync();$(status).classList.remove('notice');return true}catch(e){sync();$(status).textContent=e.message;$(status).classList.add('notice');return false}}
function view(kind='iso'){
 if(!current)return;const box=new THREE.Box3().setFromObject(current.root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),d=size.length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.08;
 if(kind==='head'){
  const headBox=new THREE.Box3();for(const [key,n]of current.adapter.nodes)if(current.adapter.records.get(key).motion==='tool0')headBox.expandByObject(n);if(!headBox.isEmpty())headBox.getCenter(center);
 }
 const offset=kind==='head'?new THREE.Vector3(.18,.12,.26):new THREE.Vector3(...(kind==='top'?[0,1,0]:kind==='front'?[0,0,1]:[.7,.45,.85])).normalize().multiplyScalar(d);
 controls.target.copy(center);camera.up.set(0,1,0);camera.position.copy(center).add(offset);if(kind==='top')camera.up.set(0,0,-1);camera.lookAt(center);frameResponsiveView(camera,controls);request();
}
function provenance(){
 const {profile:p,row}=current,version=p.series==='v-core-4-1'?'4.1':'4.0';$('machineTitle').textContent='V-Core '+version+' / '+p.size_mm;$('structureLabel').textContent=p.mode.toUpperCase()+' · '+row.tool_count+' HEADS · 標準構成';
 $('sourceKind').textContent=p.cad_source_kind==='explicit_derived'?'公式300 Hybridと公式IDEXモジュールから再構成した派生モデルです。':'公式Rat Rig CADを基準とし、記録した修正を含むモデルです。';
 const parent=$('ratRigSources');parent.replaceChildren();
 for(const [name,url]of [['Rat Rig V-Core '+version+' · CAD',row.source.official_files_url||'https://wiki.ratrig.com/en/products/'+p.series+'/files'],['CADの元リビジョン',row.source.share_url],['RatOS · 9a820c035a4f112a5c78087ab343b5523be62831','https://github.com/Rat-OS/RatOS-configurator/tree/9a820c035a4f112a5c78087ab343b5523be62831'],['CC BY-NC-SA 4.0','https://creativecommons.org/licenses/by-nc-sa/4.0/']])if(url){const a=document.createElement('a');a.textContent=name;a.href=url;a.target='_blank';a.rel='noopener';parent.append(a,document.createElement('br'))}
 const revision=document.createElement('p');revision.className='foot';revision.style.overflowWrap='anywhere';revision.textContent=row.source.version_urn||row.source.source_version||row.source.source_kind||row.source.status;parent.append(revision);
 $('nativeChanges').textContent='元STEP・原形BREP・完成組立・部品別修正記録を保持しています。印刷面はベッド上1.5 mmのシートを仮定しています。';
 $('nativeDownload').replaceChildren();if(row.native_archive){const a=document.createElement('a');a.textContent='標準組立のSTEP・BREP';a.href=row.native_archive.url;a.target='_blank';a.rel='noopener';$('nativeDownload').append(a)}
}
const currentRatRig=()=>current;
const captureRatRigConfiguration=()=>({schema:ratRigSchema,machine:current.profile.machine_id,rig:current.adapter.getSnapshot(),view:{night:$('night').checked,grid:$('gridVisible').checked,camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}});
function restoreRatRigConfiguration(data){
 validateRatRigConfiguration(current.profile,data);current.adapter.restore(data.rig);$('night').checked=data.view.night;$('gridVisible').checked=data.view.grid;grid.visible=data.view.grid;camera.position.fromArray(data.view.camera.position);camera.up.fromArray(data.view.camera.up);controls.target.fromArray(data.view.camera.target);camera.lookAt(controls.target);controls.update();lighting();current.gcode=createRatRigGcodePreview(current.adapter,current.profile);sync();rememberDisplayControl();return captureRatRigConfiguration();
}
async function loadMachine(id){return workspaceTask(async()=>{
 if(busy)throw Error('CADを読み込み中です。');const previous=current,previousInitial=initialSnapshot,previousView=current?captureRatRigConfiguration().view:null;setBusy(true);$('status').hidden=false;pending=new AbortController();let next;
 try{
  next=await loadRatRigMachine(index,id,{signal:pending.signal,onProgress:t=>$('status').textContent=t});if(disposed){disposeRatRig(next.root,next.adapter);return}
  scene.add(next.root);if(previous)previous.root.visible=false;current=next;initialSnapshot=current.adapter.getSnapshot();
  grid.position.y=new THREE.Box3().setFromObject(current.root).min.y-.003;provenance();sync();view();$('status').hidden=true;document.body.dataset.assetStatus='ready';document.body.dataset.machineId=id;
  const url=new URL(location.href);url.searchParams.set('machine',id);replaceWorkspaceURL(null,'',url);disposeRatRig(previous?.root,previous?.adapter);return current.adapter.getSummary();
 }catch(e){if(disposed)return;if(next&&current===next){disposeRatRig(next.root,next.adapter);current=previous;initialSnapshot=previousInitial;if(previous){previous.root.visible=true;provenance();grid.position.y=new THREE.Box3().setFromObject(previous.root).min.y-.003;camera.position.fromArray(previousView.camera.position);camera.up.fromArray(previousView.camera.up);controls.target.fromArray(previousView.camera.target);camera.lookAt(controls.target);document.body.dataset.machineId=previous.profile.machine_id;sync()}}$('status').textContent=current?'切替に失敗しました。直前の機体を表示中。':'CADを読み込めませんでした。ページを再読み込みしてください。';document.body.dataset.assetStatus=current?'ready':'error';$('motionStatus').textContent=e.message;$('motionStatus').classList.add('notice');throw e}
 finally{pending=null;if(!disposed)setBusy(false)}
});}
for(const axis of ['x0','x1','y','z'])$(axis).oninput=()=>action(()=>current.adapter.setPose({[axis]:Number($(axis).value)}));
$('applyMode').onclick=()=>action(()=>{current.adapter.setMode($('carriageMode').value,{pose:{},copy_offset_mm:Number($('copyOffset').value),mirror_sum_mm:Number($('mirrorSum').value)});current.gcode=createRatRigGcodePreview(current.adapter,current.profile)});
$('resetPose').onclick=()=>action(()=>{const appearance=current.adapter.getSnapshot().appearance,lights=current.adapter.getSnapshot().lights;current.adapter.restore({...initialSnapshot,appearance,lights});current.gcode=createRatRigGcodePreview(current.adapter,current.profile)});
for(const c of ['base','accent','frame'])$(c).oninput=()=>action(()=>current.adapter.setPalette({[c]:$(c).value}));$('resetPalette').onclick=()=>action(()=>current.adapter.setPalette(current.profile.appearance.palette_defaults));
for(const c of ['chamber','vaoc'])$(c).oninput=()=>action(()=>current.adapter.setLight(c,Number($(c).value)));
$('enclosure').onchange=()=>action(()=>current.adapter.setEnclosureVisible($('enclosure').checked));$('flexible').onchange=()=>action(()=>current.adapter.setFlexibleVisible($('flexible').checked));$('night').onchange=lighting;$('gridVisible').onchange=()=>{grid.visible=$('gridVisible').checked;request()};
for(const [id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
$('saveConfiguration').onclick=()=>{if(!current||busy)return;const url=URL.createObjectURL(new Blob([JSON.stringify(captureRatRigConfiguration(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=current.profile.machine_id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent='構成JSONを保存しました。'};
$('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=async()=>{return workspaceTask(async()=>{const file=$('configurationFile').files?.[0];$('configurationFile').value='';if(!file||busy||!current)return;try{if(file.size>64*1024)throw Error('構成JSONは64 KB以下で指定してください。');restoreRatRigConfiguration(JSON.parse(await file.text()));$('configurationStatus').textContent='構成JSONを復元しました。';$('configurationStatus').classList.remove('notice')}catch(e){$('configurationStatus').textContent=e.message;$('configurationStatus').classList.add('notice')}});};
$('runGcode').onclick=async()=>{return workspaceTask(async()=>{
 if(!current||busy)return;const lines=$('gcodeText').value.split(/\r?\n/);if(lines.length>2000||$('gcodeText').value.length>256*1024){$('gcodeStatus').textContent='トレースが長すぎます。';return}setBusy(true);let count=0;
 try{for(let i=0;i<lines.length;i++){if(disposed)return;current.gcode.executeLine(lines[i]);count=i+1;if(i%8===0){sync();await new Promise(requestAnimationFrame)}}sync();$('gcodeStatus').textContent='トレース適用済み · '+count+'行';$('gcodeStatus').classList.remove('notice')}
 catch(e){sync();$('gcodeStatus').textContent='トレース停止 · '+(count+1)+'行目 · '+e.message;$('gcodeStatus').classList.add('notice')}
 finally{if(!disposed)setBusy(false)}
});};
$('resetGcode').onclick=()=>action(()=>{current.gcode=createRatRigGcodePreview(current.adapter,current.profile);$('gcodeStatus').textContent='G-code座標状態をリセットしました。'},'gcodeStatus');
workspaceListen(window,'pagehide',()=>{disposed=true;pending?.abort();if(frameRequest!==null)cancelAnimationFrame(frameRequest);frameRequest=null;observer.disconnect();disposeRatRig(current?.root,current?.adapter);current=null;controls.dispose();environment.texture.dispose();pmrem.dispose();renderer.dispose()});
lighting();
try{
 const response=await fetch('../RATRIG_ASSETS.json?v=trident-clearance-35',{cache:'no-cache'});if(!response.ok)throw Error('RatRigのカタログを取得できません。');index=await response.json();
 const id=new URLSearchParams(location.search).get('machine')||'ratrig_vcore_41_300_corexy';if(!index.machines.some(r=>r.id===id))throw Error('RatRigの標準構成が未登録です。');setupMachineNavigation(id);await setupPublicInfo({includeDownloads:false});setupRenderExport({three:THREE,renderer,scene,camera,controls,name:id});await loadMachine(id);
}catch(e){$('status').hidden=false;$('status').textContent=e.message;document.body.dataset.error=e.message;console.error(e)}

instance = {currentRatRig,captureRatRigConfiguration,restoreRatRigConfiguration,loadMachine};
scope.cleanup(()=>{instance=null});
}
let instance;
export const currentRatRig=(...args)=>instance?.currentRatRig(...args);
export const captureRatRigConfiguration=(...args)=>instance?.captureRatRigConfiguration(...args);
export const restoreRatRigConfiguration=(...args)=>instance?.restoreRatRigConfiguration(...args);
export const loadMachine=(...args)=>instance?.loadMachine(...args);
