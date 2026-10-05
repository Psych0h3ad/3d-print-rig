import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createRemorphAdapter} from './remorph-adapter.mjs';
import {createRemorphEnvironment} from './remorph-environment.mjs?v=extra-machines-55';
import {loadExtraMachine} from './extra-machine-loader.mjs?v=extra-machines-55';
import {setupMachineNavigation} from './machines.js?v=9afdc567bd48998f220c';
import {workspaceFrame,WorkspaceResizeObserver,workspaceListen} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
export async function mount(scope){
 const $=id=>document.getElementById(id),id='remorph_beta1_307',stage=$('stage');
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));stage.append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.01,20),controls=scope.resource(new OrbitControls(camera,renderer.domElement));
 let adapter,profile,environment,root,pending=false;
 function render(){if(pending||scope.disposed)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
 function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(r.width,1),Math.max(r.height,1),false);setResponsiveAspect(camera,controls,r.width,r.height);render()}
 new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);workspaceListen(document,'visibilitychange',()=>{if(document.visibilityState==='visible')resize()});
 function view(name){if(!root)return;const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());
  if(name==='head'){box.makeEmpty();for(const[k,n]of adapter.nodes)if(adapter.records.get(k).motion==='xy_head')box.expandByObject(n);box.getCenter(center)}
  controls.target.copy(center);camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);
  const distance=box.getSize(new THREE.Vector3()).length()/(2*Math.sin(THREE.MathUtils.degToRad(camera.fov)/2))*1.12;
  camera.position.copy(center).add(new THREE.Vector3(...({iso:[.7,.5,.85],front:[0,0,1],top:[0,1,.0001],head:[.7,.35,1]}[name])).normalize().multiplyScalar(distance));frameResponsiveView(camera,controls);controls.update();render();
 }
 for(const name of ['iso','front','top','head'])$(name).onclick=()=>view(name);
 setupMachineNavigation(id);await setupPublicInfo({includeDownloads:false});
 try{
  const loaded=await loadExtraMachine(id);({root,profile}=loaded);root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of [].concat(n.material))if(m.transparent){m.depthWrite=false;n.castShadow=false}}});
  scene.add(root);adapter=createRemorphAdapter(root,loaded.manifest,profile,loaded.bindings);environment=createRemorphEnvironment(scene,renderer,profile);
  function pose(){const out=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($(a).value)])));for(const a of ['x','y','z'])$(a+'v').textContent=Number($(a).value).toFixed(2)+' mm';$('motionStatus').textContent='XYZ · '+out.xyz_mm.map(v=>v.toFixed(2)).join(' / ')+' mm';document.body.dataset.pose=JSON.stringify(out);render()}
  for(const[i,a]of ['x','y','z'].entries()){const input=$(a);input.min=profile.display_limits_mm[a.toUpperCase()][0];input.max=profile.display_limits_mm[a.toUpperCase()][1];input.value=profile.display_reference_xyz_mm[i];input.disabled=false;input.oninput=pose}
  $('resetPose').onclick=()=>{for(const[i,a]of ['x','y','z'].entries())$(a).value=profile.display_reference_xyz_mm[i];pose()};
  $('enclosure').onchange=()=>{adapter.setEnclosureVisible($('enclosure').checked);render()};$('flexible').onchange=()=>{adapter.setFlexibleVisible($('flexible').checked);render()};
  function light(percent){environment.setBrightness(percent);$('brightness').value=percent;$('brightnessValue').textContent=percent+'%';document.body.dataset.ledPercent=percent;render()}
  $('brightness').oninput=()=>light(Number($('brightness').value));$('startup').onclick=()=>light(42);$('idle').onclick=()=>light(5);$('ledOff').onclick=()=>light(0);
  function floor(){environment.setFloor({visible:$('floorVisible').checked,finish:$('floorFinish').value,gridVisible:$('gridVisible').checked});render()}
  for(const n of ['floorFinish','floorVisible','gridVisible'])$(n).onchange=floor;
  $('roomDark').onchange=()=>{const room=environment.setRoomDark($('roomDark').checked);document.body.dataset.roomDark=String(room.darkRoom);render()};
  $('night').onchange=$('night').oninput=()=>{environment.setDark($('night').checked);render()};
  $('frame').value=profile.appearance.palette_defaults.frame;$('frame').oninput=()=>{adapter.setPalette({frame:$('frame').value});render()};
  $('resetPalette').onclick=()=>{$('frame').value=profile.appearance.palette_defaults.frame;adapter.setPalette(profile.appearance.palette_defaults);render()};
  for(const name of ['resetPose','enclosure','flexible','brightness','startup','idle','ledOff','floorFinish','floorVisible','gridVisible','frame','resetPalette','night','roomDark'])$(name).disabled=false;
  $('badge').textContent=loaded.manifest.parts.length.toLocaleString()+' PARTS · REMORPH BETA 1';
  setupRenderExport({renderer,scene,camera,controls,name:id,beforeRender:()=>{},afterRender:render});$('openRender').disabled=false;
  document.body.dataset.machineId=id;document.body.dataset.ready='true';document.body.dataset.parts=loaded.manifest.parts.length;$('status').hidden=true;
  pose();floor();light(42);environment.setDark($('night').checked);resize();view('iso');
 }catch(error){$('status').textContent='CAD load failed: '+error.message;document.body.dataset.error=error.message;throw error}
}
