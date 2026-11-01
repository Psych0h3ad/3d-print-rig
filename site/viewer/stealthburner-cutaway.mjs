import {setupUsageStatistics} from './usage-statistics.mjs?v=26f853b19035073af81e';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {setupLanguage,formatMessage} from './i18n.mjs?v=1ba508ae5059ae2bcaec';
import {setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {createModelProgress,readModelBytes} from './model-progress.mjs?v=beaef781095b6f56b290';
import {cutawaySource} from './stealthburner-cutaway-source.mjs';
import {createCutawayAssembly,filamentMeltProfile} from './stealthburner-cutaway-model.mjs';
import {lessonDuration,lessonChapters,lessonState,advanceLesson} from './stealthburner-lesson.mjs';
import {settleCameraPose} from './responsive-camera.mjs?v=149a79a654914b2af652';

const $=selector=>document.querySelector(selector),stage=$('#stage');
setupLanguage();setupHeaderThemeToggle($('.header-actions'));
setupUsageStatistics($('.header-actions'));
const language=()=>document.documentElement.lang||'en';
const t=id=>formatMessage(id,{},language());
const controller=new AbortController(),signal=controller.signal;
const listen=(target,event,callback)=>target.addEventListener(event,callback,{signal});
let renderer,controls,assembly,flows,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let seconds=0,flowTime=0,lastTime=0,frame=0,ready=false,chapter=-1,view='section',disposed=false,lastDraw=0,dirty=true;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.0001,2);
const lights=[new THREE.HemisphereLight('#ffffff','#798590',2.5),new THREE.DirectionalLight('#ffffff',3),new THREE.DirectionalLight('#ffffff',1.5)];
lights[1].position.set(-.2,.25,.3);lights[2].position.set(.2,.1,-.2);scene.add(...lights);
const thermalKey=()=>({heater:$('#heater').checked,fan:$('#fan').checked,feed:$('#feed').checked});
const pins=[...document.querySelectorAll('#pins button')];
let pinnedPoints=[];

for(const spec of cutawaySource.source_revisions){
  const a=document.createElement('a');a.href=`https://github.com/${spec.repository}/tree/${spec.revision}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=spec.name;
  const code=document.createElement('code');code.textContent=spec.revision;
  const license=document.createElement('a');license.href='../'+spec.license_path;license.textContent=spec.license;license.target='_blank';license.rel='noopener';
  $('#sourceLinks').append(a,license,code);
}
$('#sourceLinks').setAttribute('data-i18n','off');
function playback(){
  $('#playText').removeAttribute('data-i18n-id');$('#playText').textContent=t(playing?'cutaway.pause':'cutaway.play');
  $('#play').setAttribute('aria-label',t(playing?'cutaway.pause':'cutaway.play'));
  $('#playIcon').setAttribute('d',playing?'M7 5h4v14H7zM14 5h4v14h-4z':'M7 4v16l13-8z');
}
function syncLesson(force=false){
  const state=lessonState(seconds,thermalKey()),next=state.chapter;
  $('#timeline').value=seconds;$('#time').textContent=`${Math.floor(seconds)} / ${lessonDuration} s`;
  $('#creep').hidden=!state.heatCreep;
  if(next!==chapter||force){
    chapter=next;const item=lessonChapters[chapter];
    for(const [node,key]of [[$('#chapterTitle'),item.title],[$('#chapterText'),item.text]]){
      node.setAttribute('data-i18n-id',key);node.textContent=t(key);
    }
    for(const button of document.querySelectorAll('[data-chapter]'))button.setAttribute('aria-pressed',String(Number(button.dataset.chapter)===chapter));
  }
  if(assembly)assembly.update(state,{heatColors:$('#heatColors').checked});
  if(flows)flows.update(state,flowTime,Number($('#section').value)>0);
  return state;
}
function fit(next=view){
  if(!assembly)return;view=next;
  const center=assembly.box.getCenter(new THREE.Vector3()),size=assembly.box.getSize(new THREE.Vector3());
  const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect);
  const distance=size.length()/2/Math.sin(Math.min(vfov,hfov)/2)*1.14;
  const direction={section:[-1,.08,.08],perspective:[-1,.32,1.1],front:[0,.1,1]}[next];
  camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
  controls.target.copy(center);settleCameraPose(camera,controls);
  for(const [id,key]of [['sectionView','section'],['perspective','perspective'],['front','front']])$('#'+id).setAttribute('aria-pressed',String(next===key));
}
function resize(){
  if(!renderer)return;const {width,height}=stage.getBoundingClientRect();
  if(width<=0||height<=0)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  if(ready)fit();
}
function setBackdrop(){scene.background=new THREE.Color(document.documentElement.dataset.theme==='dark'?'#101b23':'#edf1f4');}
function draw(time){
  if(disposed)return;frame=requestAnimationFrame(draw);
  if(!ready||document.hidden){lastTime=time;return;}
  if(time-lastDraw<1000/30)return;
  const delta=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;lastDraw=time;
  if(playing){seconds=advanceLesson(seconds,delta);flowTime+=delta;}
  controls.update();if(!playing&&!dirty)return;
  syncLesson();setBackdrop();renderer.render(scene,camera);dirty=false;
  for(const [i,button]of pins.entries()){
    const p=pinnedPoints[i].clone().project(camera);
    const x=(p.x*.5+.5)*stage.clientWidth,y=(-p.y*.5+.5)*stage.clientHeight;
    button.hidden=p.z<-1||p.z>1||x<14||x>stage.clientWidth-14||y<54||y>stage.clientHeight-26;
    button.style.left=(x-13)+'px';button.style.top=(y-13)+'px';
  }
}
function createFlows(){
  const group=new THREE.Group();scene.add(group);
  // Overlays explain motion; every hardware mesh retains its source placement.
  const filamentMat=new THREE.MeshBasicMaterial({color:'#ad77df'}),airMat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.85}),heatMat=new THREE.MeshBasicMaterial({color:'#ef7645',transparent:true,opacity:.85});
  const filament=new THREE.InstancedMesh(new THREE.CylinderGeometry(.00082,.00082,.003,8),filamentMat,32);
  const melt=new THREE.Mesh(new THREE.LatheGeometry(filamentMeltProfile(assembly).map(p=>new THREE.Vector2(...p)),16),new THREE.MeshBasicMaterial({color:'#ef7645'}));
  const extrude=new THREE.Mesh(new THREE.CylinderGeometry(.00018,.00018,.008,8),filamentMat);extrude.position.set(0,-.004,0);
  const air=new THREE.InstancedMesh(new THREE.SphereGeometry(.00055,6,4),airMat,36);
  const heat=new THREE.InstancedMesh(new THREE.SphereGeometry(.00045,6,4),heatMat,10);
  group.add(filament,melt,extrude,air,heat);
  const a=assembly.point(cutawaySource.inlet_mm),b=assembly.point([0,-28.76,330]);
  const strand=new THREE.Mesh(new THREE.CylinderGeometry(.0008,.0008,a.y-b.y,10),new THREE.MeshBasicMaterial({color:'#8555b5'}));
  strand.position.copy(a).add(b).multiplyScalar(.5);group.add(strand);
  const fanBox=assembly.partBox(cutawaySource.fan_key),fan=fanBox.getCenter(new THREE.Vector3()),sink=assembly.point(cutawaySource.sink_mm);
  const dummy=new THREE.Object3D(),coolAir=new THREE.Color('#54bacd'),warmAir=new THREE.Color('#edb66b'),airColor=new THREE.Color();
  return {group,update(state,time,section){
    // The upper filament is solid. Flow through the nozzle waits for heating.
    filament.visible=state.feed;strand.visible=state.feed;extrude.visible=state.extrusion;melt.visible=state.feed;
    melt.material.color.set('#ad77df').lerp(new THREE.Color('#ef7645'),state.hot);
    for(let i=0;i<32;i++){
      const phase=(i/32+(state.extrusion?time*.075:0))%1;
      dummy.position.lerpVectors(a,b,phase);dummy.scale.setScalar(1);dummy.updateMatrix();filament.setMatrixAt(i,dummy.matrix);
    }
    filament.instanceMatrix.needsUpdate=true;
    // The CAD's 4010 axial fan draws from the front and pushes toward the sink.
    air.visible=state.fan;
    for(let i=0;i<36;i++){
      const phase=(i/36+time*.35)%1,lane=(i%3)-1;
      if(phase<.6){dummy.position.set((section?-.0015:0)+lane*.003,fan.y+lane*.004,THREE.MathUtils.lerp(fanBox.max.z+.012,sink.z,phase/.6));}
      else{const p=(phase-.6)/.4;dummy.position.set((section?-.0015:0)+lane*.003+(lane>=0?1:-1)*p*.027,THREE.MathUtils.lerp(fan.y+lane*.004,sink.y+lane*.007,p),sink.z-p*.008);}
      dummy.scale.setScalar(1);dummy.updateMatrix();air.setMatrixAt(i,dummy.matrix);
      // After crossing the fins, the air carries heat away. Color is a cue,
      // without an assigned air temperature or an airflow calculation.
      airColor.copy(coolAir).lerp(warmAir,phase<.6?0:state.hot*.65);
      air.setColorAt(i,airColor);
    }
    air.instanceMatrix.needsUpdate=true;air.instanceColor.needsUpdate=true;
    heat.visible=state.hot>.02;
    for(let i=0;i<10;i++){
      const phase=(i/10+time*.16)%1;
      dummy.position.copy(assembly.point([section?-.9:3,-28.76,329+phase*25]));dummy.scale.setScalar(.6+state.hot*.5);dummy.updateMatrix();heat.setMatrixAt(i,dummy.matrix);
    }
    heat.instanceMatrix.needsUpdate=true;
  }};
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
async function loadAssets(){
  const downloads=cutawaySource.assets.map(s=>[s.id,{bytes:s.compressed_bytes}]);
  if(cutawaySource.nozzle_mesh)downloads.push(['original_nozzle',{bytes:cutawaySource.nozzle_mesh.bytes}]);
  const tracker=createModelProgress(Object.fromEntries(downloads),s=>{
    $('#loadPercent').textContent=s.percent===null?'':s.percent+'%';
    if(s.percent===null)$('#loadProgress').removeAttribute('value');else $('#loadProgress').value=s.percent;
  });
  const loaded=[];
  // Bounded loading keeps decoded buffers and GPU uploads small on phones.
  for(const spec of cutawaySource.assets){
    const root=new URL('../'+spec.path,import.meta.url),modelURL=new URL(root.href+'.glb.gz');modelURL.searchParams.set('v',spec.decoded_sha256.slice(0,20));
    const metaURL=new URL(root.href+'.json');metaURL.searchParams.set('v',spec.metadata_sha256.slice(0,20));
    const response=await fetch(modelURL,{signal});if(!response.ok)throw Error('Cutaway model HTTP '+response.status);
    const bytes=await readModelBytes(response,{spec:{encoding:'gzip',bytes:spec.compressed_bytes,decoded_bytes:spec.decoded_bytes},onProgress:e=>tracker.update(spec.id,e)});
    const gzip=bytes[0]===0x1f&&bytes[1]===0x8b;
    if(gzip&&(bytes.length!==spec.compressed_bytes||await hash(bytes)!==spec.compressed_sha256))throw Error('Cutaway compressed model mismatch');
    const buffer=gzip?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(buffer.byteLength!==spec.decoded_bytes||await hash(buffer)!==spec.decoded_sha256)throw Error('Cutaway decoded model mismatch');
    const metadata=await fetch(metaURL,{signal});if(!metadata.ok)throw Error('Cutaway metadata HTTP '+metadata.status);
    const metaBytes=await metadata.arrayBuffer();if(await hash(metaBytes)!==spec.metadata_sha256)throw Error('Cutaway source metadata mismatch');
    const meta=JSON.parse(new TextDecoder().decode(metaBytes));
    const gltf=await new GLTFLoader().parseAsync(buffer,new URL('.',modelURL).href);loaded.push({spec,gltf,meta});
  }
  let nozzle;
  if(cutawaySource.nozzle_mesh){
    const spec=cutawaySource.nozzle_mesh,url=new URL(spec.path,import.meta.url);
    url.searchParams.set('v',spec.sha256.slice(0,20));
    const response=await fetch(url,{signal});if(!response.ok)throw Error('Original nozzle HTTP '+response.status);
    const bytes=await readModelBytes(response,{spec:{bytes:spec.bytes},onProgress:e=>tracker.update('original_nozzle',e)});
    if(bytes.length!==spec.bytes||await hash(bytes)!==spec.sha256)throw Error('Original nozzle source mismatch');
    nozzle=JSON.parse(new TextDecoder().decode(bytes));
  }
  tracker.assembling();return {assets:loaded,nozzle};
}
async function start(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,stencil:true});renderer.localClippingEnabled=true;
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
    renderer.domElement.setAttribute('aria-hidden','true');stage.append(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.04;controls.maxDistance=.8;
    controls.addEventListener('change',()=>{dirty=true;});
    controls.target.set(0,.065,0);resize();setBackdrop();renderer.render(scene,camera);
    const {assets,nozzle}=await loadAssets();if(disposed)return;
    assembly=createCutawayAssembly(assets,{nozzle});scene.add(assembly.root);flows=createFlows();
    pinnedPoints=[assembly.point(cutawaySource.drive_mm),assembly.point([0,-28.76,323]),assembly.point([0,-28.76,351]),assembly.partBox(cutawaySource.fan_key).getCenter(new THREE.Vector3())];
    ready=true;$('#loading').hidden=true;$('#pins').hidden=false;
    for(const id of ['play','restart','timeline','section','demonstration'])$('#'+id).disabled=false;
    document.body.dataset.assetStatus='ready';document.body.dataset.cutawayModel=cutawaySource.id;
    fit();playback();syncLesson(true);frame=requestAnimationFrame(draw);
  }catch(error){
    if(disposed)return;console.error(error);$('#loading').hidden=true;$('#error').hidden=false;
    document.body.dataset.assetStatus='error';
  }
}
listen($('#play'),'click',()=>{playing=!playing;playback();});
listen($('#restart'),'click',()=>{seconds=0;flowTime=0;$('#heater').checked=true;$('#fan').checked=true;$('#feed').checked=true;$('#heatColors').checked=true;$('#section').value=100;assembly.setSection(100);$('#sectionValue').textContent='100%';syncLesson(true);fit('section');});
listen($('#timeline'),'input',()=>{seconds=Number($('#timeline').value);syncLesson();});
listen($('#section'),'input',()=>{assembly?.setSection($('#section').value);$('#sectionValue').textContent=$('#section').value+'%';});
for(const id of ['heater','fan','feed','heatColors'])listen($('#'+id),'change',()=>syncLesson());
for(const button of document.querySelectorAll('[data-chapter]'))listen(button,'click',()=>{seconds=lessonChapters[Number(button.dataset.chapter)].at;syncLesson();});
for(const [id,next]of [['sectionView','section'],['perspective','perspective'],['front','front']])listen($('#'+id),'click',()=>fit(next));
listen(window,'rig-language-change',()=>{syncLesson(true);playback();});
listen($('#retry'),'click',()=>location.reload());
listen(document,'visibilitychange',()=>{lastTime=0;});
const observer=new ResizeObserver(resize);observer.observe(stage);
listen(document,'input',()=>{dirty=true;});listen(document,'change',()=>{dirty=true;});listen(document,'click',()=>{dirty=true;});
listen(window,'pagehide',event=>{if(event.persisted)return;disposed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();controls?.dispose();
  const resources=new Set();scene.traverse(m=>{if(m.geometry)resources.add(m.geometry);for(const material of [].concat(m.material||[]))resources.add(material);});for(const resource of resources)resource.dispose();renderer?.dispose();
});
await start();
