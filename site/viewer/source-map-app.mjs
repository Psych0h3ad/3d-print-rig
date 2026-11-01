import * as THREE from './vendor-r180/three.module.js';
import {OrbitControls} from './vendor-r180/OrbitControls.js';
import {loadVoronDefaultLayout} from './layout-voron-defaults.mjs?v=dc35ae5c4b931bb20721';
import {loadV24ReferenceLayout} from './layout-v24-reference-provider.mjs?v=02a8323266d0cb02af0b';
import {createSourcePartsMap,sourceMapMachines} from './source-parts-map.mjs?v=94f44bb5c1755b7eba7f';
import {createAssemblyWorkbench} from './assembly-workbench.mjs?v=88764031765c8df4bef5';
import {createSourcePicker} from './source-picking-core.mjs?v=ca04efe661ce9d571b7f';
import {setupLanguage,translate,formatMessage} from './i18n.mjs?v=52fefcccb7320bf1c315';
import {applyDisplay,setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {setupGrid} from './grid-control.js';
import {settleCameraPose} from './responsive-camera.mjs?v=149a79a654914b2af652';
const $=s=>document.querySelector(s),lang=()=>document.documentElement.lang||'en',tr=s=>translate(({'Previous stage':'Previous classification','Next stage':'Next classification','Focus added parts':'Focus classification','Return to previous configuration':'Back to machines','Select a visible model part to find its stage.':'Select a visible model part to find its classification.','Stage name, part name, M3…':'Classification, part name, M3…'})[s]||s,lang());
const query=new URL(location.href).searchParams,id=query.get('machine')||'voron_trident_350';
for(const key of sourceMapMachines){const o=document.createElement('option');o.value=key;o.textContent=key.replace(/^voron_/,'VORON ').replaceAll('_',' ');$('#mapMachine').append(o)}$('#mapMachine').value=id;
$('#mapMachine').onchange=()=>{const url=new URL(location.href);url.searchParams.set('machine',$('#mapMachine').value);location.assign(url)};
applyDisplay();setupHeaderThemeToggle($('.header-actions'));setupLanguage();
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.001,100),orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;scene.add(new THREE.HemisphereLight('#ffffff','#69727a',2.5));
const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(1,2,2);scene.add(light);const rear=new THREE.DirectionalLight('#e8f2ff',1.5);rear.position.set(-1,1,-2);scene.add(rear);
let disposed=false,loaded,index,workbench,picker,frame=0;
function render(){if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=0;scene.background=new THREE.Color(document.documentElement.dataset.theme==='dark'?'#101820':'#edf1f5');renderer.render(scene,camera)})}
orbit.addEventListener('change',render);const grid=setupGrid(scene,render);
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/Math.max(1,b.height);camera.updateProjectionMatrix();render()}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function bounds(nodes){scene.updateMatrixWorld(true);const box=new THREE.Box3(),part=new THREE.Box3();for(const n of nodes){if(!n.isMesh)continue;n.geometry.computeBoundingBox();part.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);box.union(part)}return box}
function fit(nodes,direction=new THREE.Vector3(.65,.45,1)){const box=bounds(nodes);if(box.isEmpty())return;const span=box.getSize(new THREE.Vector3()).length(),distance=Math.max(.04,span/(2*Math.tan(camera.fov*Math.PI/360))*1.18/Math.min(1,camera.aspect));box.getCenter(orbit.target);camera.up.set(0,1,0);camera.position.copy(orbit.target).add(direction.normalize().multiplyScalar(distance));settleCameraPose(camera,orbit);render()}
const allNodes=()=>index?.entries().map(e=>e.node)||[];
$('#mapFit').onclick=()=>fit(allNodes());$('#mapFront').onclick=()=>fit(allNodes(),new THREE.Vector3(0,0,1));$('#mapTop').onclick=()=>{fit(allNodes(),new THREE.Vector3(0,1,.0001));camera.up.set(0,0,-1);settleCameraPose(camera,orbit);render()};
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const replacements={search:'Search classifications and parts',current_step:'Classification {0} / {1}',all_steps:'Source classifications ({0})',mark_done:'Mark this classification reviewed',progress:'{0} / {1} classifications recorded',items:'Source items in this classification',counts:'In classification {0} · displayed {1}',part_step:'Open this classification ({0})',active:'Part map {0}/{1}',pick_hint:'Select a visible model part to find its classification.',search_hint:'Classification, part name, M3…'};
const format=(message,values)=>{if(message==='assembly.workbench.no_items')return formatMessage('assembly.workbench.no_results',values,lang());const k=message.replace('assembly.workbench.','');return replacements[k]?values.reduce((s,v,i)=>s.replaceAll('{'+i+'}',String(v)),tr(replacements[k])):formatMessage(message,values,lang())};
function refreshCount(){if(!index)return;$('#mapCount').setAttribute('data-i18n','off');$('#mapCount').textContent=id+' · '+tr('Source items {0} · meshes {1}').replace('{0}',index.partCount).replace('{1}',index.renderCount)}
const controller=new AbortController();
try{
 if(!sourceMapMachines.includes(id))throw Error('Unregistered source map machine');
 loaded=await(id.startsWith('voron_trident_')?loadVoronDefaultLayout:loadV24ReferenceLayout)(id,{signal:controller.signal});scene.add(loaded.root);
 index=await createSourcePartsMap(loaded,scene);const container=$('#mapWorkbench'),select=document.createElement('select'),previous=document.createElement('button'),next=document.createElement('button'),focus=document.createElement('button'),finish=document.createElement('button'),manual=document.createElement('a'),note=document.createElement('p');
 select.id='mapClassification';manual.id='assemblyManual';manual.target='_blank';manual.rel='noopener';note.id='assemblyStepNote';
 for(const s of index.stages){const o=document.createElement('option');o.value=String(s.index);o.textContent=s.title;select.append(o)}
 function show(value){const s=index.stage(value),state=index.state(value);state.manual_text=tr('Related manual chapter')+' '+s.page_start+'–'+s.page_end;select.value=String(s.index);previous.disabled=s.index===0;next.disabled=s.index===index.stages.length-1;manual.href=index.manual.url+'#page='+s.page_start;workbench.update(state);render()}
 previous.onclick=()=>show(Math.max(0,Number(select.value)-1));next.onclick=()=>show(Math.min(index.stages.length-1,Number(select.value)+1));select.onchange=()=>show(Number(select.value));focus.onclick=()=>fit(index.parts(Number(select.value)).flatMap(p=>index.getPartNodes(p.key)));finish.onclick=()=>{location.href='./machines.html?lang='+lang()};
 workbench=createAssemblyWorkbench({container,index,legacy:{select,previous,next,focus,finish,manual,note},onStage:show,onFocusPart:key=>fit(index.getPartNodes(key)),onReveal:()=>$('#mapWorkbench').scrollIntoView({block:'nearest'}),format,translate:tr,storage:(()=>{try{return localStorage}catch{return null}})(),download});
 workbench.activate();show(workbench.resumeIndex());container.hidden=false;
 picker=createSourcePicker(THREE,{element:renderer.domElement,camera,entries:()=>index.entries(),onPick:key=>workbench.select(key,{reveal:true})});
 const floor=bounds(allNodes());grid.position.y=floor.min.y-.002;refreshCount();
 const sources=document.createElement('details'),sourceTitle=document.createElement('summary');sourceTitle.textContent=tr('Source documents');sources.append(sourceTitle);for(const c of loaded.inspection.components){const p=document.createElement('p'),a=document.createElement('a');a.href='../'+c.path;a.target='_blank';a.rel='noopener';a.textContent=c.path;a.setAttribute('data-i18n','off');p.append(a);sources.append(p)}container.after(sources);
 const sourceURL=loaded.manifest.source?.url??loaded.manifest.source?.repository;$('#mapLicense').href=sourceURL?.startsWith('https://')?sourceURL:(id.startsWith('voron_trident_')?'https://github.com/VoronDesign/Voron-Trident':'https://github.com/VoronDesign/Voron-2');
 $('#mapStatus').hidden=true;$('#mapExport').disabled=false;document.body.dataset.ready='true';resize();fit(allNodes());
 $('#mapExport').onclick=async()=>{const b=stage.getBoundingClientRect(),width=1920,height=Math.min(4096,Math.round(width/camera.aspect)),ratio=renderer.getPixelRatio();$('#mapExport').disabled=true;try{index.verifyLive();renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,camera);const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');download(id+'-source-map.png',blob,'image/png')}catch(error){$('#mapStatus').hidden=false;$('#mapStatus').textContent=error.message}finally{renderer.setPixelRatio(ratio);renderer.setSize(b.width,b.height,false);$('#mapExport').disabled=false;render()}};
}catch(error){$('#mapStatus').textContent=error.message;document.body.dataset.failed='true'}
window.addEventListener('rig-language-change',()=>{refreshCount();render()});
window.addEventListener('pagehide',()=>{disposed=true;controller.abort();cancelAnimationFrame(frame);resizeObserver.disconnect();picker?.dispose();workbench?.dispose();orbit.dispose();loaded?.dispose();grid.geometry.dispose();grid.material.dispose();renderer.dispose()},{once:true});
