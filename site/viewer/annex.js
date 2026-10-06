import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {workspaceFrame,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setupMachineNavigation} from './machines.js?v=d6045b8af89b3984adcb';
import {loadExtraMachine} from './extra-machine-loader.mjs?v=274bbda379e78bd08808';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {sceneLightingState} from './scene-lighting-state.mjs?v=extra-machines-55';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {setupPublicInfo} from './public-info.js?v=0b0f91d7a82d25acbb87';
import {applyNativeMotionProfile,loadNativeMotionProfile} from './native-motion-profile.mjs?v=91532eb992519143f437';
import {createCommunityAdapter} from './community-adapter.mjs?v=0bfacb332d4a57985927';
import {setupNativeMotionControls} from './native-motion-controls.mjs?v=d9cf796abd5745b1e7d1';
export async function mount(scope){
 const $=id=>document.getElementById(id),stage=$('stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.005,30),controls=scope.resource(new OrbitControls(camera,renderer.domElement));
 const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(new RoomEnvironment(),.03);scene.environment=env.texture;scope.cleanup(()=>{env.texture.dispose();pmrem.dispose()});
 const ambient=new THREE.HemisphereLight('#ffffff','#586b80',.25),key=new THREE.DirectionalLight('#ffffff',1.4),fill=new THREE.DirectionalLight('#dceaff',.5);key.position.set(2,4,3);fill.position.set(-2,1,-1);scene.add(ambient,key,fill);
 const grid=new THREE.GridHelper(3,30,'#a8b8b1','#c5cec9');grid.visible=false;scene.add(grid);let pending=false,box;
 function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
 function lighting(){const room=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(room.background);scene.environmentIntensity=room.environmentIntensity;renderer.toneMappingExposure=room.exposure;document.body.dataset.roomDark='false';render()}
 function view(name='iso'){if(!box)return;const center=box.getCenter(new THREE.Vector3()),distance=box.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.08;controls.target.copy(center);camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);camera.position.copy(center).add(new THREE.Vector3(...(name==='top'?[0,1,0]:name==='front'?[0,0,1]:[.7,.45,.85])).normalize().multiplyScalar(distance));camera.lookAt(center);frameResponsiveView(camera,controls);render()}
 function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height));setResponsiveAspect(camera,controls,r.width,r.height);render()}
 new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);
 $('night').oninput=$('night').onchange=lighting;$('gridVisible').onchange=()=>{grid.visible=$('gridVisible').checked;render()};
 for(const name of ['iso','front','top'])$(name).onclick=()=>view(name);lighting();
 try{
  const id=new URLSearchParams(location.search).get('machine')||'annex_k2_assembly';setupMachineNavigation(id);
  const loaded=await loadExtraMachine(id),rig=await loadNativeMotionProfile(id);
  const {manifest,profile}=applyNativeMotionProfile(loaded.manifest,loaded.profile,rig,loaded.row.files['model.glb'].decoded_sha256),root=loaded.root,nodes=new Map();
  root.rotation.x=profile.viewer_orientation.viewer_root_rotation_x_radians;
  root.traverse(n=>{if(!n.isMesh)return;const match=n.name.match(/^(p\d+)__/);if(!match)throw Error('Annex part identity');if(nodes.has(match[1]))throw Error('Duplicate Annex part');nodes.set(match[1],n);n.userData.part_key=match[1];n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of [].concat(n.material)){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}});
  if(nodes.size!==manifest.parts.length||manifest.parts.some(p=>!nodes.has(p.key)))throw Error('Annex part coverage');
  const adapter=createCommunityAdapter(root,manifest,profile);
  const panels=manifest.parts.filter(p=>/panel|door/i.test(p.name)&&!/clip|hinge|latch|handle|mount|bracket|spacer/i.test(p.name));
  function enclosure(){for(const p of panels){const node=nodes.get(p.key);node.visible=$('enclosure').checked;for(const m of [].concat(node.material)){const transparent=$('panelTransparency').checked&&!/back|rear|bottom/i.test(p.name);m.transparent=transparent;m.opacity=transparent?.18:1;m.depthWrite=!transparent;m.needsUpdate=true}}render()}
  $('enclosure').onchange=$('panelTransparency').onchange=enclosure;enclosure();
  const displayKeys=['night','gridVisible','enclosure','panelTransparency'];
  setupNativeMotionControls({adapter,profile,camera,controls,render,scope,onPose:enclosure,
   getDisplay:()=>Object.fromEntries(displayKeys.map(k=>[k,$(k).checked])),
   validateDisplay:d=>{if(!d||displayKeys.some(k=>typeof d[k]!=='boolean'))throw Error('Invalid display setting')},
   setDisplay:d=>{for(const k of displayKeys){$(k).checked=d[k];$(k).dispatchEvent(new Event('input'));$(k).dispatchEvent(new Event('change'))}grid.visible=d.gridVisible;lighting();enclosure()}
  });
  scene.add(root);box=new THREE.Box3().setFromObject(root);grid.position.y=box.min.y-.003;
  $('machineTitle').textContent=profile.label;$('revision').textContent=profile.version;$('partCount').textContent=manifest.parts.length.toLocaleString()+' 部品';
  if(profile.size_reference_note){const note=document.createElement('p');note.className='foot';note.textContent=profile.size_reference_note;$('partCount').after(note)}
  $('badge').textContent=profile.label+' · '+manifest.parts.length.toLocaleString()+' PARTS';
  $('geometryStatus').textContent='原本配置の読戻し誤差 '+profile.mesh_roundtrip_max_error_mm.toFixed(6)+' mm';
  $('referenceIssues').replaceChildren(...profile.geometry_reference_issues.map(i=>{const li=document.createElement('li');li.textContent=i.name+' · 原本の参照形状に検査課題あり';return li}));
  for(const repair of profile.viewer_geometry_repairs||[]){const li=document.createElement('li');li.textContent='Corrupt corner clip replaced by the author’s matching Release 3.0 STL · '+repair.source_path+' · matching CAD surface discrepancy '+repair.maximum_counterpart_surface_distance_mm.toFixed(3)+' mm';$('referenceIssues').append(li)}
  $('authorSource').href=profile.source_url;$('sourceRevision').textContent=profile.source_commit;
  $('status').hidden=true;document.body.dataset.ready='true';document.body.dataset.assetStatus='ready';document.body.dataset.parts=nodes.size;document.body.dataset.motionStatus='native-motion-preview';
  resize();view();await setupPublicInfo({includeDownloads:false});setupRenderExport({three:THREE,renderer,scene,camera,controls,name:id});
 }catch(e){$('status').textContent=e.message;document.body.dataset.assetStatus='error';document.body.dataset.error=e.message;console.error(e)}
}
