import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadCommunity} from './community-loader.mjs?v=d5d464215f225e9cc06e';
import {communitySchema,validateCommunityState,communityMotionEnabled} from './community-state.mjs?v=97f7806821349b272754';
import {setupMachineNavigation} from './machines.js?v=98f22b8a6b185e5aa7e3';
import {sceneLightingState} from './scene-lighting-state.mjs';
import {translate} from './i18n.mjs?v=fc082a8e3829df1e89b3';
import {rememberDisplayControl} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceFrame,workspaceListen,workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {setupRenderExport} from './render-export.js';
import {setupPublicInfo} from './public-info.js?v=2bbf2c451ffa53bf08e7';
const descriptions={
 tictac_21_120:"TicTac 2.1 · 120 mm / 新Rat Rigツールヘッド / 公式組立CAD",
 rook_mk2_120:"Rook MK2 beta · 120 mm / Dragon Burner / Bambu / Galileo 2 G2SA",
 the100_v11_165:"THE 100 v1.1 · 165 × 165 × 150 mm / BMG Bowden / CHC Pro Volcano",
 satsuma180_v10:"Satsuma 180 v1.0 · 180 mm / CoreXY / Orbiter 2.0 / Prusa MINIベッド",
 sovol_sv08_350:'SOVOL SV08 · 350 × 350 × 345 mm / CoreXY / 4Z / 公式組立CAD',
 lh_stinger_200:'LH Stinger 1.0 · 200 mmカーボンベッド / Orbiter V2.0 / Dragon HF / Y軸AWD',
 ender3_stock_220:'初代Ender-3の標準構成 · Bowden / Cartesian',
 mercury_one1_235:'Mercury One.1 · Ender-5 / EVA 2.4 / LGX Lite / Rapido / BLTouch',
 mercury_one1_370:'Mercury One.1 · Ender-5 Plus / EVA 2.4 / LGX Lite / Rapido / BLTouch',
 vzbot_330_printed:'VzBot 330 · プリントAWD / Goliath / Vz-HextrudORT / CPAP',
 siboor_sboom_220:'SIBOOR S-BOOM · CoreXZ / Dragon Burner / Sherpa Mini / E3D V6 / Tap',
 antithesis_aether_mk11:'Antithesis Aether MK1.1 · アルミガントリー / Conch / Galileo 2 · 130 × 100 × 115.5 mm',
 ratrig_vminion_180:'Rat Rig V-Minion 1.0 · EVA / LGX Lite / Dragonfly BMO / SKR 2',
 snakeoil_xy_180:'SnakeOil XY · 180 / Mosquito / Sherpa Mini / 3点ベッド',
 snakeoil_xy_idex:'SnakeOil XY IDEX · 2ヘッド / Mosquito / Sherpa Mini / EBB36',
 snakeoil_3s_kp3s_180:'SnakeOil XY-3S · KP3S / E3D V6 / Sherpa Mini',
 snakeoil_proosaxy:'ProosaXY · MK3-SからCoreXY / E3D V6 / Sherpa Mini / 3軸Z',
};
const sourceNotices={ tictac_21_120:"全体CADの静止モデルです。参考床・校正キューブと重複部品は参考表示に分けています。可動操作とMod交換は未対応です。", rook_mk2_120:"MK2 betaの全体CADにGalileo 2 G2SAを表示しています。固定穴と座面を照合していますが、元CADに省かれた固定ネジは補っていません。静止モデルです。", the100_v11_165:"全体CADの静止モデルです。重複マウントは参考表示に分けています。元CADにベルトと全体のPTFE経路が含まれていません。", satsuma180_v10:"全体CADの静止モデルです。パネル・色・カメラを確認できます。可動操作とMod交換は未対応です。",sovol_sv08_350:'全体CADの静止モデルです。Z取付部の座面と固定穴を照合し、ノズルをベッドから離した位置に配置しています。重複部品は参考表示に分けています。元CADにはXYベルトが含まれていません。未接続のPTFEと配線も参考表示に分けています。可動操作とMod交換は未対応です。',lh_stinger_200:'元CADの延長ノズル構成です。組立治具と短いノズルは参考表示に分けています。電子ボックスはこのCADに含まれていません。',vzbot_330_printed:'公式プリントAWD v1.2を表示しています。元CADのXYベルトは一部のみで、CPAPホースは含まれていません。',ender3_stock_220:'元の公式CADにはBowdenチューブが含まれていません。',antithesis_aether_mk11:'公式CADのアルミ仕様です。組立治具・重複部品・MJF向け代替部品を標準表示から分けています。',snakeoil_xy_idex:'左右のヘッドをX・X2で個別に動かせます。元CADに重複したSherpa Miniを標準表示から分けています。XYベルトは一部のみ含まれます。',snakeoil_3s_kp3s_180:'元CADにはXYベルトと全体の配線経路が含まれていません。',snakeoil_proosaxy:'元CADにはXYベルトと全体の配線経路が含まれていません。'};
export async function mount(scope){
 const $=id=>document.getElementById(id),stage=$('stage'),machine=new URLSearchParams(location.search).get('machine')||'ender3_stock_220',t=v=>translate(v,document.documentElement.lang);
 if(!Object.hasOwn(descriptions,machine))throw Error('Unknown community printer');
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.005,30),controls=scope.resource(new OrbitControls(camera,renderer.domElement));controls.enableDamping=true;
 const pmrem=scope.resource(new THREE.PMREMGenerator(renderer)),environment=scope.resource(pmrem.fromScene(new RoomEnvironment(),.03));scene.environment=environment.texture;
 const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(ambient,sun);
 const grid=new THREE.GridHelper(2,40,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
 let current,state,axisKeys=['x','y','z'],animation=null,frame=null;
 function render(){if(frame!==null||scope.disposed)return;frame=workspaceFrame(time=>{frame=null;if(animation){const u=Math.min(1,(time-animation.start)/12000);setAxes(Object.fromEntries(axisKeys.map(k=>[k,animation.from[k]+(animation.to[k]-animation.from[k])*(.5-.5*Math.cos(Math.PI*u))])));if(u===1)animation=null}controls.update();renderer.render(scene,camera);if(animation)render()})}
 function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);setResponsiveAspect(camera,controls,r.width,r.height);render()}
 new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);scope.cleanup(()=>{animation=null;current=null});
 workspaceListen(document,'visibilitychange',()=>{if(!document.hidden)resize()});
 function lighting(){const settings=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(settings.background);scene.environmentIntensity=settings.environmentIntensity;renderer.toneMappingExposure=settings.exposure;ambient.intensity=settings.ambientIntensity;document.body.dataset.roomDark='false';render()}
 function setAxes(next){state.axes=current.adapter.setAxes(next);for(const k of axisKeys){$(k).value=state.axes[k];$(k+'Value').textContent=state.axes[k].toFixed(1)+' mm'}document.body.dataset.pose=JSON.stringify(state.axes);render()}
 function visibleBounds(group){const box=new THREE.Box3();for(const[key,n]of current.adapter.nodes)if(n.visible&&(!group||(current.profile.head_groups||[group]).includes(current.adapter.records.get(key).group)))box.expandByObject(n);return box}
 function view(kind='iso'){
  if(!current)return;const box=visibleBounds(kind==='head'?'head':null),center=box.getCenter(new THREE.Vector3());
  const distance=box.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.04;
  const direction=new THREE.Vector3(...(current.profile.view_directions?.[kind]||{iso:[.6,.6,.95],front:[0,.12,1],top:[0,1,.0001],head:[.4,.5,1]}[kind]));
  controls.target.copy(center);camera.up.set(0,kind==='top'?0:1,kind==='top'?-1:0);camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));camera.lookAt(center);frameResponsiveView(camera,controls);controls.update();render();
 }
 function capture(){return {...structuredClone(state),camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}}
 function restore(data){validateCommunityState(data,current.profile);animation=null;state=structuredClone(data);current.adapter.setPalette(state.palette);current.adapter.setReferences(state.references);for(const k of ['base','accent','frame'])$(k).value=state.palette[k];$('references').checked=state.references;$('night').checked=state.night;$('gridVisible').checked=state.grid;grid.visible=state.grid;setAxes(state.axes);camera.position.fromArray(state.camera.position);camera.up.fromArray(state.camera.up);controls.target.fromArray(state.camera.target);camera.lookAt(controls.target);controls.update();lighting();rememberDisplayControl()}
 for(const[id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
 $('night').oninput=$('night').onchange=()=>{if(state)state.night=$('night').checked;lighting()};lighting();setupMachineNavigation(machine);
 function describe(){if(!current)return;$('machineDescription').textContent=t(descriptions[machine]);$('sourceNotice').hidden=!sourceNotices[machine];$('sourceNotice').textContent=sourceNotices[machine]?t(sourceNotices[machine]):''}
 workspaceListen(window,'rig-language-change',describe);
 try{
  const response=await fetch('../COMMUNITY_MACHINES_ASSETS.json?v=b1f97f395b36aed9e07b');if(!response.ok)throw Error('Native catalog unavailable');current=await loadCommunity(await response.json(),machine);scene.add(current.root);axisKeys=Object.keys(current.profile.axes);const zeroAxes=()=>Object.fromEntries(axisKeys.map(k=>[k,0]));
  for(const k of axisKeys)if(!$(k)){const label=document.createElement('label'),span=document.createElement('span'),value=document.createElement('strong'),input=document.createElement('input');label.htmlFor=k;span.className='axislabel';span.append(current.profile.axis_labels?.[k]||k.toUpperCase());value.id=k+'Value';span.append(value);label.append(span);input.id=k;input.type='range';input.step='any';$('z').after(label,input)}
  state={schema:communitySchema,machine,axes:zeroAxes(),palette:{...current.profile.palette_defaults},references:false,grid:false,night:$('night').checked};
  $('machineTitle').textContent=current.profile.title;document.title=current.profile.title+' · 3D Print Rig';describe();$('machineRevision').textContent=current.profile.source.version;
  $('nativeSource').href=current.profile.source.upstream_url||current.profile.source.repository+'/tree/'+current.profile.source.revision;$('nativeSource').textContent=(current.profile.source.author||current.profile.source.repository.replace('https://github.com/',''))+' · '+current.profile.source.version;$('nativeLicense').textContent=current.profile.source.license;
  $('references').disabled=!current.manifest.reference_leaves.length;
  const movable=communityMotionEnabled(current.profile);$('motionSettings').hidden=!movable;document.body.dataset.motionEnabled=String(movable);
  for(const k of axisKeys){[$(k).min,$(k).max]=current.profile.axes[k];$(k).disabled=!movable;$(k).oninput=()=>{animation=null;setAxes({...state.axes,[k]:Number($(k).value)})}}
  $('motionPause').onclick=()=>{animation=null};$('motionPlay').onclick=()=>{const to=Object.fromEntries(axisKeys.map(k=>[k,current.profile.axes[k][1]]));animation={start:performance.now(),from:{...state.axes},to};render()};$('resetPose').onclick=()=>{animation=null;setAxes(zeroAxes());view()};
  for(const k of ['base','accent','frame']){$(k).value=state.palette[k];$(k).oninput=()=>{state.palette[k]=$(k).value;current.adapter.setPalette(state.palette);render()}}
  $('resetPalette').onclick=()=>{state.palette={...current.profile.palette_defaults};for(const k of ['base','accent','frame'])$(k).value=state.palette[k];current.adapter.setPalette(state.palette);render()};
  $('references').onchange=()=>{state.references=$('references').checked;current.adapter.setReferences(state.references);render()};$('gridVisible').onchange=()=>{state.grid=$('gridVisible').checked;grid.visible=state.grid;render()};
  $('saveConfiguration').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(capture(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=machine+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent=t('構成JSONを保存しました。')};
  $('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=()=>workspaceTask(async()=>{const file=$('configurationFile').files?.[0];$('configurationFile').value='';if(!file)return;try{if(file.size>64*1024)throw Error('Configuration exceeds 64 KB');restore(JSON.parse(await file.text()));$('configurationStatus').textContent=t('構成JSONを復元しました。')}catch(e){$('configurationStatus').textContent=e.message}});
  for(const id of ['resetPose','base','accent','frame','resetPalette','gridVisible','saveConfiguration','loadConfiguration'])$(id).disabled=false;
  $('motionPlay').disabled=$('motionPause').disabled=!movable;current.adapter.setPalette(state.palette);setAxes(state.axes);view();resize();await setupPublicInfo({includeDownloads:false});setupRenderExport({three:THREE,renderer,scene,camera,controls,name:machine});$('openRender').disabled=false;
  const visible=[...current.adapter.nodes.values()].filter(n=>n.visible).length;$('badge').textContent=visible.toLocaleString()+' PARTS · '+current.profile.title.toUpperCase();document.body.dataset.ready='true';document.body.dataset.parts=String(current.manifest.native_leaf_count);$('status').hidden=true;
 }catch(e){$('status').textContent=t('モデルの読込に失敗しました。機種を選び直してください。');document.body.dataset.error=e.message;throw e}
}
