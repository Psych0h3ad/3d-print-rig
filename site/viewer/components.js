import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {replaceWorkspaceURL} from './workspace-navigation.mjs';
import {setupSceneDisplay} from './display-preferences.mjs';
import {WorkspaceResizeObserver,workspaceTask} from './workspace-lifecycle.mjs';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=workspace-belts-1';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {partNodes,selectParts,visibleBounds} from './component-selection.js?v=workspace-belts-1';
import {renderProductLinks} from './product-links.js?v=workspace-belts-1';
import {componentCategories,componentCategory,componentViews,resolveComponentView,componentViewKeys} from './v0-mod-library.mjs?v=fysetc-front-54';
export async function mount(scope){
const $=s=>document.querySelector(s),stage=$('#stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#edf1f5');renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.0001,20),controls=scope.resource(new OrbitControls(camera,renderer.domElement));
scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const p of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...p);scene.add(light)}
const cached=new Map(),remembered=new Map(),categoryHistory=new Map();let catalog,current,currentItem,busy=false,view='iso',dirty=true;
const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o};
function fit(){if(!current)return;const box=visibleBounds(current),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());controls.target.copy(center);
 const distance=Math.max(size.x,size.y,size.z)/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/camera.aspect)*.8;
 const direction=new THREE.Vector3(...({iso:[1,.65,1.2],front:[0,0,1],side:[1,0,0]}[view])).normalize();camera.position.copy(center).addScaledVector(direction,distance);controls.minDistance=Math.max(.005,distance/15);controls.maxDistance=Math.max(.3,distance*10);controls.update();dirty=true;
 $('#dimensions').textContent=`表示外寸 ${(size.x*1000).toFixed(1)} × ${(size.z*1000).toFixed(1)} × ${(size.y*1000).toFixed(1)} mm`;
}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();fit();dirty=true}
new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
const paragraph=text=>{const p=document.createElement('p');p.textContent=text;return p};
function syncURL(selection){
 const url=new URL(location.href);url.searchParams.set('component',currentItem.id);
 for(const key of ['view','part']){const value=key==='view'?selection?.view.id:selection?.part;if(value)url.searchParams.set(key,value);else url.searchParams.delete(key)}
 replaceWorkspaceURL(null,'',url);document.body.dataset.component=currentItem.id;
 document.body.dataset.componentView=selection?.view.id||'';document.body.dataset.componentPart=selection?.part||'';
}
function setSelection(entry,wanted={}){
 const selection=resolveComponentView(entry.views,wanted),keys=componentViewKeys(selection.view,selection.part);
 selectParts(entry.nodes,keys);
 const viewSelect=$('#componentView'),partSelect=$('#componentPart');
 viewSelect.replaceChildren(...entry.views.map(g=>option(g.id,g.label)));viewSelect.value=selection.view.id;
 $('#componentViewOptions').hidden=entry.views.length<2;
 partSelect.replaceChildren(...(selection.view.assembly&&selection.view.parts.length>1?[option('all','選択したバリエーション全体')]:[]),...selection.view.parts.map(p=>option(p.key,p.label)));
 // A single-part source still uses "all" internally, with its own meaningful label.
 if(selection.part==='all'&&selection.view.parts.length===1)partSelect.replaceChildren(option('all',selection.view.parts[0].label));
 partSelect.value=selection.part;$('#componentPartOptions').hidden=selection.view.parts.length<2;
 viewSelect.onchange=()=>applySelection(entry,{view:viewSelect.value});
 partSelect.onchange=()=>applySelection(entry,{view:viewSelect.value,part:partSelect.value});
 remembered.set(currentItem.id,{view:selection.view.id,part:selection.part});
 $('#componentStatus').textContent=currentItem.label+' · '+(selection.part==='all'?selection.view.label:selection.view.parts.find(p=>p.key===selection.part).label);
 $('#componentSelectionInfo').textContent=`${keys.length} / ${entry.meta.parts.length} 部品を表示`;
 $('#componentSelectionInfo').hidden=false;syncURL(selection);fit();
}
function applySelection(entry,wanted){try{setSelection(entry,wanted)}catch(e){$('#componentStatus').textContent=e.message;console.error(e)}}
function componentOptions(category,selected){
 $('#componentCategory').value=category;
 const items=catalog.items.filter(p=>componentCategory(p)===category);
 $('#component').replaceChildren(...items.map(p=>option(p.id,p.label)));
 $('#component').value=items.some(p=>p.id===selected)?selected:items[0].id;
}
async function install(id,initial=false){return workspaceTask(async()=>{
 if(busy)return;
 const item=catalog.items.find(p=>p.id===id);if(!item)throw Error('未登録の部品です');
 const previous=currentItem;busy=true;
 for(const selector of ['#component','#componentCategory','#componentView','#componentPart'])$(selector).disabled=true;
 $('#loading').textContent='CADを読み込み中…';$('#loading').hidden=false;document.body.dataset.ready='false';
 try{
  const selectable=item.id.startsWith('v0mod_')||item.select_parts;
  const spec=catalog.assets[item.module];
  if(!cached.has(item.module)){
   const g=await loadModel(new GLTFLoader(),'../'+spec.glb);g.scene.visible=false;
   g.scene.traverse(m=>{if(m.isMesh){m.material=Array.isArray(m.material)?m.material.map(v=>v.clone()):m.material.clone();for(const material of Array.isArray(m.material)?m.material:[m.material])material.side=THREE.DoubleSide}});
   let meta=null,nodes=null,views=null;
   if(selectable){const r=await fetch('../'+spec.meta,{cache:'no-cache'});if(!r.ok)throw Error('部品一覧の取得に失敗しました');meta=await r.json();nodes=partNodes(g.scene,meta.parts);views=componentViews(item,meta.parts)}
   scene.add(g.scene);cached.set(item.module,{root:g.scene,meta,nodes,views});
  }
  const entry=cached.get(item.module),query=new URLSearchParams(location.search);
  const wanted=initial?{view:query.get('view'),part:query.get('part')}:remembered.get(item.id)||{};
  // Resolve and validate before retiring the last successfully loaded scene.
  if(entry.views){const selection=resolveComponentView(entry.views,wanted);selectParts(entry.nodes,componentViewKeys(selection.view,selection.part))}
  if(current)current.visible=false;current=entry.root;currentItem=item;current.visible=true;
  componentOptions(componentCategory(item),item.id);categoryHistory.set(componentCategory(item),item.id);
  if(entry.views)setSelection(entry,wanted);
  else{
   $('#componentViewOptions').hidden=true;$('#componentPartOptions').hidden=true;$('#componentSelectionInfo').hidden=true;
   $('#componentStatus').textContent=item.label+' · 部品単体';syncURL();fit();
  }
  const representation=item.representation==='3MF'?'3MF原本の印刷部品':item.representation==='STL'?'STL原本の印刷部品':item.representation==='integration_surfaces'?'開いた組込み参照面':item.solids+'ソリッド';
  const details=$('#componentDetails');details.replaceChildren(paragraph(item.manufacturer),paragraph(`${representation} · ${item.source_version}`));
  if(item.source_extents_mm)details.append(paragraph('原本XYZ外寸：'+item.source_extents_mm.map(v=>v.toFixed(2)).join(' × ')+' mm'));
  if(item.source_commit)details.append(paragraph('取得commit：'+item.source_commit));details.append(paragraph((item.source_sha256_label||'原本 SHA256')+'：'+item.source_sha256),paragraph(item.license));
  for(const [label,url] of [['原本の配布元',item.source_url],['配布条件',item.license_url]])if(url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener';details.append(a,document.createTextNode('　'))}
  $('#componentScope').textContent=(item.notes||'').replace('複数の候補が同じ原本座標に重なるため、部品を一つずつ選んで表示します。','選んだ原本・バリエーションだけを表示します。');$('#loading').hidden=true;renderProductLinks($('#componentProductLinks'),{component:item.id});
  document.body.dataset.ready='true';dirty=true;
 }catch(e){
  if(previous){currentItem=previous;current=cached.get(previous.module).root;current.visible=true;componentOptions(componentCategory(previous),previous.id);document.body.dataset.ready='true'}
  $('#loading').textContent=e.message;$('#componentStatus').textContent=previous?'読込に失敗しました。直前の部品を表示中。':'読込に失敗しました';console.error(e);
 }finally{busy=false;for(const selector of ['#component','#componentCategory','#componentView','#componentPart'])$(selector).disabled=false}
});}
for(const id of ['iso','front','side'])$('#'+id).onclick=()=>{view=id;fit()};$('#fit').onclick=fit;
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Component',afterRender:()=>{dirty=true}});
try{const r=await fetch('../COMPONENT_LIBRARY.json?v=trident-clearance-35',{cache:'no-cache'});if(!r.ok)throw Error('部品カタログを取得できません');catalog=await r.json();
 for(const category of componentCategories.filter(c=>catalog.items.some(p=>componentCategory(p)===c.id)))$('#componentCategory').append(option(category.id,category.label));
 $('#component').onchange=e=>install(e.target.value);
 $('#componentCategory').onchange=e=>{const next=catalog.items.find(p=>componentCategory(p)===e.target.value);install(categoryHistory.get(e.target.value)||next.id)};
 const wanted=new URLSearchParams(location.search).get('component');await install(catalog.items.some(p=>p.id===wanted)?wanted:catalog.items[0].id,true);
}catch(e){$('#loading').textContent=e.message;console.error(e)}resize();

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
