import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {loadMonolithData} from './monolith-machine.js?v=cf5ef833e4c9007348b4';
import {setupChangerBank} from './changer-bank.js?v=47bbc0fef91af2c7241e';
import {createMachineHeads,loadMachineHeadCatalog} from './machine-heads.js?v=7b5352d585f32ae03866';
import {headPrinterLink} from './head-navigation.mjs?v=c420917f22924e238430';
import {headBuilderDimensions} from './configuration-model.js?v=d4b3dda97a404a7575b7';
import {appearanceRole} from './appearance-role.mjs?v=6b7b8efda77bfc3ce74d';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {setupConfigurations} from './configurations.js?v=69f91a752d2fe88547b1';
import {setupPublicInfo} from './public-info.js?v=13988d3956b89c9920dd';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {headPlan,headPlacement,partKey,headCombinationCount} from './head-assembly.js?v=workspace-belts-1';
import {probeCheck,probeMetrics,probeGuide,headInspectionState,headBodyCollisionNotes} from './probe-checks.js?v=ea1aef3e30bf7d11d3cb';
import {renderProductLinks} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {setupHeadBuilder} from './builder-ui.mjs?v=a7bf28d48428bed0219b';
import {validateBuilderExtras} from './toolhead-builder.mjs?v=68d8003cdc690265cff2';
import {loadExternalComponent} from './component-assets.mjs?v=c2333ef499f46d621550';
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
 let base=0,accent=0,protectedChanges=0;
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
   if(printed&&asset.root.visible&&row.mesh.visible){if(row.role==='base')base++;else accent++}
  }
 }
 for(const role of ['base','accent']){$('#'+role+'Color').value=colors[role];$('#'+role+'Hex').value=colors[role];$('#'+role+'Hex').removeAttribute('aria-invalid')}
 const matching=Object.entries(presets).find(([,p])=>p[0]===colors.base&&p[1]===colors.accent);
 $('#headPreset').value=matching?.[0]||'custom';
 bankRig?.setPalette(colors);
 $('#headPaletteStatus').textContent=`ベース ${base}点 · アクセント ${accent}点`;
 Object.assign($('#headPaletteStatus').dataset,{base:colors.base,accent:colors.accent,protectedChanges:String(protectedChanges),transparent:String($('#seeInside').checked)});
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
 const loading=spec.external?loadExternalComponent(loader,spec,location.href).then(({meta,gltf})=>[meta,gltf]):Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('CAD部品表を取得できません');return r.json()}),loadModel(loader,'../'+spec.glb)]);
 const promise=loading.then(([meta,model])=>{
  const lookup=new Map(meta.parts.map(p=>[p.key,p])),root=model.scene,meshes=[];
  root.visible=false;bench.add(root);
  root.traverse(mesh=>{if(!mesh.isMesh)return;
   const key=partKey(mesh),role=appearanceRole(lookup.get(key))||mesh.userData.appearance_role;
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials){material.side=THREE.DoubleSide;if(material.transparent)material.depthWrite=false}
   meshes.push({mesh,key,role,component:lookup.get(key)?.component,materials,originals:materials.map(m=>({opacity:m.opacity,transparent:m.transparent,color:m.color.clone()}))});
  });
 const result={root,meshes,meta};promise.loaded=result;return result;
 }).catch(e=>{cached.delete(id);throw e});
 cached.set(id,promise);return promise;
});}
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
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
 for(const p of cached.values()){const a=p.loaded;if(!a?.root.visible)continue;for(const r of a.meshes){if(!r.mesh.visible)continue;r.mesh.geometry.computeBoundingBox();box.union(r.mesh.geometry.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld))}}
 if(box.isEmpty())throw Error('表示するヘッド部品がありません');
 if(bankRig){bankRig.bankRig.updateMatrixWorld(true);bankRig.bankRig.traverse(o=>{if(o.isMesh&&o.visible)box.expandByObject(o)})}
 const center=box.getCenter(new THREE.Vector3());bench.position.copy(center).negate();bench.updateMatrixWorld(true);
 bounds=box.clone().translate(center.negate());
 const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);
 $('#headDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
 Object.assign($('#headDimensions').dataset,{widthMm:size.x,depthMm:size.z,heightMm:size.y});
}
function fit(next=view){
 view=next;const direction=view==='custom'?camera.position.clone().sub(controls.target).toArray():{iso:[1,.65,1.4],front:[0,0,1],back:[0,0,-1],side:[1,0,0],bottom:[0,-1,0]}[view]||[1,.65,1.4];
 const fov=THREE.MathUtils.degToRad(camera.fov),horizontal=2*Math.atan(Math.tan(fov/2)*camera.aspect);
 const distance=bounds.getSize(new THREE.Vector3()).length()/2/Math.sin(Math.min(fov,horizontal)/2)*1.12;
 if(view!=='custom')camera.up.set(...(view==='bottom'?[0,0,-1]:[0,1,0]));camera.position.fromArray(direction).normalize().multiplyScalar(distance);controls.target.set(0,0,0);controls.update();
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
  for(const p of cached.values()){const a=p.loaded;if(a){a.root.visible=false;for(const r of a.meshes)r.mesh.visible=true}}
  const base=await asset(plan.base);base.root.position.copy(point(headPlacement(variant,{translation_mm:plan.translation,role:'tool'})));base.root.visible=true;
  for(const r of base.meshes)r.mesh.visible=!plan.hidden.has(r.key);
  for(const module of plan.modules){const a=await asset(module.id),hidden=new Set(module.hidden_keys||[]);a.root.position.copy(point(module.translation_mm));a.root.visible=true;for(const r of a.meshes)r.mesh.visible=!hidden.has(r.key)}
  if(variant.inspection_module){const a=await asset(variant.inspection_module);a.root.position.set(0,0,0);a.root.visible=true;for(const row of a.meshes){row.mesh.renderOrder=20;for(const material of row.materials){material.depthTest=false;material.depthWrite=false;material.transparent=true;material.opacity=.82}}}
  currentVariant=variant;$('#headProbeTravel').value=0;$('#headExplode').value=0;
 $('#changerControls').hidden=!['stealthchanger','tapchanger','madmax'].includes(variant.mount);$('#headProbeTravel').disabled=variant.mount!=='stealthchanger';$('#headExplode').disabled=variant.mount!=='stealthchanger';changerDisplay();
  appearance();inspection(variant);visibleBounds();ready=true;fit();
  const count=[plan.base,...plan.modules.map(m=>m.id)].reduce((n,id)=>{const a=cached.get(id).loaded;return n+(a.root.visible?a.meshes.filter(r=>r.mesh.visible).length:0)},0);
  Object.assign(document.body.dataset,{variant:variant.id,headParts:String(count),headAssets:JSON.stringify(ids),assetStatus:'ready'});
  const link=headPrinterLink(variant,machineRegistry,location.href);$('#printerLink').href=link.url;$('#printerLink').hidden=false;$('#printerLink').textContent=link.registered?'この構成をプリンターで見る':'マシン一覧（取付CAD未登録）';
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
renderer.setAnimationLoop(()=>{controls.update();if(dirty){renderer.render(scene,camera);dirty=false}});
setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Toolhead',afterRender:()=>{dirty=true}});
setupPublicInfo({includeDownloads:false});
try{
 const headData=await loadMachineHeadCatalog();catalog=headData.heads;machineRegistry=headData.registry;const monolithData=await loadMonolithData().catch(()=>null);if(monolithData){const [gantries,registrations]=monolithData;machineRegistry.monolith={gantries,registrations}}
 $('#combinationCount').textContent=`${catalog.toolheads.length}種類のヘッド · ${catalog.extruders.length}種類の押出機 · ${headCombinationCount(catalog)}通りのヘッド構成`;
 // Earlier standalone files used the first printer's ID; keep them readable.
 catalog={...catalog,dimensions:headBuilderDimensions,machine_id:'toolhead',import_machine_ids:['siboor_trident_350']};
 const bankCatalog={...catalog,bank_data:headData.bank,variants:catalog.variants.map(v=>{const p=headPlan(v);return {...v,machine_head:{base:p.base,translation:p.translation,translation_delta_mm:[0,0,0],hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}}})};
 bankRig=createMachineHeads(bench,bankCatalog,{render:()=>{dirty=true}});bankRig.setVisible(false);
 const bankAdapter={get active(){return bankRig.active},async install(v,state){return workspaceTask(async()=>{await bankRig.install(bankCatalog.variants.find(p=>p.id===v.id),state)});},async setBank(state){return workspaceTask(async()=>{await bankRig.setBank(state)});}};
 toolBank=setupChangerBank({before:$('#assemblyScope'),catalog:bankCatalog,rig:bankAdapter,data:headData.bank,extras:{presentation:'toolhead',getExtras:extras,applyExtras:restoreExtras,validateExtras:validateBuilderExtras,onSettled:()=>{builder?.update();if(ready){appearance();visibleBounds();fit()}}}});
 const controller=await setupConfigurations(catalog,install,toolBank.options);await toolBank.bind(controller);
 if(!ready)throw Error('ヘッドのCADを表示できませんでした');
 let pins=[];try{const r=await fetch('../PUBLIC_CATALOG.json?v=ec7f5797d14adef9d029');if(r.ok)pins=(await r.json()).sources||[]}catch{}
 builder=setupHeadBuilder(catalog,{getVariant:()=>currentVariant,getMetadata:()=>new Map([...cached].filter(([,p])=>p.loaded).map(([id,p])=>[id,p.loaded.meta])),getExtras:()=>toolBank.options.getExtras(),pins,selectVariant:id=>controller.selectVariant(id),isBusy:()=>controller.busy});
}catch(e){$('#loading').hidden=false;$('#loading').textContent=e.message;document.body.dataset.assetStatus='error';console.error(e)}

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
