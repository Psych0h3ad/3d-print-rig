import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createV24Adapter} from './v24_adapter.mjs';
import {setupMachineNavigation} from './machines.js?v=machines-v1';
import {setupRenderExport} from './render-export.js?v=public-v5';
import {setupPublicInfo} from './public-info.js?v=public-v5';
setupMachineNavigation('siboor_v24_350');
setupPublicInfo();
const $=s=>document.querySelector(s),stage=$('#stage'),status=$('#status');
const assetRoot='../machines/siboor_v24_350/';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));stage.append(renderer.domElement);
renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.005,10);camera.position.set(.98,.83,1.4);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,.22,0);orbit.enableDamping=false;
scene.add(new THREE.HemisphereLight('#ffffff','#8996a0',2));
for(const [position,power] of [[[.6,1,-.8],3],[[-.8,.5,.3],2],[[.2,.8,.7],2]]){const l=new THREE.DirectionalLight('#ffffff',power);l.position.set(...position);scene.add(l)}
const grid=new THREE.GridHelper(1.2,24,'#adbcc6','#d2dce2');grid.position.y=-.096;scene.add(grid);
let adapter,profile,pose,renderPending=false,frames=0;
function render(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;renderer.render(scene,camera);document.body.dataset.renderedFrames=++frames})}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();render()}
orbit.addEventListener('change',render);new ResizeObserver(resize).observe(stage);
for(const [id,pos] of [['iso',[.98,.83,1.4]],['front',[0,.24,1.65]],['top',[.001,1.8,.001]]])$('#'+id).onclick=()=>{camera.position.set(...pos);orbit.target.set(0,.22,0);orbit.update();render()};
$('#focusHead').onclick=()=>{if(!adapter)return;const box=new THREE.Box3();for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)box.expandByObject(node);if(box.isEmpty())return;box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.15,.08,.3));orbit.update();document.body.dataset.focusTarget=JSON.stringify(orbit.target.toArray());render()};
function applyPose(){if(!adapter)return;
 pose=adapter.setPose({x:Number($('#x').value),y:Number($('#y').value),z:Number($('#z').value)});
 for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(1)+' mm';
 const p=adapter.getSummary();document.body.dataset.ready='true';document.body.dataset.parts=p.part_count;
 document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.fixedBed=JSON.stringify(p.fixed_bed_keys.map(k=>adapter.nodes.get(k).position.toArray()));
 document.body.dataset.zGuidePositions=JSON.stringify(p.z_guide_block_keys.map(k=>adapter.nodes.get(k).position.toArray()));
 document.body.dataset.flexibleVisible=String(pose.atReference&&$('#belts').checked);
 $('#motionStatus').textContent='ベッド固定 · 4ZガイドとガントリーがZ＋へ追従';render();
}
try{
 const getJSON=async name=>{const r=await fetch(assetRoot+name);if(!r.ok)throw Error(name);return r.json()};
 const [manifest,machine,gltf]=await Promise.all([getJSON('assembly_manifest.json'),getJSON('machine_profile.json'),new GLTFLoader().loadAsync(assetRoot+'model.glb')]);
 profile=machine;scene.add(gltf.scene);adapter=createV24Adapter(gltf.scene,manifest,profile);
 const protectedMaterials=[],originals=new Map();
 for(const [key,node] of adapter.nodes){node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(m,m.color.clone());if(!adapter.records.get(key).appearance_role)protectedMaterials.push(m);if(m.transparent)m.depthWrite=false}
 });}
 adapter.setEnclosureVisible($('#enclosure').checked);
 for(const [i,a] of ['x','y','z'].entries()){
  const limits=profile.display_limits_mm[a.toUpperCase()];$('#'+a).min=limits[0];$('#'+a).max=limits[1];$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose;
 }
 $('#reset').disabled=false;$('#reset').onclick=()=>{for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose()};
 $('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);document.body.dataset.panelsVisible=String($('#enclosure').checked);render()};
 $('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),storageKey=profile.appearance.storage_key;
 let palette={base:null,accent:null,frame:null};
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.machine_id===profile.machine_id)for(const r of ['base','accent','frame'])if(valid(saved.colors?.[r]))palette[r]=saved.colors[r]}catch{}
 function applyPalette(){
  for(const [material,color] of originals)material.color.copy(color);
  adapter.setPalette(palette);
  for(const role of ['base','accent','frame']){const value=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=value;$('#'+role+'Hex').value=value;$('#'+role+'Hex').removeAttribute('aria-invalid');document.body.dataset[role+'Color']=palette[role]||'original'}
  document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);
  $('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色を保存済み':'標準CADの配色';render();
  $('#frameFinish').disabled=false;$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame==='#25282d'?'black':'custom';
 }
 function savePalette(){try{localStorage.setItem(storageKey,JSON.stringify({machine_id:profile.machine_id,colors:palette}))}catch{$('#paletteStatus').textContent='この画面に配色を適用中'}}
 for(const role of ['base','accent','frame']){
  $('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;
  $('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();savePalette()};
  $('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v.toLowerCase();applyPalette();savePalette()};
 }
 $('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();savePalette()};applyPalette();
 $('#frameFinish').onchange=e=>{if(e.target.value==='custom')return;palette.frame=e.target.value==='silver'?'#b9bec4':'#25282d';applyPalette();savePalette()};
 setupRenderExport({renderer,scene,camera,afterRender:render,name:'VORON_V24_R2_350_Reference'});
 document.body.dataset.geometryRevision=profile.geometry_revision;document.body.dataset.panelsVisible=String($('#enclosure').checked);
 document.body.dataset.endstopStatus=profile.endstop_registration_or_pending.status;
 document.body.dataset.qglStatus=profile.qgl.independent_corner_tilt;
 document.body.dataset.xyBeltWidthMm=profile.xy_belt_width_mm;document.body.dataset.zBeltWidthMm=profile.z_belt_width_mm;
 $('#beltWidths').textContent=`XYベルト ${profile.xy_belt_width_mm} mm ／ Zベルト ${profile.z_belt_width_mm} mm`;
 const url=new URL(location.href);url.searchParams.set('configuration',profile.available_configurations[0].id);history.replaceState(null,'',url);
 status.textContent=manifest.parts.length.toLocaleString()+' 部品 · 固定ベッド / 4Zガントリー';applyPose();resize();
}catch(e){status.textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}
