import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {setupSceneDisplay} from './display-preferences.mjs?v=8f347468def25922153c';
import {WorkspaceResizeObserver,workspaceTask} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=319442cce47f582793a9';
import {loadExternalComponent} from './component-assets.mjs?v=a912f0a87d5f3993e9ad';
import {setupPublicInfo} from './public-info.js?v=07313fc4151911a54f23';
import {setupRenderExport} from './render-export.js?v=736862a3013dbfd9f9ea';
import {partNodes,selectParts,visibleBounds} from './component-selection.js?v=workspace-belts-1';
import {renderProductLinks} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {componentCategories,componentCategory,componentViews,resolveComponentView,componentViewKeys,resolveComponentItem} from './v0-mod-library.mjs?v=abb4fafb1e86da0d3633';
import {frameHeadBounds} from './head-camera.mjs';
import {partKey} from './head-assembly.js';
import {hasMicroSwissSourceShroud,createSourceShroudPalette,mountSourceShroudPalette} from './microswiss-source-shroud-palette.mjs?v=f014e574106d0f8792bc';
export async function mount(scope){
const $=s=>document.querySelector(s),stage=$('#stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#edf1f5');renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.0001,20),controls=scope.resource(new OrbitControls(camera,renderer.domElement));
scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const p of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...p);scene.add(light)}
const sourcePalette=scope.resource(mountSourceShroudPalette($('#componentDetails'),()=>{dirty=true}));
const cached=new Map(),remembered=new Map(),categoryHistory=new Map();let catalog,current,currentItem,busy=false,view='iso',dirty=true;
const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o};
function fit(){if(!current)return;const box=visibleBounds(current),size=box.getSize(new THREE.Vector3()),insets={};
 if(stage.clientWidth<=680){
  const rect=stage.getBoundingClientRect(),tools=stage.querySelector('.view-tools')?.getBoundingClientRect(),sponsor=stage.querySelector('.project-sponsor > summary')?.getBoundingClientRect(),meta=stage.querySelector('.view-meta')?.getBoundingClientRect();
  insets.top=Math.min(stage.clientHeight*.4,tools?.height?tools.bottom-rect.top+8:0);
  insets.bottom=Math.min(stage.clientHeight*.4,Math.max(...[sponsor,meta].filter(r=>r?.height).map(r=>rect.bottom-r.top+8),0));
 }
 controls.minDistance=.0001;
 const {distance}=frameHeadBounds(camera,controls,box,{direction:{iso:[1,.65,1.2],front:[0,0,1],side:[1,0,0]}[view],width:Math.max(stage.clientWidth,1),height:Math.max(stage.clientHeight,1),insets});
 controls.minDistance=Math.max(.005,distance/15);controls.maxDistance=Math.max(.3,distance*10);dirty=true;
 $('#dimensions').textContent=`表示外寸 ${(size.x*1000).toFixed(1)} × ${(size.z*1000).toFixed(1)} × ${(size.y*1000).toFixed(1)} mm`;
}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();fit();dirty=true}
new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
const paragraph=text=>{const p=document.createElement('p');p.textContent=text;return p};
function componentStatus(label,detail){
 // Translate complete labels independently; a generic status template must
 // not split a source-part collection name into partially translated words.
 const name=document.createElement('span'),part=document.createElement('span');
 name.textContent=label;part.textContent=detail;
 $('#componentStatus').replaceChildren(name,document.createTextNode(' · '),part);
}
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
 componentStatus(currentItem.label,selection.part==='all'?selection.view.label:selection.view.parts.find(p=>p.key===selection.part).label);
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
 const item=resolveComponentItem(catalog.items,id);
 const previous=currentItem;busy=true;
 for(const selector of ['#component','#componentCategory','#componentView','#componentPart'])$(selector).disabled=true;
 $('#openRender').disabled=true;
 $('#loading').textContent='CADを読み込み中…';$('#loading').hidden=false;document.body.dataset.ready='false';
 try{
  const selectable=item.id.startsWith('v0mod_')||item.select_parts;
  const spec=catalog.assets[item.module];
  if(!cached.has(item.module)){
   const external=spec.external?await loadExternalComponent(new GLTFLoader(),spec,location.href):null;
   const g=external?.gltf||await loadModel(new GLTFLoader(),'../'+spec.glb);g.scene.visible=false;
   g.scene.traverse(m=>{if(m.isMesh){m.material=Array.isArray(m.material)?m.material.map(v=>v.clone()):m.material.clone();for(const material of Array.isArray(m.material)?m.material:[m.material])material.side=THREE.DoubleSide}});
   let meta=null,nodes=null,views=null;
   if(selectable||hasMicroSwissSourceShroud(item)){if(external)meta=external.meta;else{const r=await fetch('../'+spec.meta,{cache:'no-cache'});if(!r.ok)throw Error('部品一覧の取得に失敗しました');meta=await r.json()}if(selectable){nodes=partNodes(g.scene,meta.parts);views=componentViews(item,meta.parts)}}
   const sourceShroudPalette=meta?createSourceShroudPalette(g.scene,meta,partKey):null;
   scene.add(g.scene);cached.set(item.module,{root:g.scene,meta,nodes,views,sourceShroudPalette});
  }
  const entry=cached.get(item.module),query=new URLSearchParams(location.search);
  const wanted=initial?{view:query.get('view'),part:query.get('part')}:remembered.get(item.id)||{};
  // Resolve and validate before retiring the last successfully loaded scene.
  if(entry.views){const selection=resolveComponentView(entry.views,wanted);selectParts(entry.nodes,componentViewKeys(selection.view,selection.part))}
  sourcePalette.select(entry.sourceShroudPalette);
  if(current)current.visible=false;current=entry.root;currentItem=item;current.visible=true;
  componentOptions(componentCategory(item),item.id);categoryHistory.set(componentCategory(item),item.id);
  if(entry.views)setSelection(entry,wanted);
  else{
   $('#componentViewOptions').hidden=true;$('#componentPartOptions').hidden=true;$('#componentSelectionInfo').hidden=true;
   componentStatus(item.label,'部品単体');syncURL();fit();
  }
  const representation=item.representation==='3MF'?'3MF原本の印刷部品':item.representation==='STL'?'STL原本の印刷部品':item.representation==='integration_surfaces'?'開いた組込み参照面':'ソリッド数：'+item.solids;
  const details=$('#componentDetails');details.replaceChildren(paragraph(item.manufacturer),paragraph(`${representation} · ${item.source_version}`));
  if(item.source_extents_mm)details.append(paragraph('原本XYZ外寸：'+item.source_extents_mm.map(v=>v.toFixed(2)).join(' × ')+' mm'));
  if(item.source_commit)details.append(paragraph('取得commit：'+item.source_commit));details.append(paragraph((item.source_sha256_label||'原本 SHA256')+'：'+item.source_sha256),paragraph(item.license));
  for(const [label,url] of [['原本の配布元',item.source_url],['STEP / '+item.manufacturer,item.source_cad_url],['配布条件',item.license_url]])if(url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener';details.append(a,document.createTextNode('　'))}
  $('#componentScope').textContent=(item.notes||'').replace('複数の候補が同じ原本座標に重なるため、部品を一つずつ選んで表示します。','選んだ原本・バリエーションだけを表示します。');$('#loading').hidden=true;renderProductLinks($('#componentProductLinks'),{component:item.id});
  document.body.dataset.ready='true';dirty=true;
 }catch(e){
  if(previous){sourcePalette.select(cached.get(previous.module).sourceShroudPalette);currentItem=previous;current=cached.get(previous.module).root;current.visible=true;componentOptions(componentCategory(previous),previous.id);document.body.dataset.ready='true'}
  else document.body.dataset.ready='error';
  $('#loading').textContent=e.message;$('#componentStatus').textContent=previous?'読込に失敗しました。直前の部品を表示中。':'読込に失敗しました';console.error(e);
 }finally{busy=false;$('#openRender').disabled=!current;for(const selector of ['#component','#componentCategory','#componentView','#componentPart'])$(selector).disabled=false}
});}
for(const id of ['iso','front','side'])$('#'+id).onclick=()=>{view=id;fit()};$('#fit').onclick=fit;
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Component',beforeRender:()=>{if(!current||busy)throw Error('原本の部品がありません')},afterRender:()=>{dirty=true}});
$('#openRender').disabled=true;
try{const r=await fetch('../COMPONENT_LIBRARY.json?v=trident-clearance-35',{cache:'no-cache'});if(!r.ok)throw Error('部品カタログを取得できません');catalog=await r.json();
 for(const category of componentCategories.filter(c=>catalog.items.some(p=>componentCategory(p)===c.id)))$('#componentCategory').append(option(category.id,category.label));
 $('#component').onchange=e=>install(e.target.value);
 $('#componentCategory').onchange=e=>{const next=catalog.items.find(p=>componentCategory(p)===e.target.value);install(categoryHistory.get(e.target.value)||next.id)};
 // Keep explicit shared-link identities: an unknown ID must never show another CAD.
 // Populate recovery controls before validating, without selecting or loading a model.
 const first=catalog.items[0];if(first){componentOptions(componentCategory(first),first.id);const empty=option('','—');empty.disabled=true;empty.selected=true;$('#component').prepend(empty);$('#component').value='';$('#component').disabled=false;$('#componentCategory').disabled=false}
 const wanted=new URLSearchParams(location.search).get('component');await install(resolveComponentItem(catalog.items,wanted).id,true);
}catch(e){$('#loading').textContent=e.message;$('#componentStatus').textContent=e.message;document.body.dataset.ready='error';console.error(e)}resize();

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
