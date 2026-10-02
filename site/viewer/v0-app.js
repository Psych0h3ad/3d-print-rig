import {v0ModCategories,componentCategory} from './v0-mod-library.mjs?v=v0-mod-selection-1';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=public-v24';
import {appearanceRole} from './appearance-role.mjs?v=public-v24';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=public-v24';
import {createV0Adapter} from './v0_adapter.mjs?v=simulation-1';
import {setupMachineNavigation} from './machines.js?v=monolith-machine-1';
import {setupGrid} from './grid-control.js?v=public-v24';
import {setupRenderExport} from './render-export.js?v=public-v24';
import {setupPublicInfo} from './public-info.js?v=public-v24';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=simulation-1';
import {programPoint,programPathOffset} from './gcode-timeline.mjs?v=simulation-1';
const $=s=>document.querySelector(s),ids=['voron_v02r1_120','voron_v02_120'];
const wanted=new URLSearchParams(location.search).get('machine'),id=ids.includes(wanted)?wanted:ids[0];
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=new OrbitControls(camera,renderer.domElement);scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
let adapter,profile,program,pending=false;
function render(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);grid.position.y=-.026;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new ResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.16,0);camera.position.set(...({iso:[.53,.45,.7],front:[0,.17,.9],top:[0,1,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3();for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)box.expandByObject(node);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';
 program?.updatePath(adapter.getPose());
 $('#motionStatus').textContent=pose.within_sampled_clearance_envelope?'X/YヘッドとZベッドを配置中':'格子点で確認した範囲の外です。公称端の接触を確認する姿勢です。';
 $('#flexibleStatus').textContent=!pose.belts_visible?'ベルト・配線を非表示':pose.chain_visible?'ベルト経路はXYに追従 · Z配線は基準姿勢':'ベルト経路はXYに追従 · Z配線は変形未対応のため非表示';
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.belts_visible);document.body.dataset.chainVisible=String(pose.chain_visible);render();}
try{
 const root='../machines/'+id+'/',json=async name=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');return r.json()};
 const [manifest,p,g,library]=await Promise.all([json('assembly_manifest.json'),json('machine_profile.json'),loadModel(new GLTFLoader(),root+'model.glb'),fetch('../COMPONENT_LIBRARY.json?v=public-v24',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Modカタログ');return r.json()})]);
 profile=p;scene.add(g.scene);adapter=createV0Adapter(g.scene,manifest,profile);const originals=new Map(),protectedMaterials=[];
 for(const [key,node] of adapter.nodes)node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(material,material.color.clone());if(!appearanceRole(adapter.records.get(key)))protectedMaterials.push(material);if(material.transparent)material.depthWrite=false}});
 $('#machineTitle').textContent=id==='voron_v02r1_120'?'V0.2r1 / 120':'V0.2 / 120';$('#badge').textContent=$('#machineTitle').textContent+' · '+manifest.parts.length.toLocaleString()+' PARTS';
 const limits=profile.sampled_clearance_limits_mm;$('#clearanceStatus').textContent=`CAD格子点の確認範囲 X 0–${limits.X[1]} / Y 0–${limits.Y[1]} / Z 0–${limits.Z[1]} mm`;
 for(const [i,a] of ['x','y','z'].entries()){$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose}
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose()};$('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};$('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);render()};
 const mods=library.items.filter(m=>m.kind==='mod'&&m.id.startsWith('v0mod_')),modHistory=new Map();
 const option=(id,label)=>{const o=document.createElement('option');o.value=id;o.textContent=label;return o};
 for(const category of v0ModCategories.filter(c=>mods.some(m=>componentCategory(m)===c.id)))$('#modCategory').append(option(category.id,category.label));
 function updateModLink(){const mod=mods.find(m=>m.id===$('#modLibrary').value);modHistory.set($('#modCategory').value,mod.id);$('#modLink').href='./components.html?component='+encodeURIComponent(mod.id);$('#modSelection').textContent=mod.label;$('#modLink').textContent='選んだModの部品・種類を開く ↗'}
 function updateModOptions(){const selected=modHistory.get($('#modCategory').value),items=mods.filter(m=>componentCategory(m)===$('#modCategory').value);$('#modLibrary').replaceChildren(...items.map(m=>option(m.id,m.label)));$('#modLibrary').value=selected||items[0].id;updateModLink()}
 $('#modCategory').onchange=updateModOptions;$('#modLibrary').onchange=updateModLink;$('#modCategory').disabled=false;$('#modLibrary').disabled=false;updateModOptions();
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);let palette={base:null,accent:null,frame:null};try{const saved=JSON.parse(localStorage.getItem(profile.appearance.storage_key)||'null');if(saved?.machine_id===id)for(const role of Object.keys(palette))if(valid(saved.colors?.[role]))palette[role]=saved.colors[role]}catch{}
 function applyPalette(){for(const [m,c] of originals)m.color.copy(c);adapter.setPalette(palette);for(const role of Object.keys(palette)){const v=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=v;$('#'+role+'Hex').value=v;$('#'+role+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame==='#0e0f11'?'black':'custom';document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);$('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色':'標準CADの配色';render()}
 function save(){try{localStorage.setItem(profile.appearance.storage_key,JSON.stringify({machine_id:id,colors:palette}))}catch{}}
 for(const role of Object.keys(palette)){$('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();save()};$('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v;applyPalette();save()}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=()=>{if($('#frameFinish').value==='custom')return;palette.frame=$('#frameFinish').value==='silver'?'#b9bec4':'#0e0f11';applyPalette();save()};$('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();save()};applyPalette();
 const programFrame={nozzle_mm:profile.nozzle_tip_mm,reference_xyz_mm:profile.display_reference_xyz_mm,moving_bed_z:true};
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,toNozzle:xyz=>programPoint(programFrame,xyz),pathOffset:xyz=>programPathOffset(programFrame,xyz),setPose:xyz=>{for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}
