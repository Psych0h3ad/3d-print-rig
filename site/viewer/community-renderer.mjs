import {setupGcodePanel} from './gcode-panel.js?v=66041e969f9190a81416';
import {displacementGcodeSettings,displacementCoordinateNote,unavailableCoordinateNote} from './gcode-machine-bindings.mjs?v=460777c3fc4d1a74bf27';
import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {RoomEnvironment} from './vendor-r180/RoomEnvironment.js';
import {loadCommunity} from './community-loader.mjs?v=7615fb601c94cb3788dd';
import {evaCommunityIndex} from './eva-installations.mjs?v=4dfad49e1f98d4b5b9f2';
import {applyEvaOptionsProfile,createEvaOptionsController} from './eva-options.mjs?v=6bc7bfbdf9a9949767ac';
import {withHeadAdditions} from './head-additions.mjs?v=a1cfc8aca74dc421ee1a';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {communitySchema,validateCommunityState,communityMotionEnabled,communityConfiguration} from './community-state.mjs?v=460b3fa78cc503ddb6e6';
import {installationFor,installationOptionAvailable} from './ender-mods.mjs';
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {sceneLightingState} from './scene-lighting-state.mjs?v=0e24bd8b53a400dfb636';
import {translate,loadLanguage,messageIdFor} from './i18n.mjs?v=628c8b0455eaed91f60d';
import {rememberDisplayControl} from './display-preferences.mjs?v=8f347468def25922153c';
import {workspaceFrame,workspaceListen,workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import {setResponsiveAspect,frameResponsiveView,settleCameraPose} from './responsive-camera.mjs?v=149a79a654914b2af652';
import {setupRenderExport} from './render-export.js?v=92d6e71ee392361a4f7d';
import {setupPublicInfo} from './public-info.js?v=4f5d0d4b690288489ad9';
const descriptions={
 voron_switchwire_250:'Official Switchwire v1 CAD assembly with Stealthburner, CW2 and Revo Voron.',
 '247zero_beta2_120':'247zero BETA2 · 120 mm / ULW carbon gantry / Crazy Volcano / M4 Bowden',
 doomcube2_350_reference:"DoomCube 2 · 350 mm / double enclosure / original CAD",
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
 ratrig_vcore31_300:'Rat Rig V-Core 3.1 · EVA 3 / LGX Lite / Rapido HF / SuperPINDA',
 snakeoil_xy_180:'SnakeOil XY · 180 / Mosquito / Sherpa Mini / 3点ベッド',
 snakeoil_xy_idex:'SnakeOil XY IDEX · 2ヘッド / Mosquito / Sherpa Mini / EBB36',
 snakeoil_3s_kp3s_180:'SnakeOil XY-3S · KP3S / E3D V6 / Sherpa Mini',
 snakeoil_proosaxy:'ProosaXY · MK3-SからCoreXY / E3D V6 / Sherpa Mini / 3軸Z',
};
const sourceNotices={ '247zero_beta2_120':"BETA2 CAD v43 with original V0.2 skirts. Motion and Bowden routing are previews; firmware limits and whole-machine clearance remain unverified.", tictac_21_120:"Native XYZ movement preview. The floor, calibration cubes and duplicate parts are separated as references.", rook_mk2_120:"Rook MK2 beta with Galileo 2 G2SA and native XYZ movement. Mounting holes and seats were compared; omitted source screws are not synthesized.", the100_v11_165:"Native XYZ movement preview. The duplicate mount is separated as a reference. The source omits belts and the complete Bowden route.", satsuma180_v10:"Native XYZ movement preview with moving XY belts and bed cable.",sovol_sv08_350:'Native XYZ movement preview with moving XY belt envelopes and seated Z carriages. Duplicate parts and disconnected source PTFE/wires are separated as references.',lh_stinger_200:'元CADの延長ノズル構成です。組立治具と短いノズルは参考表示に分けています。電子ボックスはこのCADに含まれていません。',vzbot_330_printed:'公式プリントAWD v1.2を表示しています。元CADのXYベルトは一部のみで、CPAPホースは含まれていません。',ender3_stock_220:'Bowden経路は原本のD4チューブ断面と継手位置を使用した450 mmの表示プレビューです。原CADに全長の配管は含まれません。',antithesis_aether_mk11:'公式CADのアルミ仕様です。組立治具・重複部品・MJF向け代替部品を標準表示から分けています。',snakeoil_xy_idex:'左右のヘッドをX・X2で個別に動かせます。元CADに重複したSherpa Miniを標準表示から分けています。XYベルトは一部のみ含まれます。',snakeoil_3s_kp3s_180:'元CADにはXYベルトと全体の配線経路が含まれていません。',snakeoil_proosaxy:'元CADにはXYベルトと全体の配線経路が含まれていません。'};
sourceNotices.voron_switchwire_250='Source: VoronDesign/Voron-Switchwire, revision 92cc013ca2af94e6c09950dbe05c0973ee49aa00 (GPL-3.0). Preview movement does not establish physical clearance.';
import {isSourceAssemblyMachine} from './source-assembly-registry.mjs';
export async function mount(scope){
 if(isSourceAssemblyMachine(new URLSearchParams(location.search).get('machine')))return (await import('./source-assembly.mjs?v=747c4105a7629d45501a')).mount(scope);
 await loadLanguage(document.documentElement.lang);if(scope.disposed)return;
 const $=id=>document.getElementById(id),stage=$('stage'),machine=new URLSearchParams(location.search).get('machine')||'ender3_stock_220',t=v=>translate(v,document.documentElement.lang);
 const status=$('status'),modelNotice=$('sourceModelNotice');
 function statusText(source=''){
  if(scope.disposed)return;
  const id=source&&messageIdFor(source);if(id)status.setAttribute('data-i18n-id',id);else status.removeAttribute('data-i18n-id');
  status.textContent=source?t(source):'';status.hidden=!source;
 }
 // This template placeholder is not a model notice. Its translation binding
 // would otherwise restore "Loading assembly" after the model is already ready.
 if(modelNotice.getAttribute('data-i18n-id')==='source_assembly.loading'){
  modelNotice.removeAttribute('data-i18n-id');modelNotice.textContent='';modelNotice.hidden=true;
 }
 document.body.dataset.ready='false';delete document.body.dataset.error;$('openRender').disabled=true;statusText('Loading CAD…');
 try{
 if(!Object.hasOwn(descriptions,machine))throw Error('Unknown community printer');
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.005,30),controls=scope.resource(new OrbitControls(camera,renderer.domElement));controls.enableDamping=true;
 const pmrem=scope.resource(new THREE.PMREMGenerator(renderer)),environment=scope.resource(pmrem.fromScene(new RoomEnvironment(),.03));scene.environment=environment.texture;
 const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(ambient,sun);
 const grid=new THREE.GridHelper(2,40,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
 let current,state,evaOptions=null,installationRequest=0,axisKeys=['x','y','z'],animation=null,frame=null;
 const ranges=()=>({...current.profile.axes,...communityConfiguration(current.profile,state.configuration??'stock').axes});
 function render(){if(frame!==null||scope.disposed)return;frame=workspaceFrame(time=>{frame=null;if(animation){const u=Math.min(1,(time-animation.start)/24000),stage=Math.min(2,Math.floor(u*3)),v=Math.min(1,u*3-stage),ease=.5-.5*Math.cos(Math.PI*v);setAxes(Object.fromEntries(axisKeys.map(k=>{const range=ranges()[k],points=[animation.from[k],range[0],range[1],Math.max(range[0],Math.min(0,range[1]))];return [k,points[stage]+(points[stage+1]-points[stage])*ease]})));if(u===1)animation=null}controls.update();renderer.render(scene,camera);if(animation)render()})}
 function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);setResponsiveAspect(camera,controls,r.width,r.height);render()}
 new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);scope.cleanup(()=>{animation=null;current=null});
 workspaceListen(document,'visibilitychange',()=>{if(!document.hidden)resize()});
 function lighting(){const settings=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(settings.background);scene.environmentIntensity=settings.environmentIntensity;renderer.toneMappingExposure=settings.exposure;ambient.intensity=settings.ambientIntensity;document.body.dataset.roomDark='false';render()}
 function setAxes(next){state.axes=current.adapter.setAxes(next);evaOptions?.update(state.axes);for(const k of axisKeys){$(k).value=state.axes[k];$(k+'Value').textContent=state.axes[k].toFixed(1)+' mm'}document.body.dataset.pose=JSON.stringify(state.axes);render()}
 function setPalette(value){current.adapter.setPalette(value);evaOptions?.setPalette(value);render()}
 function visibleBounds(group){const box=new THREE.Box3();for(const[key,n]of current.adapter.nodes)if(n.visible&&(!group||(current.profile.head_groups||[group]).includes(current.adapter.records.get(key).group)))box.expandByObject(n);if(evaOptions?.current)box.union(evaOptions.bounds());if(!group)for(const n of current.adapter.zeroBowden?.meshes||[])if(n.visible)box.expandByObject(n);return box}
 function view(kind='iso'){
  if(!current)return;const box=visibleBounds(kind==='head'?'head':null),center=box.getCenter(new THREE.Vector3());
  const distance=box.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.04;
  const direction=new THREE.Vector3(...(current.profile.view_directions?.[kind]||{iso:[.6,.6,.95],front:[0,.12,1],top:[0,1,.0001],head:[.4,.5,1]}[kind]));
  controls.target.copy(center);camera.up.set(0,kind==='top'?0:1,kind==='top'?-1:0);camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));camera.lookAt(center);frameResponsiveView(camera,controls);controls.update();render();
 }
 async function setInstallation(id){
  if(id==='stock'&&current.profile.eva_installation)id=current.profile.eva_installation.configuration;
  communityConfiguration(current.profile,id);const request=++installationRequest;
  if(evaOptions){const result=await evaOptions.install(id);if(result.stale||request!==installationRequest)return false}
  if(scope.disposed)return false;
  animation=null;
  state.configuration=current.adapter.setConfiguration(id);state.axes=current.adapter.getAxes();evaOptions?.update(state.axes);
  for(const k of axisKeys){if(!$(k))continue;[$(k).min,$(k).max]=ranges()[k];$(k).value=state.axes[k];$(k+'Value').textContent=state.axes[k].toFixed(1)+' mm'}
  document.body.dataset.configuration=id;
  if(current.profile.configurations){const url=new URL(location.href);url.searchParams.set('configuration',id);history.replaceState(null,'',url)}
  describe();const visible=[...current.adapter.nodes.values()].filter(n=>n.visible).length+(evaOptions?.current?.manifest.parts.length||0);
  $('badge').textContent=visible.toLocaleString()+' PARTS · '+current.profile.title.toUpperCase();render();return true;
 }
 function capture(){return {...structuredClone(state),camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}}
 async function restore(data){validateCommunityState(data,current.profile);animation=null;if(!await setInstallation(data.configuration??'stock'))return;state=structuredClone(data);if(state.configuration==='stock'&&current.profile.eva_installation)state.configuration=current.profile.eva_installation.configuration;setPalette(state.palette);current.adapter.setReferences(state.references);evaOptions?.update(state.axes);for(const k of ['base','accent','frame'])$(k).value=state.palette[k];$('references').checked=state.references;$('night').checked=state.night;$('gridVisible').checked=state.grid;grid.visible=state.grid;setAxes(data.axes);camera.position.fromArray(state.camera.position);camera.up.fromArray(state.camera.up);controls.target.fromArray(state.camera.target);settleCameraPose(camera,controls);lighting();rememberDisplayControl()}
 for(const[id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
 $('night').oninput=$('night').onchange=()=>{if(state)state.night=$('night').checked;lighting()};lighting();setupMachineNavigation(machine);
 function describe(){
  if(!current||!state)return;const selected=communityConfiguration(current.profile,state.configuration??'stock');$('installationNotice').textContent=(selected.notices||[selected.notice]).filter(Boolean).map(t).join(' ');
  document.querySelector('label[for="headInstallation"]').textContent=t(current.profile.configuration_label||'Toolhead installation');
  const sources=selected.sources||[selected.source].filter(Boolean);$('installationSource').hidden=!sources.length;$('installationSource').replaceChildren();
  for(const source of sources){const link=document.createElement('a'),p=document.createElement('p');link.target='_blank';link.rel='noopener';link.href=source.url;link.textContent=[source.author||source.name,source.version||source.revision||source.source_revision||source.commit].filter(Boolean).join(' · ')||new URL(source.url).hostname;p.textContent=source.license||'';$('installationSource').append(link,p)}
  function choices(element,options,value){element.replaceChildren(...Object.entries(options).map(([id,c])=>{const o=document.createElement('option');o.value=id;o.textContent=t(c.label);return o}));element.value=value}
  const mods=current.profile.mod_controls;$('driveOptions').hidden=!mods;
  if(mods){for(const[k,id]of [['head','headInstallation'],['z','zInstallation'],['probe','probeInstallation']]){
   choices($(id),mods[k],selected.selection[k]);
   for(const option of $(id).options)option.disabled=!installationOptionAvailable(current.profile,k,option.value,selected.selection);
  }}
  else choices($('headInstallation'),Object.fromEntries(Object.entries(current.profile.configurations||{}).filter(([id])=>!current.profile.eva_installation||id!=='stock')),state.configuration??'stock');
  const eva=current.profile.eva_installation;$('evaHeadLink').hidden=!eva;
  modelNotice.hidden=!!eva||!modelNotice.textContent.trim();
  if(eva){const url=new URL('./toolheads.html',location.href);url.searchParams.set('configuration',state.configuration==='stock'?eva.configuration:state.configuration);url.searchParams.set('return_machine',machine);url.searchParams.set('lang',document.documentElement.lang);$('evaHeadLink').href=url.href;}
  const nativeReview=evaOptions?.entries.find(v=>v.id===state.configuration)?.installation.native_review
   ||(['stock',eva?.configuration].includes(state.configuration)?eva?.native_review:null);
  if(nativeReview){const link=document.createElement('a');link.href=nativeReview.url;link.target='_blank';link.rel='noopener';link.textContent=t('Native mounting review');$('installationSource').hidden=false;$('installationSource').append(link);}
  const licenseNotices=selected.source_license_notices||[];$('sourceLicenseNotice').hidden=!licenseNotices.length;$('sourceLicenseNotice').textContent=licenseNotices.map(t).join(' ');
  $('machineDescription').textContent=t(selected.machine_description||descriptions[machine]);const notices=selected.motion_notices||[sourceNotices[machine],...(current.profile.motion_registration?.notices||[])].filter(Boolean);$('sourceNotice').hidden=!notices.length;$('sourceNotice').textContent=notices.map(t).join(' ')
 }
 workspaceListen(window,'rig-language-change',async()=>{const language=document.documentElement.lang;await loadLanguage(language);if(language===document.documentElement.lang&&!scope.disposed)describe()});
  const responses=await Promise.all(['COMMUNITY_MACHINES_ASSETS.json','EVA_INSTALLATIONS.json'].map(name=>fetch('../'+name,{cache:'no-cache'})));if(responses.some(r=>!r.ok))throw Error('Native catalog unavailable');const [nativeIndex,evaRegistry]=await Promise.all(responses.map(r=>r.json()));current=await loadCommunity(evaCommunityIndex(nativeIndex,evaRegistry),machine);scene.add(current.root);axisKeys=Object.keys(current.profile.axes);const zeroAxes=()=>Object.fromEntries(axisKeys.map(k=>{const [lo,hi]=(state?ranges():current.profile.axes)[k];return [k,Math.max(lo,Math.min(0,hi))]}));
  if(current.profile.eva_installation){
   const responses=await Promise.all(['EVA_OPTIONS.json','TOOLHEAD_CONFIGURATIONS.json','HEAD_ADDITIONS.json'].map(name=>fetch('../'+name,{cache:'no-cache'})));
   if(responses.some(r=>!r.ok))throw Error('EVA option catalog unavailable');
   const [options,rawHeads,additions]=await Promise.all(responses.map(r=>r.json())),heads=withHeadAdditions(rawHeads,additions);
   applyEvaOptionsProfile(current,options,heads);
   evaOptions=createEvaOptionsController(current,{registry:options,heads,loader:new GLTFLoader(),href:location.href});scope.cleanup(()=>evaOptions?.dispose());
  }
  for(const k of axisKeys)if(!$(k)){const label=document.createElement('label'),span=document.createElement('span'),value=document.createElement('strong'),input=document.createElement('input');label.htmlFor=k;span.className='axislabel';span.append(current.profile.axis_labels?.[k]||k.toUpperCase());value.id=k+'Value';span.append(value);label.append(span);input.id=k;input.type='range';input.step='any';$('z').after(label,input)}
  state={schema:communitySchema,machine,configuration:'stock',axes:zeroAxes(),palette:{...current.profile.palette_defaults},references:false,grid:false,night:$('night').checked};
  $('machineTitle').textContent=current.profile.title;document.title=current.profile.title+' · 3D Print Rig';describe();$('machineRevision').textContent=current.profile.source.version;
  $('nativeSource').href=current.profile.source.cad_url||current.profile.source.upstream_url||current.profile.source.repository+'/tree/'+current.profile.source.revision;$('nativeSource').textContent=(current.profile.source.author||current.profile.source.repository.replace('https://github.com/',''))+' · '+current.profile.source.version;$('nativeLicense').textContent=current.profile.source.license;
  $('references').disabled=!current.manifest.reference_leaves.length;$('installationOptions').hidden=!current.profile.configurations;const requestedInstallation=new URLSearchParams(location.search).get('configuration');await setInstallation('stock');
  for(const id of ['headInstallation','zInstallation','probeInstallation'])$(id).onchange=()=>workspaceTask(async()=>{animation=null;const selection={head:$('headInstallation').value,z:$('zInstallation').value,probe:$('probeInstallation').value};try{await setInstallation(current.profile.mod_controls?installationFor(current.profile,selection,{changed:id==='headInstallation'?'head':id==='zInstallation'?'z':'probe'}):$('headInstallation').value);$('configurationStatus').textContent=''}catch(e){describe();$('configurationStatus').textContent=e.message}});
  const movable=communityMotionEnabled(current.profile);$('motionSettings').hidden=!movable;document.body.dataset.motionEnabled=String(movable);
  for(const k of axisKeys){[$(k).min,$(k).max]=ranges()[k];$(k).disabled=!movable;$(k).oninput=()=>{animation=null;const[lo,hi]=ranges()[k];setAxes({...state.axes,[k]:Math.max(lo,Math.min(hi,Number($(k).value)))})}}
  $('motionPause').onclick=()=>{animation=null};$('motionPlay').onclick=()=>{const to=Object.fromEntries(axisKeys.map(k=>[k,current.profile.axes[k][1]]));animation={start:performance.now(),from:{...state.axes},to};render()};$('resetPose').onclick=()=>{animation=null;setAxes(zeroAxes());view()};
  for(const k of ['base','accent','frame']){$(k).value=state.palette[k];$(k).oninput=()=>{state.palette[k]=$(k).value;setPalette(state.palette)}}
  $('resetPalette').onclick=()=>{state.palette={...current.profile.palette_defaults};for(const k of ['base','accent','frame'])$(k).value=state.palette[k];setPalette(state.palette)};
  $('references').onchange=()=>{state.references=$('references').checked;current.adapter.setReferences(state.references);evaOptions?.update(state.axes);render()};$('gridVisible').onchange=()=>{state.grid=$('gridVisible').checked;grid.visible=state.grid;render()};
  $('saveConfiguration').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(capture(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=machine+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent=t('構成JSONを保存しました。')};
  $('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=()=>workspaceTask(async()=>{const file=$('configurationFile').files?.[0];$('configurationFile').value='';if(!file)return;try{if(file.size>64*1024)throw Error('Configuration exceeds 64 KB');await restore(JSON.parse(await file.text()));$('configurationStatus').textContent=t('構成JSONを復元しました。')}catch(e){$('configurationStatus').textContent=e.message}});
  for(const id of ['resetPose','base','accent','frame','resetPalette','gridVisible','saveConfiguration','loadConfiguration'])$(id).disabled=false;
  setupGcodePanel({container:document.querySelector('aside'),profile:current.profile,adapter:current.adapter,scene,render,drawPath:false,coordinateNote:movable?displacementCoordinateNote:unavailableCoordinateNote,
   getFirmwareSettings:()=>displacementGcodeSettings(current.profile,current.adapter.getAxes(),ranges()),
   getPose:()=>movable?['x','y','z'].map(a=>current.adapter.getAxes()[a]):[0,0,0],getLimits:()=>displacementGcodeSettings(current.profile,current.adapter.getAxes(),ranges()).limits,
   getContext:()=>({machine,configuration:state.configuration,asset_identity:current.replay_asset_identity,secondary:Object.fromEntries(Object.entries(current.adapter.getAxes()).filter(([a])=>!['x','y','z'].includes(a)))}),
   beforePlayback:()=>{animation=null},setPose:xyz=>{if(movable)setAxes({...current.adapter.getAxes(),...Object.fromEntries(['x','y','z'].map((a,i)=>[a,xyz[i]]))})}});
  $('motionPlay').disabled=$('motionPause').disabled=!movable;setPalette(state.palette);setAxes(state.axes);view();resize();await setupPublicInfo({includeDownloads:false});if(scope.disposed)return;setupRenderExport({three:THREE,renderer,scene,camera,controls,name:machine});
  if(requestedInstallation&&requestedInstallation!==state.configuration&&requestedInstallation!=='stock'){
   try{if(await setInstallation(requestedInstallation))view()}
   catch(e){describe();$('configurationStatus').textContent=e.message}
  }
  if(scope.disposed)return;document.body.dataset.ready='true';document.body.dataset.parts=String(current.manifest.native_leaf_count);$('openRender').disabled=false;statusText();
 }catch(e){if(!scope.disposed){document.body.dataset.ready='false';$('openRender').disabled=true;statusText('モデルの読込に失敗しました。機種を選び直してください。');document.body.dataset.error=e.message;}throw e}
}
