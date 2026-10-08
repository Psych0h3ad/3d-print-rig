import {displacementGcodeSettings,displacementCoordinateNote} from './gcode-machine-bindings.mjs?v=460777c3fc4d1a74bf27';
import {setupGcodePanel} from './gcode-panel.js?v=f471190665709ba23159';
import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceFrame,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=6b7b8efda77bfc3ce74d';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {loadKitReference} from './kit-reference-loader.mjs?v=e018cf8fc3c93c4140dd';
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {setupGrid} from './grid-control.js?v=workspace-belts-1';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {setupPublicInfo} from './public-info.js?v=c9e1dede0c4a39b1a597';
import {createCommunityAdapter} from './community-adapter.mjs?v=f8373d55283539bd5074';
import {setupNativeMotionControls} from './native-motion-controls.mjs?v=854f8a0b0eab506d014f';
export async function mount(scope){
const $=s=>document.querySelector(s),id='fysetc_v24_250_pro',stage=$('#stage');
setupMachineNavigation(id);setupPublicInfo({includeDownloads:false});
const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const l=new THREE.DirectionalLight('#ffffff',2);l.position.set(...pos);scene.add(l)}
let pending=false,box;
function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);
function view(name){if(!box)return;const center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2,distance=radius/Math.sin(Math.min(THREE.MathUtils.degToRad(38),2*Math.atan(Math.tan(THREE.MathUtils.degToRad(19))*camera.aspect))/2)*1.12;orbit.target.copy(center);camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);camera.position.copy(center).add(new THREE.Vector3(...({iso:[1,.65,1.4],front:[0,0,1],top:[0,1,0]}[name])).normalize().multiplyScalar(distance));orbit.update();render()}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new WorkspaceResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);for(const n of ['iso','front','top'])$('#'+n).onclick=()=>view(n);
try{
 const {manifest:meta,profile,g,replay_asset_identity}=await loadKitReference(id);
 const lookup=new Map(meta.parts.map(p=>[p.key,p])),entries=[];scene.add(g.scene);
 g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const p=lookup.get(mesh.userData.part_key);if(!p)throw Error('部品対応エラー');mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}entries.push({mesh,p,mats,originals:mats.map(m=>m.color.clone())})});
 const adapter=createCommunityAdapter(g.scene,meta,profile);
 // The adapter owns cloned materials; color controls must use these current instances.
 for(const e of entries)e.mats=[].concat(e.mesh.material);
 box=new THREE.Box3().setFromObject(g.scene);grid.position.y=box.min.y-.002;resize();view('iso');
 const palette={};function appearance(){for(const e of entries)for(let i=0;i<e.mats.length;i++){const c=palette[appearanceRole(e.p)];if(c)e.mats[i].color.set(c);else e.mats[i].color.copy(e.originals[i])}render()}
 for(const role of ['base','accent','frame'])$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;appearance()};$('#resetPalette').onclick=()=>{for(const role of Object.keys(palette))delete palette[role];appearance()};
 const enclosure=()=>{for(const e of entries)if(e.p.component==='enclosure')e.mesh.visible=$('#enclosure').checked;render()};$('#enclosure').onchange=enclosure;
 const displayKeys=['night','gridVisible','enclosure'];
 const nativeMotion=setupNativeMotionControls({adapter,profile,camera,controls:orbit,render,scope,onPose:enclosure,
  getDisplay:()=>({...Object.fromEntries(displayKeys.map(k=>[k,$('#'+k).checked])),palette:{...palette}}),
  validateDisplay:d=>{if(!d||displayKeys.some(k=>typeof d[k]!=='boolean')||!d.palette||Object.entries(d.palette).some(([k,v])=>!['base','accent','frame'].includes(k)||!/^#[a-f0-9]{6}$/i.test(v)))throw Error('Invalid display setting')},
  setDisplay:d=>{for(const k of displayKeys){$('#'+k).checked=d[k];$('#'+k).dispatchEvent(new Event('change'))}for(const k of Object.keys(palette))delete palette[k];Object.assign(palette,d.palette);for(const[k,v]of Object.entries(palette))$('#'+k).value=v;appearance();enclosure()}
 });
 setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,drawPath:false,coordinateNote:displacementCoordinateNote,
  getPose:()=>['x','y','z'].map(a=>adapter.getAxes()[a]),getLimits:()=>displacementGcodeSettings(profile,adapter.getAxes()).limits,
  getFirmwareSettings:()=>displacementGcodeSettings(profile,adapter.getAxes()),
  getContext:()=>({machine:id,asset_identity:replay_asset_identity,secondary_axes:Object.fromEntries(Object.entries(adapter.getAxes()).filter(([a])=>!['x','y','z'].includes(a)))}),beforePlayback:()=>$('#motionPause').click(),
  setPose:xyz=>nativeMotion.set({...adapter.getAxes(),...Object.fromEntries(['x','y','z'].map((a,i)=>[a,xyz[i]]))})}); $('#parts').textContent=meta.parts.length.toLocaleString()+' 部品 · 250 mm基準';$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(meta.parts.length);setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message}

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
