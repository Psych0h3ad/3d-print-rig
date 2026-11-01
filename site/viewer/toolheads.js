import {createInactiveHeadCache,canRestoreInactiveHeadIndices} from './inactive-head-cache.mjs';
import {bindLedSource} from './led-source-binding.mjs';
import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=8f347468def25922153c';
import {workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import {loadMonolithData} from './monolith-machine.js?v=df2e59657f9bfb35dd9e';
import {setupChangerBank} from './changer-bank.js?v=f5029fbbdd962cbe2c85';
import {createMachineHeads,loadMachineHeadCatalog} from './machine-heads.js?v=d2034180167b1b1dee06';
import {headPrinterLink} from './head-navigation.mjs?v=cdc8509bb9417b535516';
import {headBuilderDimensions} from './configuration-model.js?v=ffcb5378701b391d2cab';
import {appearanceRole} from './appearance-role.mjs?v=977c4d1e134e7fe27a0e';
import {headPrintedCounts,visibleInAsset} from './head-printed-parts.mjs?v=8f8ed3d5c06ff2b0f6c8';
import {frameHeadBounds,updateHeadClipping} from './head-camera.mjs?v=47ec56c126168b690489';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=319442cce47f582793a9';
import {setupConfigurations} from './configurations.js?v=8dddb4781357ef248866';
import {setupPublicInfo} from './public-info.js?v=4ada675fd20b5bc37076';
import {setupRenderExport} from './render-export.js?v=92d6e71ee392361a4f7d';
import {headPlan,headPlacement,partKey,headCombinationCount} from './head-assembly.js?v=workspace-belts-1';
import {validateEvaMetadata,bindEvaMeshIdentities} from './eva-heads.mjs?v=b53ce6925a6fec3b5b10';
import {loadEvaFrontSurfaces,applyEvaFrontSurfaces} from './eva-front-surfaces.mjs?v=1fa86c2370423eacafe2';
import {setRapidoXUhfSurface} from './rapido-x-uhf-cover.mjs?v=8b458475dac84cfcd8c7';
import {contentSHA256} from './mount-validation.mjs';
import {probeCheck,probeMetrics,probeGuide,headInspectionState,headBodyCollisionNotes} from './probe-checks.js?v=0f70f5c099338db857e7';
import {renderProductLinks} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {setupHeadBuilder} from './builder-ui.mjs?v=c7443b4fc38be6f572fd';
import {validateBuilderExtras} from './toolhead-builder.mjs?v=7177100fadcc7fdc8975';
import {setupSurfaceStep} from './step-surface-ui.mjs?v=995d8a10a58e85600453';
import {loadExternalComponent} from './component-assets.mjs?v=a912f0a87d5f3993e9ad';
export async function mount(scope){
let machineRegistry,toolBank,bankRig;

const $=s=>document.querySelector(s),stage=$('#stage'),scene=scope.scene(new THREE.Scene());
scene.background=new THREE.Color('#edf1f5');
const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true,alpha:true}));
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,1,.0005,5);
const controls=scope.resource(new OrbitControls(camera,renderer.domElement));
controls.enableDamping=true;controls.minDistance=.025;controls.maxDistance=1.5;
camera.position.set(.2,.14,.25);
scene.add(new THREE.HemisphereLight('#ffffff','#687781',2.3));
for(const [position,intensity] of [[[.4,.6,.6],2.6],[[-.4,.2,-.3],1.8]]){
 const light=new THREE.DirectionalLight('#ffffff',intensity);light.position.set(...position);scene.add(light);
}
const bench=new THREE.Group();scene.add(bench);
const heightGuides=new THREE.Group(),keepoutGuide=new THREE.Group();bench.add(heightGuides,keepoutGuide);
const loader=new GLTFLoader(),cached=new Map();
const headCache=createInactiveHeadCache(cached,{
 protectedRoots:()=>[bankRig?.rig,bankRig?.bankRig],
 beforeEvict:(asset,{protectedResources})=>{
  if(!canRestoreInactiveHeadIndices(asset,protectedResources))return false;
  setRapidoXUhfSurface(asset.meshes,false);
 },
 afterDetach:()=>scene.userData.toolheadLedController?.discover()
});
let catalog,builder,dirty=true,view='iso',bounds=new THREE.Box3(),ready=false,currentVariant;
const presets={black_red:['#24272c','#e32636'],white_teal:['#f0f1ed','#008f95'],ivory_orange:['#e9dfca','#f07824'],purple:['#30343b','#9d5ce2']};
let colors={base:'#24272c',accent:'#e32636'};
const validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/iu.test(c);
try{const saved=JSON.parse(localStorage.getItem('3d-print-rig-head-palette')||'null');if(validColor(saved?.base)&&validColor(saved?.accent))colors=saved}catch{}
const paletteQuery=new URLSearchParams(location.search);
for(const role of ['base','accent']){const value='#'+paletteQuery.get(role);if(validColor(value))colors[role]=value}
const extras=()=>({head_builder:{palette:{...colors},see_inside:$('#seeInside').checked,dock:$('#headShowDock').checked,rail:$('#headShowRail').checked}});
async function restoreExtras(data){return workspaceTask(async()=>{
 if(!data.head_builder)return;validateBuilderExtras(data);const b=data.head_builder;colors={...b.palette};
 $('#seeInside').checked=b.see_inside;$('#headShowDock').checked=b.dock;$('#headShowRail').checked=b.rail;saveColors();changerDisplay();visibleBounds();fit();
});}

function appearance(){
 let protectedChanges=0;
 for(const promise of cached.values()){
  const asset=promise.loaded;if(!asset)continue;
  for(const row of asset.meshes){
   const printed=['base','accent'].includes(row.role);
   for(let i=0;i<row.materials.length;i++){
    const material=row.materials[i],original=row.originals[i];
    if(printed){material.color.set(colors[row.role]);material.metalness=0;material.roughness=.58;
     material.opacity=$('#seeInside').checked ? .18 : original.opacity;material.transparent=$('#seeInside').checked||original.transparent;
     material.depthWrite=!material.transparent;
    }else if(!material.color.equals(original.color))protectedChanges++;
   }
  }
 }
 for(const role of ['base','accent']){$('#'+role+'Color').value=colors[role];$('#'+role+'Hex').value=colors[role];$('#'+role+'Hex').removeAttribute('aria-invalid')}
 const matching=Object.entries(presets).find(([,p])=>p[0]===colors.base&&p[1]===colors.accent);
 $('#headPreset').value=matching?.[0]||'custom';
 bankRig?.setPalette(colors);
 const {base,accent,fixed,total}=headPrintedCounts([...cached.values()].map(p=>p.loaded));
 $('#headPaletteStatus').textContent=fixed?`ベース ${base}点 · アクセント ${accent}点 · 固定色の印刷部品 ${fixed}点`:`ベース ${base}点 · アクセント ${accent}点`;
 Object.assign($('#headPaletteStatus').dataset,{base:colors.base,accent:colors.accent,fixedPrinted:String(fixed),totalPrinted:String(total),protectedChanges:String(protectedChanges),transparent:String($('#seeInside').checked)});
 dirty=true;
}
function saveColors(){try{localStorage.setItem('3d-print-rig-head-palette',JSON.stringify(colors))}catch{}appearance()}
for(const role of ['base','accent']){
 $('#'+role+'Color').oninput=e=>{colors[role]=e.target.value;saveColors()};
 $('#'+role+'Hex').oninput=e=>{if(!validColor(e.target.value)){e.target.setAttribute('aria-invalid','true');return}colors[role]=e.target.value.toLowerCase();saveColors()};
 $('#'+role+'Hex').onchange=appearance;
}
$('#headPreset').onchange=e=>{const p=presets[e.target.value];if(p){colors={base:p[0],accent:p[1]};saveColors()}};
$('#seeInside').onchange=appearance;

async function asset(id){return workspaceTask(async()=>{
 if(cached.has(id))return cached.get(id);
 const spec=catalog.base_assets[id]||catalog.assets[id];if(!spec)throw Error('未登録のヘッドCAD: '+id);
 const loading=spec.external?loadExternalComponent(loader,spec,location.href).then(({meta,gltf,ledModelReceipt})=>[meta,gltf,ledModelReceipt]):Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('CAD部品表を取得できません');if(spec.metadata_sha256){const text=await r.text();if(await contentSHA256(text)!==spec.metadata_sha256)throw Error('Native head metadata hash mismatch');return JSON.parse(text)}return r.json()}),loadModel(loader,'../'+spec.glb,undefined,{ledSourceSpec:spec,ledCatalogId:id,...(spec.decoded_model_sha256?{verifySha256:spec.decoded_model_sha256}:{})})]);
 const promise=loading.then(async([meta,model,ledModelReceipt])=>{
  bindLedSource(model.scene,meta,spec,{catalogId:id,receipt:ledModelReceipt||model.ledModelReceipt});
  if(meta.eva_generation)applyEvaFrontSurfaces(model.scene,meta,spec.files['model.glb'].decoded_sha256,{...await loadEvaFrontSurfaces(loader,location.href),metadataSha256:spec.files['parts.json'].sha256});
  bindEvaMeshIdentities(meta,model.scene);const lookup=new Map(meta.parts.map(p=>[String(p.key),p])),root=model.scene,meshes=[];
  root.visible=false;
  root.traverse(mesh=>{if(!mesh.isMesh)return;
   const key=partKey(mesh),row=lookup.get(key);if(!row)throw Error('ヘッドの部品対応が不正です: '+key);const role=appearanceRole(row)||mesh.userData.appearance_role;
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials){material.side=THREE.DoubleSide;if(material.transparent)material.depthWrite=false}
   meshes.push({mesh,key,role,component:row.component,materials,originals:materials.map(m=>({opacity:m.opacity,transparent:m.transparent,color:m.color.clone()}))});
  });
 bench.add(root);const result={root,meshes,meta};promise.loaded=result;return result;
 }).catch(e=>{cached.delete(id);throw e});
 cached.set(id,promise);headCache.track(id,promise);return promise;
});}
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
function releaseInactiveHeads(retained){return headCache.commit(retained);}
function clearGuide(group){for(const child of [...group.children]){child.geometry?.dispose();for(const material of (Array.isArray(child.material)?child.material:[child.material]))material?.dispose();group.remove(child)}}
function inspection(variant){
 currentVariant=variant;const check=probeCheck(variant),guide=probeGuide(variant),p=variant.fit?.probe;
 $('#assemblyScope').hidden=!variant.display_scope;$('#assemblyScope').textContent=variant.display_scope||'';
 renderProductLinks($('#headProductLinks'),{hotend:variant.hotend,toolhead:variant.toolhead,extruder:variant.extruder});
 const inspection=headInspectionState(variant);
 $('#inspectionState').textContent=inspection.label;$('#inspectionState').dataset.state=inspection.state;$('#inspectionState').classList.toggle('notice',inspection.warning);
 $('#probeMetrics').replaceChildren(...probeMetrics(variant).flatMap(([label,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;return [dt,dd]}));
 const native=variant.fit?.complete_head_native;
 const notes=[...check.lines,...(native?.notes||[]),...headBodyCollisionNotes(native?.body_collisions),...headBodyCollisionNotes(native?.interface_contacts),...(variant.fit?.carriage_native_body_collisions||[]).map(c=>`${c.label}：交差体積 ${c.volume_mm3.toFixed(3)} mm³。ピンクの部分は元CADの交差形状。`)];if(!p&&!notes.length&&!variant.display_scope)notes.push('このキャリッジ・ホットエンドに登録済みのプローブから選択できます。未検証のマウントは表示しません。');
 if(variant.mount==='stealthchanger')notes.unshift('StealthChangerのOptoTap式プローブ機構を表示。スライダーでヘッド・バックプレートを一緒に0–3 mm動かせます。');
 if(p?.metal_keepout_verified===true&&!p.metal_keepout_collisions?.length)notes.push('基準姿勢の本体干渉・コイル高さ・金属除外領域を確認済み。');
 $('#inspectionNotes').replaceChildren(...notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li}));
 clearGuide(heightGuides);clearGuide(keepoutGuide);
 $('#showProbeHeights').disabled=!guide;$('#showKeepout').disabled=!guide?.keepout;
 $('#guideHint').textContent=guide?'青：ノズル接触面　緑（条件外は赤）：コイル底面。'+(guide.keepout?'橙：金属除外領域の外接枠。干渉判定には元のCAD形状を使用。':'付属基板の金属領域は未特定です。'):'';
 if(guide){
  for(const [center,color] of [[guide.nozzle,'#2685ba'],[guide.coil,check.state==='height-conflict'?'#c65336':'#29936a']]){
   const plane=new THREE.Mesh(new THREE.PlaneGeometry(.075,.065),new THREE.MeshBasicMaterial({color,opacity:.16,transparent:true,depthWrite:false,side:THREE.DoubleSide}));plane.rotation.x=-Math.PI/2;plane.position.copy(point(center));heightGuides.add(plane);
  }
  const [a,b]=guide.dimension,segments=[a,b,[a[0]-3,a[1],a[2]],[a[0]+3,a[1],a[2]],[b[0]-3,b[1],b[2]],[b[0]+3,b[1],b[2]]];
  const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments.map(point)),new THREE.LineBasicMaterial({color:check.state==='height-conflict'?'#c65336':'#218f65',depthTest:false}));line.renderOrder=10;heightGuides.add(line);
  if(guide.keepout){const [lo,hi]=guide.keepout,size=hi.map((n,i)=>(n-lo[i])*.001),center=hi.map((n,i)=>(n+lo[i])/2),geometry=new THREE.BoxGeometry(size[0],size[2],size[1]);
   const box=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#d88425',opacity:.12,transparent:true,depthWrite:false,side:THREE.DoubleSide}));box.position.copy(point(center));keepoutGuide.add(box);
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#b46c1c',transparent:true,opacity:.8}));edges.position.copy(box.position);keepoutGuide.add(edges);
  }
 }
 heightGuides.visible=!!guide&&$('#showProbeHeights').checked;keepoutGuide.visible=!!guide?.keepout&&$('#showKeepout').checked;dirty=true;
}
for(const id of ['showProbeHeights','showKeepout'])$('#'+id).onchange=()=>{if(currentVariant)inspection(currentVariant)};
function visibleBounds(){
 bench.position.set(0,0,0);bench.updateMatrixWorld(true);const box=new THREE.Box3();
 for(const p of cached.values()){const a=p.loaded;if(!a?.root.visible)continue;for(const r of a.meshes){if(!visibleInAsset(r.mesh,a.root))continue;r.mesh.geometry.computeBoundingBox();box.union(r.mesh.geometry.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld))}}
 if(box.isEmpty())throw Error('表示するヘッド部品がありません');
 if(bankRig){bankRig.bankRig.updateMatrixWorld(true);bankRig.bankRig.traverse(o=>{if(o.isMesh&&visibleInAsset(o,bankRig.bankRig))box.expandByObject(o)})}
 const center=box.getCenter(new THREE.Vector3());bench.position.copy(center).negate();bench.updateMatrixWorld(true);
 bounds=box.clone().translate(center.negate());
 const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);
 $('#headDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
 Object.assign($('#headDimensions').dataset,{widthMm:size.x,depthMm:size.z,heightMm:size.y});
}
function fit(next=view){
 view=next;const direction=view==='custom'?camera.position.clone().sub(controls.target).toArray():{iso:[1,.65,1.4],front:[0,0,1],back:[0,0,-1],side:[1,0,0],bottom:[0,-1,0]}[view]||[1,.65,1.4];
 if(view!=='custom')camera.up.set(...(view==='bottom'?[0,0,-1]:[0,1,0]));
 const insets={};if(stage.clientWidth<=680){
  const rect=stage.getBoundingClientRect(),top=stage.querySelector('.view-tools')?.getBoundingClientRect(),sponsor=stage.querySelector('.project-sponsor > summary')?.getBoundingClientRect(),meta=stage.querySelector('.view-meta')?.getBoundingClientRect();
  insets.top=Math.min(stage.clientHeight*.4,top?.height?top.bottom-rect.top+8:0);
  insets.bottom=Math.min(stage.clientHeight*.4,Math.max(...[sponsor,meta].filter(r=>r?.height).map(r=>rect.bottom-r.top+8),0));
 }
 frameHeadBounds(camera,controls,bounds,{direction,width:Math.max(stage.clientWidth,1),height:Math.max(stage.clientHeight,1),insets});
 for(const id of ['iso','front','back','side','bottom'])$('#'+id).setAttribute('aria-pressed',String(view===id));dirty=true;
}
for(const id of ['iso','front','back','side','bottom'])$('#'+id).onclick=()=>{if(ready)fit(id)};
$('#fit').onclick=()=>{if(ready){visibleBounds();fit()}};
async function install(variant){return workspaceTask(async()=>{
 const plan=headPlan(variant),ids=[plan.base,...plan.modules.map(m=>m.id),...(variant.inspection_module?[variant.inspection_module]:[])];
 $('#loading').hidden=false;$('#loading').textContent='選択したヘッドを読み込み中…';
 try{
  await toolBank?.install(variant);
  // Load before mutating visibility, so failures leave the installed head intact.
  await Promise.all(ids.map(asset));
  validateEvaMetadata(variant,(await asset(plan.base)).meta);
  for(const [id,p]of cached){const a=p.loaded;if(a){if(id==='stealthburner')setRapidoXUhfSurface(a.meshes,false);a.root.visible=false;for(const r of a.meshes)r.mesh.visible=true}}
  const base=await asset(plan.base);base.root.position.copy(point(headPlacement(variant,{translation_mm:plan.translation,role:'tool'})));base.root.visible=true;
  for(const r of base.meshes)r.mesh.visible=!plan.hidden.has(r.key);
  if(plan.base==='stealthburner')setRapidoXUhfSurface(base.meshes,variant.cover_source?.kind==='original_uhf');
  for(const module of plan.modules){const a=await asset(module.id),hidden=new Set(module.hidden_keys||[]);a.root.position.copy(point(module.translation_mm));a.root.visible=true;for(const r of a.meshes)r.mesh.visible=!hidden.has(r.key)}
  if(variant.inspection_module){const a=await asset(variant.inspection_module);a.root.position.set(0,0,0);a.root.visible=true;for(const row of a.meshes){row.mesh.renderOrder=20;for(const material of row.materials){material.depthTest=false;material.depthWrite=false;material.transparent=true;material.opacity=.82}}}
  currentVariant=variant;$('#headProbeTravel').value=0;$('#headExplode').value=0;
 $('#changerControls').hidden=!['stealthchanger','tapchanger','madmax'].includes(variant.mount);$('#headProbeTravel').disabled=variant.mount!=='stealthchanger';$('#headExplode').disabled=variant.mount!=='stealthchanger';changerDisplay();
  appearance();inspection(variant);visibleBounds();ready=true;fit();
  const count=[plan.base,...plan.modules.map(m=>m.id)].reduce((n,id)=>{const a=cached.get(id).loaded;return n+(a.root.visible?a.meshes.filter(r=>r.mesh.visible).length:0)},0);
  Object.assign(document.body.dataset,{variant:variant.id,headParts:String(count),headAssets:JSON.stringify(ids),assetStatus:'ready'});
  const link=headPrinterLink(variant,machineRegistry,location.href);$('#printerLink').href=link.url;$('#printerLink').hidden=false;$('#printerLink').textContent=link.registered?'プリンターで表示':'マシン一覧（取付CAD未登録）';
  releaseInactiveHeads(ids);
 }finally{$('#loading').hidden=true}
});}
function changerDisplay(){
 if(!currentVariant)return;const v=currentVariant,plan=headPlan(v),state={probe:$('#headProbeTravel').value,explode:$('#headExplode').value};
 $('#headProbeValue').textContent=Number(state.probe).toFixed(1)+' mm';
 const base=cached.get(plan.base)?.loaded;if(base)base.root.position.copy(point(headPlacement(v,{translation_mm:plan.translation,role:'tool'},state)));
 if(base)for(const row of base.meshes){if(row.component==='dock')row.mesh.visible=$('#headShowDock').checked&&!plan.hidden.has(row.key);if(row.component==='shuttle_reference')row.mesh.visible=$('#headShowRail').checked}
 for(const entry of plan.modules){const a=cached.get(entry.id)?.loaded;if(!a)continue;
  a.root.position.copy(point(headPlacement(v,entry,state)));a.root.visible=entry.role!=='dock'||$('#headShowDock').checked;
  for(const row of a.meshes)if(row.component==='rail_reference')row.mesh.visible=$('#headShowRail').checked;
 }
 builder?.update();dirty=true;
}
for(const id of ['headProbeTravel','headExplode'])$('#'+id).oninput=changerDisplay;
for(const id of ['headShowDock','headShowRail'])$('#'+id).onchange=()=>{changerDisplay();if(ready){visibleBounds();fit()}};
function resize(){const width=Math.max(stage.clientWidth,1),height=Math.max(stage.clientHeight,1);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(ready)fit();dirty=true}
new WorkspaceResizeObserver(resize).observe(stage);resize();
controls.addEventListener('start',()=>{view='custom'});controls.addEventListener('change',()=>{dirty=true});
const renderBounds=new THREE.Box3();
function prepareHeadCamera(renderCamera){
 if(!ready)return;
 bench.updateWorldMatrix(true,true);renderBounds.makeEmpty();
 bench.traverseVisible(object=>{if(object.isMesh)renderBounds.expandByObject(object)});
 updateHeadClipping(renderCamera,renderBounds);
}
renderer.setAnimationLoop(()=>{controls.update();if(dirty){prepareHeadCamera(camera);renderer.render(scene,camera);dirty=false}});
setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Toolhead',prepareCamera:prepareHeadCamera,afterRender:()=>{dirty=true}});
setupPublicInfo({includeDownloads:false});
try{
 const headData=await loadMachineHeadCatalog();catalog=headData.heads;machineRegistry=headData.registry;const monolithData=await loadMonolithData().catch(()=>null);if(monolithData){const [gantries,registrations]=monolithData;machineRegistry.monolith={gantries,registrations}}
 $('#combinationCount').textContent=`${catalog.toolheads.length}種類のヘッド · ${catalog.extruders.length}種類の押出機 · ${headCombinationCount(catalog)}通りのヘッド構成`;
 // Earlier standalone files used the first printer's ID; keep them readable.
 catalog={...catalog,dimensions:headBuilderDimensions,machine_id:'toolhead',import_machine_ids:['siboor_trident_350']};
 const bankCatalog={...catalog,bank_data:headData.bank,variants:catalog.variants.map(v=>{const p=headPlan(v);return {...v,machine_head:{base:p.base,translation:p.translation,translation_delta_mm:[0,0,0],hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}}})};
 bankRig=createMachineHeads(bench,bankCatalog,{render:()=>{dirty=true}});bankRig.setVisible(false);
 const bankAdapter={get active(){return bankRig.active},async install(v,state){return workspaceTask(async()=>{await bankRig.install(state?.enabled?bankCatalog.variants.find(p=>p.id===v.id):null,state)});},async setBank(state){return workspaceTask(async()=>{await bankRig.setBank(state)});}};
 toolBank=setupChangerBank({before:$('#assemblyScope'),catalog:bankCatalog,rig:bankAdapter,data:headData.bank,extras:{presentation:'toolhead',getExtras:extras,applyExtras:restoreExtras,validateExtras:validateBuilderExtras,onSettled:()=>{builder?.update();if(ready){appearance();visibleBounds();fit()}}}});
 const controller=await setupConfigurations(catalog,install,toolBank.options);await toolBank.bind(controller);
 if(!ready)throw Error('ヘッドのCADを表示できませんでした');
 let pins=[];try{const r=await fetch('../PUBLIC_CATALOG.json?v=6ea4b81efa79fcbe691f');if(r.ok)pins=(await r.json()).sources||[]}catch{}
 builder=setupHeadBuilder(catalog,{getVariant:()=>currentVariant,getMetadata:()=>new Map([...cached].filter(([,p])=>p.loaded).map(([id,p])=>[id,p.loaded.meta])),getExtras:()=>toolBank.options.getExtras(),pins,selectVariant:id=>controller.selectVariant(id),isBusy:()=>controller.busy});
 setupSurfaceStep({button:$('#buildSurfaceStep'),scope,isBusy:()=>controller.busy,getSnapshot:()=>({cached,bench,THREE,catalog,href:location.href,configuration:currentVariant.id,bankEnabled:toolBank.options.getExtras().tool_bank?.enabled===true})});
}catch(e){$('#loading').hidden=false;$('#loading').textContent=e.message;document.body.dataset.assetStatus='error';console.error(e)}

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
