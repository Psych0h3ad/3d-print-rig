import * as THREE from 'three';
import {OrbitControls} from './vendor-r180/OrbitControls.js?v=touch-37';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadCrossant,disposeCrossant} from './crossant-loader.mjs';
import {crossantSchema,crossantGroups,validateCrossantState} from './crossant-state.mjs';
import {setupMachineNavigation} from './machines.js?v=controls-icons-1';
import {setupRenderExport} from './render-export.js?v=controls-icons-1';
import {setupPublicInfo} from './public-info.js?v=controls-icons-1';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
const $=id=>document.getElementById(id),stage=$('stage'),renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,30),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
camera.position.set(.8,.6,.8);controls.target.set(0,.25,0);
const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(new RoomEnvironment(),.03),ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(ambient,sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshStandardMaterial({color:0xd6dfdb,roughness:.9}));floor.rotation.x=-Math.PI/2;scene.add(floor);const grid=new THREE.GridHelper(3,30,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
let current,frame=null,disposed=false,animation=null,marks=[],state,loaded=false;
const abort=new AbortController(),mutable=['x','y','z','nominal','resetPose','minPose','maxPose','animatePose','base','accent','frame','resetPalette','night','gridVisible','belts','chain','saveConfiguration','loadConfiguration','clearContact'];
const request=()=>{if(disposed||frame!==null)return;frame=requestAnimationFrame(t=>{frame=null;if(animation!==null)advance(t);controls.update();renderer.render(scene,camera);if(animation!==null)request()})};
controls.addEventListener('change',request);
const observer=new ResizeObserver(()=>{const r=stage.getBoundingClientRect(),w=Math.max(r.width,1),h=Math.max(r.height,1);renderer.setSize(w,h);setResponsiveAspect(camera,controls,w,h);request()});observer.observe(stage);
const reference=()=>Object.fromEntries(['x','y','z'].map((a,i)=>[a,current.profile.display_reference_xyz_mm[i]]));
function lighting(){const night=$('night').checked;document.body.classList.toggle('night',night);scene.background=new THREE.Color(night?'#04070c':'#edf1f5');scene.environment=night?null:environment.texture;scene.environmentIntensity=night?0:.16;renderer.toneMappingExposure=night?1.35:.9;ambient.intensity=night?.025:.25;sun.intensity=night?.025:1.4;floor.material.color.set(night?'#111a16':'#d6dfdb');request()}
function range(){return state.nominal?current.profile.display_limits_mm:current.profile.sampled_clearance_limits_mm}
function stop(){animation=null;if($('animatePose'))$('animatePose').textContent='動作を再生'}
function clearMarks(){for(const m of marks){m.removeFromParent();m.geometry.dispose();m.material.dispose()}marks=[]}
function sync(info){
 const p=current.adapter.getPose();state.pose={...p};
 for(const [i,a]of ['x','y','z'].entries()){$(a).min=range()['XYZ'[i]][0];$(a).max=range()['XYZ'[i]][1];$(a).value=p[a];$(a+'v').textContent=p[a].toFixed(2)+' mm'}
 $('nominal').checked=state.nominal;$('rangeNote').textContent=state.nominal?'公称範囲には元CADの接触箇所があります。':'有限サンプル検査範囲：X 0–167.38 / Y 0–220 / Z 0–200 mm';
 const within=['x','y','z'].every((a,i)=>p[a]>=current.profile.sampled_clearance_limits_mm['XYZ'[i]][0]&&p[a]<=current.profile.sampled_clearance_limits_mm['XYZ'[i]][1]);
 $('motionStatus').textContent=within?'姿勢更新済み · ベルト '+(state.belts?'4 / 4':'0 / 4'):'有限サンプル検査範囲外：元CADの接触を確認してください。';$('motionStatus').classList.toggle('notice',!within);
 for(const c of ['base','accent','frame'])$(c).value=state.palette[c];for(const k of ['belts','chain','night'])$(k).checked=state[k];$('gridVisible').checked=state.grid;
 for(const k of crossantGroups)$('group-'+k).checked=state.groups[k];for(const m of marks)m.update();request();return info;
}
export function setCrossantPose(pose){
 if(!loaded)throw Error('モデルを読み込み中です。');
 for(const [i,a]of ['x','y','z'].entries())if(typeof pose[a]!=='number'||!Number.isFinite(pose[a])||pose[a]<range()['XYZ'[i]][0]||pose[a]>range()['XYZ'[i]][1])throw Error('Crossantの表示範囲外です。');
 return sync(current.adapter.setPose(pose));
}
function action(f,status='motionStatus'){if(!loaded)return;try{f();$(status).classList.remove('notice')}catch(e){sync();$(status).textContent=e.message;$(status).classList.add('notice')}}
function view(kind='iso'){
 if(!current)return;const box=new THREE.Box3().setFromObject(current.root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 if(kind==='head'){const head=new THREE.Box3();for(const [key,n]of current.adapter.nodes)if(current.adapter.records.get(key).motion==='xy')head.expandByObject(n);head.getCenter(center)}
 const d=size.length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.08;
 const offset=kind==='head'?new THREE.Vector3(.18,.10,.24):new THREE.Vector3(...(kind==='top'?[0,1,0]:kind==='front'?[0,0,1]:[.7,.45,.85])).normalize().multiplyScalar(d);
 camera.up.set(0,1,0);if(kind==='top')camera.up.set(0,0,-1);controls.target.copy(center);camera.position.copy(center).add(offset);camera.lookAt(center);frameResponsiveView(camera,controls);request();
}
function advance(t){
 if(animation===null)return;const phase=(t-animation)/1000,u=(Math.sin(phase*.7)+1)/2,v=(Math.sin(phase*.53+1)+1)/2,w=(Math.sin(phase*.37+2)+1)/2,r=range();
 try{setCrossantPose({x:r.X[0]+(r.X[1]-r.X[0])*u,y:r.Y[0]+(r.Y[1]-r.Y[0])*v,z:r.Z[0]+(r.Z[1]-r.Z[0])*w})}catch(e){stop();$('motionStatus').textContent=e.message}
}
export const currentCrossant=()=>current;
export function captureCrossantState(){return {...structuredClone(state),schema:crossantSchema,machine:current.profile.machine_id,camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}}
export function restoreCrossantState(data){
 validateCrossantState(current.profile,data);const old=captureCrossantState();stop();
 try{current.adapter.setPose(data.pose)}catch(e){current.adapter.setPose(old.pose);throw e}
 clearMarks();state=structuredClone(data);current.adapter.setPalette(state.palette);current.adapter.setBeltsVisible(state.belts);current.chain.setVisible(state.chain);for(const k of crossantGroups)current.adapter.setGroupVisible(k,state.groups[k]);grid.visible=state.grid;
 camera.position.fromArray(state.camera.position);camera.up.fromArray(state.camera.up);controls.target.fromArray(state.camera.target);camera.lookAt(controls.target);sync();lighting();return captureCrossantState();
}
for(const a of ['x','y','z'])$(a).oninput=()=>action(()=>{stop();setCrossantPose({...current.adapter.getPose(),[a]:Number($(a).value)})});
$('nominal').onchange=()=>action(()=>{stop();state.nominal=$('nominal').checked;const p={...current.adapter.getPose()};for(const[i,a]of ['x','y','z'].entries())p[a]=Math.max(range()['XYZ'[i]][0],Math.min(range()['XYZ'[i]][1],p[a]));clearMarks();setCrossantPose(p)});
$('resetPose').onclick=()=>action(()=>{stop();clearMarks();setCrossantPose(reference())});
for(const [id,end]of [['minPose',0],['maxPose',1]])$(id).onclick=()=>action(()=>{stop();clearMarks();setCrossantPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,range()['XYZ'[i]][end]])))});
$('animatePose').onclick=()=>{if(!loaded)return;if(animation!==null)stop();else{clearMarks();animation=performance.now();$('animatePose').textContent='再生を停止';request()}};
for(const c of ['base','accent','frame'])$(c).oninput=()=>action(()=>{state.palette[c]=$(c).value;current.adapter.setPalette(state.palette);sync()});$('resetPalette').onclick=()=>action(()=>{state.palette={...current.profile.appearance.palette_defaults};current.adapter.setPalette(state.palette);sync()});
for(const k of ['belts','chain','night'])$(k).onchange=()=>action(()=>{state[k]=$(k).checked;if(k==='belts')current.adapter.setBeltsVisible(state.belts);if(k==='chain')current.chain.setVisible(state.chain);sync();lighting()});
$('gridVisible').onchange=()=>action(()=>{state.grid=$('gridVisible').checked;grid.visible=state.grid;sync()});
for(const [id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
$('clearContact').onclick=clearMarks;
$('saveConfiguration').onclick=()=>{if(!loaded)return;const url=URL.createObjectURL(new Blob([JSON.stringify(captureCrossantState(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=current.profile.machine_id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent='構成JSONを保存しました。'};
$('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=async()=>{const f=$('configurationFile').files?.[0];$('configurationFile').value='';if(!f||!loaded)return;try{if(f.size>64*1024)throw Error('構成JSONは64 KB以下で指定してください。');restoreCrossantState(JSON.parse(await f.text()));$('configurationStatus').textContent='構成JSONを復元しました。';$('configurationStatus').classList.remove('notice')}catch(e){$('configurationStatus').textContent=e.message;$('configurationStatus').classList.add('notice')}};
window.addEventListener('pagehide',()=>{disposed=true;loaded=false;abort.abort();stop();if(frame!==null)cancelAnimationFrame(frame);clearMarks();observer.disconnect();disposeCrossant(current?.root);current=null;controls.dispose();environment.texture?.dispose();pmrem.dispose();renderer.dispose()});
lighting();
try{
 const machine=new URLSearchParams(location.search).get('machine')||'crossant_235_v06_leadscrew';if(machine!=='crossant_235_v06_leadscrew')throw Error('Crossantの構成情報が一致しません。');setupMachineNavigation(machine);
 const response=await fetch('../CROSSANT_ASSETS.json?v=crossant-36',{signal:abort.signal,cache:'no-cache'});if(!response.ok)throw Error('Crossantのモデルを取得できません。');const next=await loadCrossant(await response.json(),{signal:abort.signal,onProgress:t=>$('status').textContent=t});
 if(disposed)disposeCrossant(next.root);else{
  current=next;scene.add(current.root);state={schema:crossantSchema,machine,pose:reference(),nominal:false,palette:{...current.profile.appearance.palette_defaults},groups:Object.fromEntries(crossantGroups.map(k=>[k,true])),belts:true,chain:true,night:false,grid:false};
  for(const [i,k]of crossantGroups.entries()){
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='group-'+k;input.checked=true;input.onchange=()=>action(()=>{state.groups[k]=input.checked;current.adapter.setGroupVisible(k,input.checked);sync()});label.append(input,['電子部品','スカート','CPAPハウジング','フィルター'][i]);$('groups').append(label);
  }
  for(const c of current.contacts.nominal_grid_findings){
   if(![c.part_a,c.part_b].every(k=>current.adapter.nodes.has(k))||!c.first_pose_mm)throw Error('Crossantの接触部品が不足しています。');
   const b=document.createElement('button');b.textContent=c.name_a+' / '+c.name_b;b.dataset.i18n='off';b.onclick=()=>action(()=>{stop();state.nominal=true;clearMarks();setCrossantPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,c.first_pose_mm[i]])));for(const key of [c.part_a,c.part_b]){const m=new THREE.BoxHelper(current.adapter.nodes.get(key),0xffaa00);scene.add(m);marks.push(m)}view('head')});$('contacts').append(b);
  }
  floor.position.y=new THREE.Box3().setFromObject(current.root).min.y-.004;grid.position.y=floor.position.y+.001;current.adapter.setPalette(state.palette);loaded=true;for(const id of mutable)$(id).disabled=false;sync();view();$('badge').textContent='Crossant-235 · 2,177 PARTS';$('status').hidden=true;document.body.dataset.assetStatus='ready';
  await setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:machine});
 }
}catch(e){if(!disposed){$('status').hidden=false;$('status').textContent=e.message;document.body.dataset.assetStatus='error';document.body.dataset.error=e.message;console.error(e)}}
