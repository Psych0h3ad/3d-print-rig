import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=5c6f4dcd051bb1336e43';
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=ce28c0df722a83db6bb3';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {e3ngSelection,e3ngPartVisible,e3ngURL} from './e3ng-model.mjs?v=workspace-belts-1';
export async function mount(scope){
const $=s=>document.querySelector(s),stage=$('#stage'),scene=scope.scene(new THREE.Scene());scene.background=new THREE.Color('#edf1f5');
const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,1,.0001,10),controls=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#687781',2.4));
for(const p of [[.8,1,.7],[-.5,.3,-.6]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...p);scene.add(light)}
const grid=new THREE.GridHelper(1.2,24,'#8b9ca8','#c9d2d8');grid.position.y=-.08;grid.visible=false;scene.add(grid);
const fields={view:'e3View',board:'e3Board',extruder:'e3Extruder',arm:'e3Arm',gantry:'e3Gantry',tools:'e3Tools',nudge:'e3Nudge',wiper:'e3Wiper',routing:'e3Routing'};
let selection,meshes=[],box=new THREE.Box3(),orientation='iso',dirty=true,ready=false;
try{selection=e3ngSelection(Object.fromEntries(new URL(location.href).searchParams))}catch{selection=e3ngSelection()}
for(const [key,id] of Object.entries(fields)){if($('#'+id).type==='checkbox')$('#'+id).checked=selection[key];else $('#'+id).value=String(selection[key]);$('#'+id).disabled=true}
function fit({preserveDirection=false}={}){if(box.isEmpty())return;const direction=preserveDirection?camera.position.clone().sub(controls.target).normalize():new THREE.Vector3(...({iso:[1,.7,1.2],front:[0,0,1],back:[0,0,-1],side:[1,0,0]}[orientation])).normalize();const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),fov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(fov/2)*camera.aspect),distance=size.length()/2/Math.sin(Math.min(fov,hfov)/2)*1.08;controls.target.copy(center);camera.up.set(0,1,0);camera.position.copy(center).addScaledVector(direction,distance);controls.minDistance=.02;controls.maxDistance=3;controls.update();dirty=true}
function update({refit=false}={}){
 if(!ready)return;box.makeEmpty();let count=0;
 for(const {mesh,row} of meshes){mesh.visible=e3ngPartVisible(row,selection);const role=row.appearance_role;if(['base','accent','frame'].includes(role))mesh.material.color.set($('#'+role).value);if(mesh.visible){count++;mesh.updateMatrixWorld(true);box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))}}
 grid.visible=$('#grid').checked;grid.position.y=box.min.y-.012;
 $('#e3Status').textContent=`${count.toLocaleString()} parts · E3NG / TZ-V6 3.0 · ${selection.tools} tools${selection.tools===6?' · 6ツールは推奨構成外':''}`;
 $('#e3Status').classList.toggle('notice',selection.tools===6);
 const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);$('#e3Dimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
 replaceWorkspaceURL(null,'',e3ngURL(location.href,selection));document.body.dataset.e3ngSelection=JSON.stringify(selection);document.body.dataset.visibleParts=String(count);dirty=true;if(refit)fit();
}
for(const [key,id] of Object.entries(fields))$('#'+id).onchange=()=>{const element=$('#'+id),value=element.type==='checkbox'?element.checked:element.value;selection=e3ngSelection({...selection,[key]:value});update({refit:key==='view'})};
for(const id of ['base','accent','frame','grid'])$('#'+id).oninput=()=>update();
for(const id of ['iso','front','back','side'])$('#'+id).onclick=()=>{orientation=id;fit()};$('#fit').onclick=fit;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(Math.max(b.width,1),Math.max(b.height,1));camera.aspect=Math.max(b.width,1)/Math.max(b.height,1);camera.updateProjectionMatrix();if(ready)fit({preserveDirection:true});dirty=true}new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_E3NG',afterRender:()=>{dirty=true}});
try{
 const [meta,gltf]=await Promise.all([fetch('../machines/e3ng_toolchanger/assembly_manifest.json?v=e3ng-48').then(r=>{if(!r.ok)throw Error('E3NG部品表を取得できません');return r.json()}),loadModel(new GLTFLoader(),'../machines/e3ng_toolchanger/model.glb')]);
 const lookup=new Map(meta.parts.map(p=>[p.key,p]));gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const row=lookup.get(mesh.userData.part_key||mesh.name);if(!row)throw Error('E3NG部品情報が不足しています');mesh.material=mesh.material.clone();mesh.material.side=THREE.DoubleSide;mesh.geometry.computeBoundingBox();meshes.push({mesh,row})});if(meshes.length!==meta.parts.length)throw Error('E3NGの部品数が一致しません');scene.add(gltf.scene);ready=true;for(const id of Object.values(fields))$('#'+id).disabled=false;update({refit:true});$('#loading').hidden=true;document.body.dataset.ready='true';resize();
}catch(error){$('#loading').textContent=error.message;$('#e3Status').textContent='読み込みに失敗しました';document.body.dataset.ready='error';console.error(error)}

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
