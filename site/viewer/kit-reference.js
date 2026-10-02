import {appearanceRole} from './appearance-role.mjs?v=public-v15';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=public-v15';
import {setupMachineNavigation} from './machines.js?v=public-v15';
import {setupGrid} from './grid-control.js?v=public-v15';
import {setupRenderExport} from './render-export.js?v=public-v15';
import {setupPublicInfo} from './public-info.js?v=public-v15';
const $=s=>document.querySelector(s),id='fysetc_v24_250_pro',stage=$('#stage');
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=new OrbitControls(camera,renderer.domElement);scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const l=new THREE.DirectionalLight('#ffffff',2);l.position.set(...pos);scene.add(l)}
let pending=false,box;
function render(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);
function view(name){if(!box)return;const center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2,distance=radius/Math.sin(Math.min(THREE.MathUtils.degToRad(38),2*Math.atan(Math.tan(THREE.MathUtils.degToRad(19))*camera.aspect))/2)*1.12;orbit.target.copy(center);camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);camera.position.copy(center).add(new THREE.Vector3(...({iso:[1,.65,1.4],front:[0,0,1],top:[0,1,0]}[name])).normalize().multiplyScalar(distance));orbit.update();render()}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();render()}
new ResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);for(const n of ['iso','front','top'])$('#'+n).onclick=()=>view(n);
try{
 const root='../machines/'+id+'/',[meta,g]=await Promise.all([fetch(root+'assembly_manifest.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('部品表');return r.json()}),loadModel(new GLTFLoader(),root+'model.glb')]);
 const lookup=new Map(meta.parts.map(p=>[p.key,p])),entries=[];scene.add(g.scene);
 g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const p=lookup.get(mesh.userData.part_key);if(!p)throw Error('部品対応エラー');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}entries.push({mesh,p,mats,originals:mats.map(m=>m.color.clone())})});
 box=new THREE.Box3().setFromObject(g.scene);grid.position.y=box.min.y-.002;resize();view('iso');
 const palette={};function appearance(){for(const e of entries)for(let i=0;i<e.mats.length;i++){const c=palette[appearanceRole(e.p)];if(c)e.mats[i].color.set(c);else e.mats[i].color.copy(e.originals[i])}render()}
 for(const role of ['base','accent','frame'])$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;appearance()};$('#resetPalette').onclick=()=>{for(const role of Object.keys(palette))delete palette[role];appearance()};
 $('#enclosure').onchange=()=>{for(const e of entries)if(e.p.component==='enclosure')e.mesh.visible=$('#enclosure').checked;render()};$('#parts').textContent=meta.parts.length.toLocaleString()+' 部品 · 250 mm基準';$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(meta.parts.length);setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message}
