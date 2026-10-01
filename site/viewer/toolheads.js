import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=bundle-v2';
import {setupConfigurations} from './configurations.js?v=mounts-v5';
import {setupPublicInfo} from './public-info.js?v=mounts-v5';
import {setupRenderExport} from './render-export.js';
import {headPlan,partKey,headCombinationCount} from './head-assembly.js';

const $=s=>document.querySelector(s),stage=$('#stage'),scene=new THREE.Scene();
scene.background=new THREE.Color('#edf1f5');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,1,.0005,5);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=.025;controls.maxDistance=1.5;
camera.position.set(.2,.14,.25);
scene.add(new THREE.HemisphereLight('#ffffff','#687781',2.3));
for(const [position,intensity] of [[[.4,.6,.6],2.6],[[-.4,.2,-.3],1.8]]){
 const light=new THREE.DirectionalLight('#ffffff',intensity);light.position.set(...position);scene.add(light);
}
const bench=new THREE.Group();scene.add(bench);
const loader=new GLTFLoader(),cached=new Map();
let catalog,dirty=true,view='iso',bounds=new THREE.Box3(),ready=false;
const presets={black_red:['#24272c','#e32636'],white_teal:['#f0f1ed','#008f95'],ivory_orange:['#e9dfca','#f07824'],purple:['#30343b','#9d5ce2']};
let colors={base:'#24272c',accent:'#e32636'};
const validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/iu.test(c);
try{const saved=JSON.parse(localStorage.getItem('3d-print-rig-head-palette')||'null');if(validColor(saved?.base)&&validColor(saved?.accent))colors=saved}catch{}

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

async function asset(id){
 if(cached.has(id))return cached.get(id);
 const spec=catalog.base_assets[id]||catalog.assets[id];if(!spec)throw Error('未登録のヘッドCAD: '+id);
 const promise=Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('CAD部品表を取得できません');return r.json()}),loadModel(loader,'../'+spec.glb)]).then(([meta,model])=>{
  const lookup=new Map(meta.parts.map(p=>[p.key,p])),root=model.scene,meshes=[];
  root.visible=false;bench.add(root);
  root.traverse(mesh=>{if(!mesh.isMesh)return;
   const key=partKey(mesh),role=lookup.get(key)?.appearance_role||mesh.userData.appearance_role;
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials){material.side=THREE.DoubleSide;if(material.transparent)material.depthWrite=false}
   meshes.push({mesh,key,role,materials,originals:materials.map(m=>({opacity:m.opacity,transparent:m.transparent,color:m.color.clone()}))});
  });
  const result={root,meshes};promise.loaded=result;return result;
 }).catch(e=>{cached.delete(id);throw e});
 cached.set(id,promise);return promise;
}
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
function visibleBounds(){
 bench.position.set(0,0,0);bench.updateMatrixWorld(true);const box=new THREE.Box3();
 for(const p of cached.values()){const a=p.loaded;if(!a?.root.visible)continue;for(const r of a.meshes){if(!r.mesh.visible)continue;r.mesh.geometry.computeBoundingBox();box.union(r.mesh.geometry.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld))}}
 if(box.isEmpty())throw Error('表示するヘッド部品がありません');
 const center=box.getCenter(new THREE.Vector3());bench.position.copy(center).negate();bench.updateMatrixWorld(true);
 bounds=box.clone().translate(center.negate());
 const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);
 $('#headDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
 Object.assign($('#headDimensions').dataset,{widthMm:size.x,depthMm:size.z,heightMm:size.y});
}
function fit(next=view){
 view=next;const direction={iso:[1,.65,1.4],front:[0,0,1],back:[0,0,-1],side:[1,0,0]}[view]||[1,.65,1.4];
 const fov=THREE.MathUtils.degToRad(camera.fov),horizontal=2*Math.atan(Math.tan(fov/2)*camera.aspect);
 const distance=bounds.getSize(new THREE.Vector3()).length()/2/Math.sin(Math.min(fov,horizontal)/2)*1.12;
 camera.up.set(0,1,0);camera.position.fromArray(direction).normalize().multiplyScalar(distance);controls.target.set(0,0,0);controls.update();
 for(const id of ['iso','front','back','side'])$('#'+id).setAttribute('aria-pressed',String(view===id));dirty=true;
}
for(const id of ['iso','front','back','side'])$('#'+id).onclick=()=>{if(ready)fit(id)};
$('#fit').onclick=()=>{if(ready)fit()};
async function install(variant){
 const plan=headPlan(variant),ids=[plan.base,...plan.modules.map(m=>m.id)];
 $('#loading').hidden=false;$('#loading').textContent='選択したヘッドを読み込み中…';
 try{
  // Load before mutating visibility, so failures leave the installed head intact.
  await Promise.all(ids.map(asset));
  for(const p of cached.values()){const a=p.loaded;if(a){a.root.visible=false;for(const r of a.meshes)r.mesh.visible=true}}
  const base=await asset(plan.base);base.root.position.copy(point(plan.translation));base.root.visible=true;
  for(const r of base.meshes)r.mesh.visible=!plan.hidden.has(r.key);
  for(const module of plan.modules){const a=await asset(module.id),hidden=new Set(module.hidden_keys||[]);a.root.position.copy(point(module.translation_mm));a.root.visible=true;for(const r of a.meshes)r.mesh.visible=!hidden.has(r.key)}
  appearance();visibleBounds();ready=true;fit();
  const count=ids.reduce((n,id)=>n+cached.get(id).loaded.meshes.filter(r=>r.mesh.visible).length,0);
  Object.assign(document.body.dataset,{variant:variant.id,headParts:String(count),headAssets:JSON.stringify(ids),assetStatus:'ready'});
  const link=new URL('./',location.href);link.searchParams.set('configuration',variant.id);$('#printerLink').href=link;
 }finally{$('#loading').hidden=true}
}
function resize(){const width=Math.max(stage.clientWidth,1),height=Math.max(stage.clientHeight,1);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(ready)fit();dirty=true}
new ResizeObserver(resize).observe(stage);resize();
controls.addEventListener('change',()=>{dirty=true});
renderer.setAnimationLoop(()=>{controls.update();if(dirty){renderer.render(scene,camera);dirty=false}});
setupRenderExport({renderer,scene,camera,name:'3D_Print_Rig_Toolhead',afterRender:()=>{dirty=true}});
setupPublicInfo({includeDownloads:false});
try{
 const response=await fetch('../TOOLHEAD_CONFIGURATIONS.json',{cache:'no-cache'});if(!response.ok)throw Error('ヘッドの構成データを取得できません');catalog=await response.json();
 $('#combinationCount').textContent=`SB / Xol · ${headCombinationCount(catalog)}通りのヘッド構成 · 6 / 9 mmキャリッジ`;
 await setupConfigurations(catalog,install,{presentation:'toolhead'});
 if(!ready)throw Error('ヘッドのCADを表示できませんでした');
}catch(e){$('#loading').hidden=false;$('#loading').textContent=e.message;document.body.dataset.assetStatus='error';console.error(e)}
