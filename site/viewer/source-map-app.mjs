import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {loadVoronDefaultLayout} from './layout-voron-defaults.mjs?v=68120c03456eafc98254';
import {loadV24ReferenceLayout} from './layout-v24-reference-provider.mjs?v=95b176f494b7ac1a499d';
import {createVoronAssemblyGuide,supportsVoronAssembly} from './voron-assembly-guide.mjs?v=bfadb256539920e61f31';
import {createSourcePartsMap,sourceMapMachines} from './source-parts-map.mjs?v=aef1e3b96b466ccb5b31';
import {createAssemblyWorkbench} from './assembly-workbench.mjs?v=88764031765c8df4bef5';
import {createSourcePicker} from './source-picking-core.mjs?v=ca04efe661ce9d571b7f';
import {setupLanguage,translate,formatMessage} from './i18n.mjs?v=1ba508ae5059ae2bcaec';
import {applyDisplay,setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {setupGrid} from './grid-control.js';
import {settleCameraPose} from './responsive-camera.mjs?v=149a79a654914b2af652';
const assemblyMode=new URL(location.href).searchParams.get('view')==='assembly';
const $=s=>document.querySelector(s),lang=()=>document.documentElement.lang||'en',tr=s=>translate((!assemblyMode?{'Previous stage':'Previous classification','Next stage':'Next classification','Focus added parts':'Focus classification','Return to previous configuration':'Back to machines','Select a visible model part to find its stage.':'Select a visible model part to find its classification.','Stage name, part name, M3…':'Classification, part name, M3…'}:{'Return to previous configuration':'Back to machines'})[s]||s,lang());
const query=new URL(location.href).searchParams,id=query.get('machine')||'voron_trident_350';
for(const key of sourceMapMachines.filter(k=>!assemblyMode||supportsVoronAssembly(k))){const o=document.createElement('option');o.value=key;o.textContent=key.replace(/^voron_/,'VORON ').replaceAll('_',' ');$('#mapMachine').append(o)}$('#mapMachine').value=id;
$('#mapMachine').onchange=()=>{const url=new URL(location.href);url.searchParams.set('machine',$('#mapMachine').value);location.assign(url)};
applyDisplay();setupHeaderThemeToggle($('.header-actions'));setupLanguage();
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,100),orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;scene.add(new THREE.HemisphereLight('#ffffff','#69727a',2.5));
const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(1,2,2);scene.add(light);const rear=new THREE.DirectionalLight('#e8f2ff',1.5);rear.position.set(-1,1,-2);scene.add(rear);
let disposed=false,loaded,index,workbench,picker,frame=0,nativeNodes=[];
function render(){if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=0;scene.background=new THREE.Color(document.documentElement.dataset.theme==='dark'?'#101820':'#edf1f5');renderer.render(scene,camera)})}
orbit.addEventListener('change',render);const grid=setupGrid(scene,render);
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/Math.max(1,b.height);camera.updateProjectionMatrix();render()}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function bounds(nodes){scene.updateMatrixWorld(true);const box=new THREE.Box3(),part=new THREE.Box3();for(const n of nodes){if(!n.isMesh)continue;n.geometry.computeBoundingBox();part.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);box.union(part)}return box}
function fit(nodes,direction=new THREE.Vector3(.65,.45,1)){const box=bounds(nodes);if(box.isEmpty())return;const span=box.getSize(new THREE.Vector3()).length(),distance=Math.max(.04,span/(2*Math.tan(camera.fov*Math.PI/360))*1.18/Math.min(1,camera.aspect));box.getCenter(orbit.target);camera.up.set(0,1,0);camera.position.copy(orbit.target).add(direction.normalize().multiplyScalar(distance));settleCameraPose(camera,orbit);render()}
const allNodes=()=>index?.entries().map(e=>e.node)||[];
const viewNodes=()=>{index?.verifyLive();return assemblyMode?nativeNodes:allNodes()};
$('#mapFit').onclick=()=>fit(viewNodes());$('#mapFront').onclick=()=>fit(viewNodes(),new THREE.Vector3(0,0,1));$('#mapTop').onclick=()=>{fit(viewNodes(),new THREE.Vector3(0,1,.0001));camera.up.set(0,0,-1);settleCameraPose(camera,orbit);render()};
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const replacements={search:'Search classifications and parts',current_step:'Classification {0} / {1}',all_steps:'Source classifications ({0})',mark_done:'Mark this classification reviewed',progress:'{0} / {1} classifications recorded',items:'Source items in this classification',counts:'In classification {0} · displayed {1}',part_step:'Open this classification ({0})',active:'Part map {0}/{1}',pick_hint:'Select a visible model part to find its classification.',search_hint:'Classification, part name, M3…'};
const format=(message,values)=>{if(assemblyMode)return formatMessage(message,values,lang());if(message==='assembly.workbench.no_items')return formatMessage('assembly.workbench.no_results',values,lang());const k=message.replace('assembly.workbench.','');return replacements[k]?values.reduce((s,v,i)=>s.replaceAll('{'+i+'}',String(v)),tr(replacements[k])):formatMessage(message,values,lang())};
function refreshCount(){if(!index)return;$('#mapCount').setAttribute('data-i18n','off');$('#mapCount').textContent=id+' · '+tr('Source items {0} · meshes {1}').replace('{0}',index.partCount).replace('{1}',index.renderCount)}
const controller=new AbortController();
try{
 if(!sourceMapMachines.includes(id))throw Error('Unregistered source map machine');
 if(assemblyMode&&!supportsVoronAssembly(id))throw Error('No source-backed assembly overview for this machine');
 loaded=await(id.startsWith('voron_trident_')?loadVoronDefaultLayout:loadV24ReferenceLayout)(id,{signal:controller.signal});scene.add(loaded.root);
 index=await(assemblyMode?createVoronAssemblyGuide:createSourcePartsMap)(loaded,scene);nativeNodes=allNodes();const originalFloor=bounds(nativeNodes);const container=$('#mapWorkbench'),select=document.createElement('select'),previous=document.createElement('button'),next=document.createElement('button'),focus=document.createElement('button'),finish=document.createElement('button'),manual=document.createElement('a'),note=document.createElement('p');
 select.id='mapClassification';manual.id='assemblyManual';manual.target='_blank';manual.rel='noopener';note.id='assemblyStepNote';
 for(const s of index.stages){const o=document.createElement('option');o.value=String(s.index);o.textContent=s.title;select.append(o)}
 function show(value){const s=index.stage(value),state=assemblyMode?index.setStage(value):index.state(value);if(assemblyMode){$('#assemblyPosition').value=String(s.index);$('#assemblyPositionValue').textContent=(s.index+1)+' / '+index.stages.length;$('#assemblyPreview').setAttribute('aria-pressed','false');$('#assemblyPreview').textContent=tr('Compare complete assembly');document.body.dataset.assemblyStage=s.id}state.manual_text=assemblyMode?formatMessage('ui.v0assembly.pages',[s.page_start,s.page_end],lang()):tr('Related manual chapter')+' '+s.page_start+'–'+s.page_end;select.value=String(s.index);previous.disabled=s.index===0;next.disabled=s.index===index.stages.length-1;manual.href=index.manual.url+'#page='+s.page_start;workbench.update(state);render()}
 previous.onclick=()=>show(Math.max(0,Number(select.value)-1));next.onclick=()=>show(Math.min(index.stages.length-1,Number(select.value)+1));select.onchange=()=>show(Number(select.value));focus.onclick=()=>fit(index.parts(Number(select.value)).flatMap(p=>index.getPartNodes(p.key)));finish.onclick=()=>{location.href='./machines.html?lang='+lang()};
 workbench=createAssemblyWorkbench({container,index,legacy:{select,previous,next,focus,finish,manual,note},onStage:show,onFocusPart:key=>fit(index.getPartNodes(key)),onReveal:()=>$('#mapWorkbench').scrollIntoView({block:'nearest'}),format,translate:tr,storage:(()=>{try{return localStorage}catch{return null}})(),download});
 if(assemblyMode){
  const controls=document.createElement('div');controls.className='assembly-timeline';
  const label=document.createElement('label');label.htmlFor='assemblyPosition';label.textContent=tr('Assembly position');
  const slider=document.createElement('input');slider.id='assemblyPosition';slider.type='range';slider.min='0';slider.max=String(index.stages.length-1);slider.step='1';slider.setAttribute('aria-label',tr('Assembly position'));
  const value=document.createElement('output');value.id='assemblyPositionValue';value.htmlFor=slider.id;
  const preview=document.createElement('button');preview.id='assemblyPreview';preview.type='button';preview.textContent=tr('Compare complete assembly');preview.setAttribute('aria-pressed','false');
  preview.onclick=()=>{if(preview.getAttribute('aria-pressed')==='true'){show(Number(select.value));return}workbench.update(index.previewComplete());preview.setAttribute('aria-pressed','true');preview.textContent=tr('Return to assembly view');render()};
  slider.oninput=()=>show(Number(slider.value));controls.append(label,value,slider,preview);container.before(controls);
 }
 workbench.activate();show(workbench.resumeIndex());container.hidden=false;
 picker=createSourcePicker(THREE,{element:renderer.domElement,camera,entries:()=>index.entries(),onPick:key=>workbench.select(key,{reveal:true})});
 grid.position.y=originalFloor.min.y-.002;refreshCount();
 const sources=document.createElement('details'),sourceTitle=document.createElement('summary');sourceTitle.textContent=tr('Source documents');sources.append(sourceTitle);for(const c of loaded.inspection.components){const p=document.createElement('p'),a=document.createElement('a');a.href='../'+c.path;a.target='_blank';a.rel='noopener';a.textContent=c.path;a.setAttribute('data-i18n','off');p.append(a);sources.append(p)}container.after(sources);
 const sourceURL=loaded.manifest.source?.url??loaded.manifest.source?.repository;$('#mapLicense').href=sourceURL?.startsWith('https://')?sourceURL:(id.startsWith('voron_trident_')?'https://github.com/VoronDesign/Voron-Trident':'https://github.com/VoronDesign/Voron-2');
 $('#mapStatus').hidden=true;$('#mapExport').disabled=false;document.body.dataset.ready='true';resize();fit(viewNodes());
 $('#mapExport').onclick=async()=>{const b=stage.getBoundingClientRect(),width=1920,height=Math.min(4096,Math.round(width/camera.aspect)),ratio=renderer.getPixelRatio();$('#mapExport').disabled=true;try{index.verifyLive();renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,camera);const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');download(id+'-source-map.png',blob,'image/png')}catch(error){$('#mapStatus').hidden=false;$('#mapStatus').textContent=error.message}finally{renderer.setPixelRatio(ratio);renderer.setSize(b.width,b.height,false);$('#mapExport').disabled=false;render()}};
}catch(error){$('#mapStatus').textContent=error.message;document.body.dataset.failed='true'}
function refreshMode(){
 const title=tr(assemblyMode?'Interactive assembly':'Source part map');document.title=title+' · 3D Print Rig';document.querySelector('h1').textContent=title;document.querySelector('header>span').textContent=title;
 const scope=$('#mapScope');scope.textContent=tr(assemblyMode?'Move through the chapters to build the source assembly. This is a subassembly overview, not a screw-by-screw guide.':'Inspect the complete default assembly. Source classifications are not an insertion order.');
 const link=$('#mapModeLink'),url=new URL(location.href);if(assemblyMode)url.searchParams.delete('view');else url.searchParams.set('view','assembly');link.href=url;link.textContent=tr(assemblyMode?'Explore complete part map':'Start interactive assembly');link.hidden=!assemblyMode&&!supportsVoronAssembly(id);
 if($('#assemblyPosition')){const slider=$('#assemblyPosition');slider.setAttribute('aria-label',tr('Assembly position'));document.querySelector('label[for="assemblyPosition"]').textContent=tr('Assembly position');const preview=$('#assemblyPreview');preview.textContent=tr(preview.getAttribute('aria-pressed')==='true'?'Return to assembly view':'Compare complete assembly')}
}
refreshMode();
window.addEventListener('rig-language-change',()=>{refreshMode();refreshCount();render()});
window.addEventListener('pageshow',event=>{if(event.persisted&&!disposed){applyDisplay();resize();render()}});
window.addEventListener('pagehide',event=>{if(event.persisted||disposed)return;disposed=true;controller.abort();cancelAnimationFrame(frame);resizeObserver.disconnect();picker?.dispose();workbench?.dispose();try{if(assemblyMode)index?.restore()}finally{orbit.dispose();loaded?.dispose();grid.geometry.dispose();grid.material.dispose();renderer.dispose()}});
