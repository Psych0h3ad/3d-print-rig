import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {loadCustomVoron} from './custom-voron-loader.mjs?v=9947051632cb50e79d40';
import {createV24Adapter} from './v24_matrix_adapter.mjs?v=94a4b83956040d64774a';
import {createTridentMotion} from './trident-motion.mjs';
import {setupMachineNavigation} from './machines.js?v=d6045b8af89b3984adcb';
import {appearanceRole} from './appearance-role.mjs?v=a2d85521f7f516860221';
import {createCustomTube} from './custom-voron-tube.mjs?v=06995433c84962abb661';
import {validateCustomState} from './custom-voron-state.mjs?v=4b6132fe80a74098a8ba';
import {workspaceFrame,workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {setupGrid} from './grid-control.js';
import {setupRenderExport} from './render-export.js';
import {setupPublicInfo} from './public-info.js?v=0b0f91d7a82d25acbb87';
import {setupGcodePanel} from './gcode-panel.js';
import {programPoint,programPathOffset} from './gcode-timeline.mjs';
import {formatMessage,translate} from './i18n.mjs?v=7f9863915024ba61771b';
export async function mount(scope){
 const $=id=>document.getElementById(id),id=new URL(location.href).searchParams.get('machine')||'voron_v24_500_custom';setupMachineNavigation(id);setupPublicInfo({machineId:id});
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.setClearColor('#edf1f4');$('stage').append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.001,10),controls=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
 for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
 let pending=false,adapter,tube,current,profile,manifest,program,palette={base:'#24272c',accent:'#e32636',frame:'#25282d'};const materials=[],nodes=new Map();
 function render(){if(pending||scope.disposed)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
 setupGrid(scene,render).position.y=-.096;
 function resize(){const b=$('stage').getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,controls,b.width,b.height);render()}
 controls.addEventListener('change',render);new WorkspaceResizeObserver(resize).observe($('stage'));
 const t=value=>translate(value,document.documentElement.lang);
 function applyPose(){if(!adapter)return;const xyz=['x','y','z'].map(a=>Number($(a).value)),flexible=$('belts').checked;adapter.setFlexibleVisible?.(flexible);current=adapter.setPose({x:xyz[0],y:xyz[1],z:xyz[2]},{flexibleVisible:flexible});tube?.update(xyz[0]-profile.display_reference_xyz_mm[0],xyz[1]-profile.display_reference_xyz_mm[1],flexible);for(const[i,a]of ['x','y','z'].entries())$(a+'v').textContent=xyz[i].toFixed(2)+' mm';document.body.dataset.pose=JSON.stringify(xyz);render()}
 function applyPalette(){for(const r of materials){r.material.color.copy(r.original);if(palette[r.role]){r.material.color.set(palette[r.role]);if(['base','accent'].includes(r.role)){r.material.metalness=0;r.material.roughness=.72}}}for(const r of ['base','accent','frame']){$(r).value=palette[r];$(r+'Hex').value=palette[r]}$('frameFinish').value=palette.frame==='#b9bec4'?'silver':palette.frame==='#25282d'?'black':'custom';render()}
 const storage='3d-print-rig-custom-voron-'+id,validColor=v=>/^#[a-f0-9]{6}$/i.test(v);
 function state(){return {schema:'custom-voron-1',machine_id:id,axes:['x','y','z'].map(a=>Number($(a).value)),colors:{...palette},panels:$('enclosure').checked,belts:$('belts').checked,grid:$('gridVisible').checked}}
 function validate(s){try{return validateCustomState(s,id,profile)}catch{throw Error(t('構成JSONの項目が不足しています。'))}}
 function restore(s){validate(s);palette={...s.colors};for(const[i,a]of ['x','y','z'].entries())$(a).value=s.axes[i];$('enclosure').checked=s.panels;$('belts').checked=s.belts;$('gridVisible').checked=s.grid;$('enclosure').onchange();$('gridVisible').dispatchEvent(new Event('change'));applyPalette();applyPose()}
 try{
  const loaded=await loadCustomVoron(id);({profile,manifest}=loaded);scene.add(loaded.root);const rows=new Map(manifest.parts.map(p=>[p.key,p])),trident=profile.kinematics==='trident';
  loaded.root.traverse(mesh=>{const key=mesh.userData?.part_key;if(rows.has(key)&&mesh.parent?.userData?.part_key!==key)nodes.set(key,mesh);if(!mesh.isMesh)return;const row=rows.get(key);if(!row)throw Error('Unregistered custom VORON part');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){if(material.transparent)material.depthWrite=false;materials.push({material,original:material.color.clone(),role:appearanceRole(row)})}});
  if(trident){adapter=createTridentMotion(profile);adapter.register(loaded.root,manifest)}else adapter=createV24Adapter(loaded.root,manifest,profile);
  tube=createCustomTube(loaded.root,manifest);if(tube)scope.resource(tube);
  $('machineTitle').textContent=(trident?'Trident':'V2.4')+' / '+profile.size_mm;$('dimensions').textContent=profile.size_mm+' × '+profile.size_mm+' × '+profile.display_limits_mm.Z[1]+' mm';$('badge').textContent=$('machineTitle').textContent+' · '+manifest.parts.length.toLocaleString()+' PARTS';$('motionHelp').textContent=t(trident?'ベッド・サーミスタ・3Zガイドが下降に追従':'ベッド固定 · X/Yヘッドと4Zガイド・ガントリーがZ＋へ追従');
  for(const[i,a]of ['x','y','z'].entries()){const limits=profile.display_limits_mm[a.toUpperCase()];$(a).min=limits[0];$(a).max=limits[1];$(a).value=profile.display_reference_xyz_mm[i];$(a).disabled=false;$(a).oninput=()=>{program?.invalidate();applyPose()}}
  $('reset').disabled=false;$('reset').onclick=()=>{program?.invalidate();for(const[i,a]of ['x','y','z'].entries())$(a).value=profile.display_reference_xyz_mm[i];applyPose()};
  $('enclosure').onchange=()=>{for(const[key,node]of nodes){const row=rows.get(key);if(row.group==='V24_Enclosure'||row.group==='Panels')node.visible=$('enclosure').checked}render()};$('belts').onchange=()=>{adapter.setFlexibleVisible?.($('belts').checked);applyPose()};
  for(const r of ['base','accent','frame']){$(r).disabled=false;$(r+'Hex').disabled=false;$(r).oninput=()=>{palette[r]=$(r).value;applyPalette()};$(r+'Hex').oninput=()=>{if(validColor($(r+'Hex').value)){palette[r]=$(r+'Hex').value;applyPalette()}}}
  $('frameFinish').disabled=false;$('frameFinish').onchange=()=>{if($('frameFinish').value==='custom')return;palette.frame=$('frameFinish').value==='silver'?'#b9bec4':'#25282d';applyPalette()};$('resetPalette').disabled=false;$('resetPalette').onclick=()=>{palette={base:'#24272c',accent:'#e32636',frame:'#25282d'};applyPalette()};
  $('saveConfiguration').disabled=false;$('loadConfiguration').disabled=false;$('saveConfiguration').onclick=()=>{const json=JSON.stringify(state(),null,2),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);localStorage.setItem(storage,json);$('configurationStatus').textContent=t('構成JSONを保存しました。')};$('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=()=>workspaceTask(async()=>{try{const file=$('configurationFile').files[0];if(file.size>100000)throw Error('Invalid file');restore(JSON.parse(await file.text()));$('configurationStatus').textContent=t('構成JSONを復元しました。')}catch(e){$('configurationStatus').textContent=e.message}});
  function view(kind){const box=new THREE.Box3();for(const[key,node]of nodes)if(node.visible&&(kind!=='head'||rows.get(key).group.includes('Toolhead')))box.expandByObject(node);const center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2;camera.up.set(0,kind==='top'?0:1,kind==='top'?-1:0);controls.target.copy(center);const direction=new THREE.Vector3(...(kind==='top'?[0,1,0]:kind==='front'?[0,0,1]:[.65,.5,1])).normalize();camera.position.copy(center).addScaledVector(direction,radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.06);frameResponsiveView(camera,controls);render()}
  for(const[id,kind]of [['iso','iso'],['front','front'],['top','top'],['focusHead','head']])$(id).onclick=()=>view(kind);
  applyPose();applyPalette();view('iso');resize();setupSceneDisplay(scene,renderer,camera,scope,THREE);
  const frame=()=>({nozzle_mm:profile.nozzle_tip_mm||[0,-36.1,309.0136+(profile.frame_outer_mm[2]-500)],reference_xyz_mm:profile.display_reference_xyz_mm,moving_bed_z:trident});program=setupGcodePanel({container:document.querySelector('aside'),scene,render,getPose:()=>['x','y','z'].map(a=>Number($(a).value)),getLimits:()=>profile.display_limits_mm,toNozzle:xyz=>programPoint(frame(),xyz),pathOffset:xyz=>programPathOffset(frame(),xyz),getContext:()=>id,setPose:xyz=>{for(const[i,a]of ['x','y','z'].entries())$(a).value=xyz[i];applyPose()}});
  setupRenderExport({renderer,scene,camera,controls,name:id,afterRender:render});$('status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);
 }catch(e){$('status').textContent=t('読込エラー: ')+e.message;document.body.dataset.error=e.message;console.error(e)}
}
