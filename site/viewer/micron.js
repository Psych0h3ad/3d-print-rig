import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=ratrig-stock-1';
import {createMicronAdapter} from './micron-adapter.mjs?v=ratrig-stock-1';
import {mountAssemblyDownload} from './assembly-downloads.mjs?v=ratrig-stock-1';
import {setupMachineNavigation} from './machines.js?v=ratrig-stock-1';
import {setupGrid} from './grid-control.js?v=ratrig-stock-1';
import {setupRenderExport} from './render-export.js?v=ratrig-stock-1';
import {setupPublicInfo} from './public-info.js?v=ratrig-stock-1';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=ratrig-stock-1';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=ratrig-stock-1';
const $=s=>document.querySelector(s),wanted=new URLSearchParams(location.search).get('machine'),id=['micron_r1_120','micron_plus_r1_180'].includes(wanted)?wanted:'micron_r1_120';
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=new OrbitControls(camera,renderer.domElement);scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
let adapter,profile,pending=false;
function render(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new ResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.13,0);camera.position.set(...({iso:[.65,.55,.85],front:[0,.15,1.1],top:[0,1.2,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3();for(const [key,node]of adapter.nodes)if(adapter.records.get(key).group==='Micron_Toolhead')box.expandByObject(node);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';$('#motionStatus').textContent='ベッド固定 · Zガントリー・YZビーム・XYZヘッド';document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.atReference&&$('#belts').checked);document.body.dataset.beltsVisible=String(pose.belts.visible);document.body.dataset.xyBeltCount=String(pose.belts.xy_belts);render()}
try{
 const root='../machines/'+id+'/',json=async name=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');return r.json()};
 const [manifest,p,g,downloads]=await Promise.all([json('assembly_manifest.json'),json('machine_profile.json'),loadModel(new GLTFLoader(),root+'model.glb'),fetch('../MICRON_DOWNLOADS.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('STEPカタログの読込に失敗');return r.json()})]);
 profile=p;scene.add(g.scene);adapter=createMicronAdapter(g.scene,manifest,profile);const originals=new Map(),protectedMaterials=[];
 for(const [key,node]of adapter.nodes)node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(material,material.color.clone());if(!adapter.records.get(key).appearance_role)protectedMaterials.push(material);else if(['base','accent'].includes(adapter.records.get(key).appearance_role)){material.metalness=0;material.roughness=.72;}if(material.transparent)material.depthWrite=false}});
 grid.position.y=Math.min(...manifest.parts.map(p=>p.bounds_mm[0][2]))*.001-.002;
 $('#machineTitle').textContent=profile.size_mm===120?'Micron / 120':'Micron Plus / 180';$('#structureLabel').textContent=profile.source_revision;$('#badge').textContent=$('#machineTitle').textContent+' · '+manifest.parts.length.toLocaleString()+' PARTS';
 const limits=profile.display_limits_mm;$('#clearanceStatus').textContent=`表示範囲 X ${limits.X.join('–')} / Y ${limits.Y.join('–')} / Z ${limits.Z.join('–')} mm。レール内の表示上限です。干渉なし可動域ではありません。`;
 for(const [i,a]of ['x','y','z'].entries()){$('#'+a).min=limits[a.toUpperCase()][0];$('#'+a).max=limits[a.toUpperCase()][1];$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose}
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose()};$('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};$('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);render()};
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);let palette={base:null,accent:null,frame:null};try{const saved=JSON.parse(localStorage.getItem(profile.appearance.storage_key)||'null');if(saved?.machine_id===id)for(const role of Object.keys(palette))if(valid(saved.colors?.[role]))palette[role]=saved.colors[role]}catch{}
 function applyPalette(){for(const [m,c]of originals)m.color.copy(c);adapter.setPalette(Object.fromEntries(Object.keys(palette).map(role=>[role,palette[role]||profile.appearance.palette_defaults[role]])));for(const role of Object.keys(palette)){const v=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=v;$('#'+role+'Hex').value=v;$('#'+role+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame===profile.appearance.palette_defaults.frame?'black':'custom';document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);$('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色':'標準色';render()}
 function save(){try{localStorage.setItem(profile.appearance.storage_key,JSON.stringify({machine_id:id,colors:palette}))}catch{}}
 for(const role of Object.keys(palette)){$('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();save()};$('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v;applyPalette();save()}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=()=>{if($('#frameFinish').value==='custom')return;palette.frame=$('#frameFinish').value==='silver'?'#b9bec4':profile.appearance.palette_defaults.frame;applyPalette();save()};$('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();save()};applyPalette();
 setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 mountAssemblyDownload($('#assemblyDownload'),id,downloads);setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}
