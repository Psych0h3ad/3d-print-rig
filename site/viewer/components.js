import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=bundle-v2';
import {setupPublicInfo} from './public-info.js?v=mounts-v5';
import {setupRenderExport} from './render-export.js?v=public-v5';
const $=s=>document.querySelector(s),stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#edf1f5');renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.0001,20),controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const p of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...p);scene.add(light)}
const cached=new Map();let catalog,current,busy=false,view='iso',dirty=true;
function fit(){if(!current)return;const box=new THREE.Box3().setFromObject(current),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());controls.target.copy(center);
 const distance=Math.max(size.x,size.y,size.z)/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/camera.aspect)*.8;
 const direction=new THREE.Vector3(...({iso:[1,.65,1.2],front:[0,0,1],side:[1,0,0]}[view])).normalize();camera.position.copy(center).addScaledVector(direction,distance);controls.minDistance=Math.max(.005,distance/15);controls.maxDistance=Math.max(.3,distance*10);controls.update();dirty=true;
 $('#dimensions').textContent=`表示外寸 ${(size.x*1000).toFixed(1)} × ${(size.z*1000).toFixed(1)} × ${(size.y*1000).toFixed(1)} mm`;
}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();fit();dirty=true}
new ResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
const paragraph=text=>{const p=document.createElement('p');p.textContent=text;return p};
async function install(id){if(busy)return;const item=catalog.items.find(p=>p.id===id);if(!item)throw Error('未登録の部品です');busy=true;$('#component').disabled=true;$('#loading').hidden=false;
 try{const spec=catalog.assets[item.module];if(!cached.has(item.module)){const g=await loadModel(new GLTFLoader(),'../'+spec.glb);g.scene.visible=false;g.scene.traverse(m=>{if(m.isMesh){m.material=m.material.clone();m.material.side=THREE.DoubleSide}});scene.add(g.scene);cached.set(item.module,g.scene)}
  if(current)current.visible=false;current=cached.get(item.module);current.visible=true;$('#component').value=item.id;fit();
  const details=$('#componentDetails');details.replaceChildren(paragraph(item.manufacturer),paragraph(`${item.solids}ソリッド · ${item.source_version}`));
  if(item.source_extents_mm)details.append(paragraph('原本XYZ外寸：'+item.source_extents_mm.map(v=>v.toFixed(2)).join(' × ')+' mm'));
  if(item.source_commit)details.append(paragraph('取得commit：'+item.source_commit));details.append(paragraph('SHA256：'+item.source_sha256),paragraph(item.license));
  for(const [label,url] of [['原本の配布元',item.source_url],['配布条件',item.license_url]])if(url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener';details.append(a,document.createTextNode('　'))}
  $('#componentScope').textContent=item.notes;$('#componentStatus').textContent=item.label+' · 部品単体';$('#loading').hidden=true;
  const url=new URL(location.href);url.searchParams.set('component',item.id);history.replaceState(null,'',url);document.body.dataset.component=item.id;document.body.dataset.ready='true';dirty=true;
 }catch(e){$('#loading').textContent=e.message;$('#componentStatus').textContent='読込に失敗しました';console.error(e)}finally{busy=false;$('#component').disabled=false}
}
for(const id of ['iso','front','side'])$('#'+id).onclick=()=>{view=id;fit()};$('#fit').onclick=fit;
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,name:'3D_Print_Rig_Component',afterRender:()=>{dirty=true}});
try{const r=await fetch('../COMPONENT_LIBRARY.json',{cache:'no-cache'});if(!r.ok)throw Error('部品カタログを取得できません');catalog=await r.json();
 for(const [kind,label] of [['hotend','ホットエンド'],['extruder','押出機'],['electronics','基板'],['carriage','キャリッジ / ベルトクランプ'],['gantry','ガントリー']]){const group=document.createElement('optgroup');group.label=label;for(const item of catalog.items.filter(p=>p.kind===kind)){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;group.append(option)}$('#component').append(group)}
 $('#component').onchange=e=>install(e.target.value);const wanted=new URLSearchParams(location.search).get('component');await install(catalog.items.some(p=>p.id===wanted)?wanted:catalog.items[0].id);
}catch(e){$('#loading').textContent=e.message;console.error(e)}resize();
