import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadPositron} from './positron-loader.mjs?v=a0251e1c62e47018390c';
import {positronSchema,validatePositronState} from './positron-state.mjs?v=8296d1b775fbca04462f';
import {setupMachineNavigation} from './machines.js?v=9383d20caf1cef38e5d4';
import {sceneLightingState} from './scene-lighting-state.mjs';
import {translate} from './i18n.mjs?v=59425925cded8ac6c6c4';
import {rememberDisplayControl} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceFrame,workspaceListen,workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {setupRenderExport} from './render-export.js';
import {setupPublicInfo} from './public-info.js';

const foldSteps=['ガラスベッドを外す','ベッドのネジを外す','Vホルダーを外す','ラッチを下げ、支柱のネジを外す','ヘッドを右端へ移動','Vホルダーを収納姿勢へ','ピンをJ字溝の回転位置へ移動','支柱を倒す','ヘッドを支柱側へ戻す','折り畳み完了'];
export async function mount(scope){
 const $=id=>document.getElementById(id),stage=$('stage'),machine='positron_v322',t=text=>translate(text,document.documentElement.lang);
 const requested=new URLSearchParams(location.search).get('machine');if(requested&&requested!==machine)throw Error('Positron identity mismatch');
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.005,20),controls=scope.resource(new OrbitControls(camera,renderer.domElement));controls.enableDamping=true;
 const pmrem=scope.resource(new THREE.PMREMGenerator(renderer)),room=scope.resource(pmrem.fromScene(new RoomEnvironment(),.03));scene.environment=room.texture;
 const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(ambient,sun);
 const grid=new THREE.GridHelper(2,40,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
 let current,state,animation=null,frame=null;
 const render=()=>{if(frame!==null||scope.disposed)return;frame=workspaceFrame(time=>{frame=null;if(animation){const delta=Math.min(.075,(time-animation.last)/1000);animation.last=time;const next=Math.max(0,Math.min(100,current.adapter.getFold()+animation.direction*delta*100/28));setFold(next);if(next===animation?.end)animation=null}controls.update();renderer.render(scene,camera);if(animation)render()})};
 const resize=()=>{const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);setResponsiveAspect(camera,controls,r.width,r.height);render()};new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);
 workspaceListen(document,'visibilitychange',()=>{if(animation)animation.last=performance.now();if(!document.hidden)resize()});scope.cleanup(()=>{animation=null;current=null});
 function lighting(){const settings=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(settings.background);scene.environmentIntensity=settings.environmentIntensity;renderer.toneMappingExposure=settings.exposure;ambient.intensity=settings.ambientIntensity;document.body.dataset.roomDark='false';render()}
 function setFold(percent){const pose=current.adapter.setFold(percent);state.fold=percent;$('fold').value=percent;$('foldValue').textContent=Math.round(percent)+'%';$('foldStep').textContent=percent===0?t('CAD基準姿勢'):t(foldSteps[pose.step]);document.body.dataset.fold=String(percent);document.body.dataset.columnAngle=pose.angleDegrees.toFixed(4);render();return pose}
 function stop(){animation=null}
 workspaceListen(window,'rig-language-change',()=>{if(current)setFold(current.adapter.getFold())});
 function visibleBounds(group){const box=new THREE.Box3();for(const[k,n]of current.adapter.nodes)if(n.visible&&(!group||current.adapter.records.get(k).group===group))box.expandByObject(n);return box}
 function motionBounds(){const percent=current.adapter.getFold(),box=new THREE.Box3();try{for(let p=0;p<=100;p+=5){current.adapter.setFold(p);box.union(visibleBounds())}}finally{current.adapter.setFold(percent)}return box}
 function view(kind='iso',motion=false){
  if(!current)return;const box=motion?motionBounds():visibleBounds(kind==='head'?'head':null);
  const center=box.getCenter(new THREE.Vector3()),distance=box.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.06;
  const direction=new THREE.Vector3(...({iso:[.6,.6,.95],front:[0,.15,1],top:[0,1,.0001],head:[.45,.75,1]}[kind]));
  controls.target.copy(center);camera.up.set(0,kind==='top'?0:1,kind==='top'?-1:0);camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));camera.lookAt(center);frameResponsiveView(camera,controls);controls.update();render();
 }
 function capture(){return {...structuredClone(state),schema:positronSchema,machine,camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}}
 function restore(data){validatePositronState(data);stop();state=structuredClone(data);current.adapter.setPalette(state.palette);current.adapter.setAccessoriesVisible(state.accessories);for(const c of ['base','accent','frame'])$(c).value=state.palette[c];$('accessories').checked=state.accessories;$('night').checked=state.night;$('gridVisible').checked=state.grid;grid.visible=state.grid;setFold(state.fold);camera.position.fromArray(state.camera.position);camera.up.fromArray(state.camera.up);controls.target.fromArray(state.camera.target);camera.lookAt(controls.target);controls.update();lighting();rememberDisplayControl()}
 for(const[id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
 $('night').onchange=$('night').oninput=()=>{if(state)state.night=$('night').checked;lighting()};lighting();
 setupMachineNavigation(machine);
 try{
  const indexResponse=await fetch('../POSITRON_ASSETS.json?v=positron-fold-62');if(!indexResponse.ok)throw Error('Positron catalog unavailable');current=await loadPositron(await indexResponse.json());scene.add(current.root);
  state={schema:positronSchema,machine,fold:0,palette:{...current.profile.appearance.palette_defaults},accessories:true,grid:false,night:$('night').checked};
  $('fold').oninput=()=>{stop();setFold(Number($('fold').value))};$('resetPose').onclick=()=>{stop();setFold(0);view()};
  for(const[id,direction,end]of [['foldPlay',1,100],['unfoldPlay',-1,0]])$(id).onclick=()=>{if(current.adapter.getFold()===end)return;view('iso',true);animation={direction,end,last:performance.now()};render()};$('foldPause').onclick=stop;
  for(const c of ['base','accent','frame']){$(c).value=state.palette[c];$(c).oninput=()=>{state.palette[c]=$(c).value;current.adapter.setPalette(state.palette);render()}}
  $('resetPalette').onclick=()=>{state.palette={...current.profile.appearance.palette_defaults};for(const c of ['base','accent','frame'])$(c).value=state.palette[c];current.adapter.setPalette(state.palette);render()};
  $('accessories').onchange=()=>{state.accessories=$('accessories').checked;current.adapter.setAccessoriesVisible(state.accessories);render()};$('gridVisible').onchange=()=>{state.grid=$('gridVisible').checked;grid.visible=state.grid;render()};
  $('saveConfiguration').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(capture(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=machine+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent=t('構成JSONを保存しました。')};
  $('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=()=>workspaceTask(async()=>{const file=$('configurationFile').files?.[0];$('configurationFile').value='';if(!file)return;try{if(file.size>64*1024)throw Error('Configuration exceeds 64 KB');restore(JSON.parse(await file.text()));$('configurationStatus').textContent=t('構成JSONを復元しました。')}catch(error){$('configurationStatus').textContent=error.message}});
  for(const id of ['fold','foldPlay','unfoldPlay','foldPause','resetPose','base','accent','frame','resetPalette','accessories','gridVisible','saveConfiguration','loadConfiguration'])$(id).disabled=false;
  current.adapter.setPalette(state.palette);setFold(0);view();resize();await setupPublicInfo({includeDownloads:false});setupRenderExport({three:THREE,renderer,scene,camera,controls,name:machine});$('openRender').disabled=false;
  $('badge').textContent=current.manifest.parts.length.toLocaleString()+' PARTS · POSITRON V3.2.2';document.body.dataset.ready='true';document.body.dataset.parts=current.manifest.parts.length;$('status').hidden=true;
 }catch(error){$('status').textContent=t('モデルの読込に失敗しました。機種を選び直してください。');document.body.dataset.error=error.message;throw error}
}
