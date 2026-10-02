import {appearanceRole} from './appearance-role.mjs?v=public-v18';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=public-v18';
import {setupPublicInfo} from './public-info.js?v=public-v18';
import {setupRenderExport} from './render-export.js?v=public-v18';
import {changerDimensions,changerChoice,changerChoices,changerPlacement} from './toolchanger-model.js?v=public-v18';
const $=s=>document.querySelector(s),stage=$('#stage'),scene=new THREE.Scene(),bench=new THREE.Group();scene.add(bench);scene.background=new THREE.Color('#edf1f5');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,1,.0001,20),controls=new OrbitControls(camera,renderer.domElement);scene.add(new THREE.HemisphereLight('#ffffff','#687781',2.4));
for(const p of [[.8,1,.7],[-.5,.3,-.6]]){const l=new THREE.DirectionalLight('#ffffff',2);l.position.set(...p);scene.add(l)}
const grid=new THREE.GridHelper(1.2,24,'#8b9ca8','#c9d2d8');grid.position.y=-.08;grid.visible=false;scene.add(grid);
const cached=new Map(),loader=new GLTFLoader();let catalog,actual,busy=false,dirty=true,view='iso',box=new THREE.Box3();
const labels={stealthchanger:'StealthChanger V1.1',tapchanger:'TapChanger',standard_6:'通常経路 / 6 mm',standard_9:'通常経路 / 9 mm · BT123 Split Keeper',monolith_6:'Monolith反転 / 6 mm · 専用Keeper',monolith_9:'Monolith反転 / 9 mm · 専用Keeper',source:'原本の機構別構成',stealthburner:'Stealthburner',xol:'Xol',a4t:'A4T',anthead:'Anthead',blackbird:'BlackBird',dragonburner:'Dragon Burner',jabberwocky:'JabberWocky',rapidburner:'Rapid Burner',yavoth:'Yavoth'};
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
async function asset(id){
 if(cached.has(id))return cached.get(id);const spec=catalog.assets[id];if(!spec)throw Error('未登録のCADです');
 const promise=Promise.all([fetch('../'+spec.meta).then(r=>{if(!r.ok)throw Error('部品表を取得できません');return r.json()}),loadModel(loader,'../'+spec.glb)]).then(([meta,g])=>{
  const root=g.scene,lookup=new Map(meta.parts.map(p=>[p.key,p])),meshes=[];root.visible=false;
  root.traverse(m=>{if(!m.isMesh)return;m.material=m.material.clone();m.material.side=THREE.DoubleSide;const row=lookup.get(m.userData.part_key||m.name);meshes.push({mesh:m,row})});bench.add(root);promise.loaded={root,meshes,meta};return promise.loaded;
 }).catch(e=>{cached.delete(id);throw e});cached.set(id,promise);return promise;
}
function appearance(){for(const p of cached.values())for(const {mesh,row} of p.loaded?.meshes||[]){const role=appearanceRole(row);if(['base','accent'].includes(role))mesh.material.color.set($('#'+role).value)}grid.visible=$('#grid').checked;dirty=true}
function place(){if(!actual)return;box=new THREE.Box3();for(const e of actual.modules){const a=cached.get(e.id)?.loaded;if(!a)continue;a.root.position.copy(point(changerPlacement(actual,e,{probe:+$('#probeTravel').value,explode:+$('#explode').value})));a.root.visible=e.role!=='dock'||$('#showDock').checked;for(const {mesh,row} of a.meshes)mesh.visible=row?.component!=='rail_reference'||$('#showRail').checked;a.root.updateMatrixWorld(true);if(a.root.visible)for(const {mesh} of a.meshes)if(mesh.visible){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))}}$('#probeValue').textContent=`${$('#probeTravel').value} mm`;dirty=true}
function fit(){if(!actual||box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());controls.target.copy(center);const fov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(fov/2)*camera.aspect),distance=size.length()/2/Math.sin(Math.min(fov,hfov)/2)*1.08;camera.up.set(0,1,0);camera.position.copy(center).addScaledVector(new THREE.Vector3(...({iso:[1,.8,1.2],front:[0,0,1],back:[0,0,-1],side:[1,0,0]}[view])).normalize(),distance);controls.minDistance=.025;controls.maxDistance=5;controls.update();dirty=true}
for(const id of ['base','accent','grid'])$('#'+id).oninput=appearance;
for(const id of ['probeTravel','explode'])$('#'+id).oninput=()=>{place()};for(const id of ['showDock','showRail'])$('#'+id).onchange=()=>{place();fit()};
for(const id of ['iso','front','back','side'])$('#'+id).onclick=()=>{view=id;fit()};$('#fit').onclick=()=>{place();fit()};
function menus(v){for(const k of changerDimensions){const s=$('#'+k);s.replaceChildren(...changerChoices(catalog,v,k).map(id=>{const o=document.createElement('option');o.value=id;o.textContent=labels[id]||catalog.variants.find(x=>x.system===v.system&&x.toolhead===id)?.label||id;return o}));s.value=v[k]}}
async function install(v){
 if(busy)return;busy=true;for(const k of changerDimensions)$('#'+k).disabled=true;$('#loading').hidden=false;$('#loading').textContent='選択した交換機構を読み込み中…';
 try{
  await Promise.all(v.modules.map(e=>asset(e.id)));for(const p of cached.values())if(p.loaded)p.loaded.root.visible=false;actual=v;$('#probeTravel').value='0';$('#explode').value='0';$('#probeTravel').disabled=!v.probe_travel_mm;$('#explode').disabled=!v.modules.some(m=>m.role==='tool');$('#showDock').disabled=!v.modules.some(m=>m.role==='dock');menus(v);place();appearance();fit();
  $('#showRail').disabled=!v.modules.some(e=>cached.get(e.id)?.loaded.meta.parts.some(p=>p.component==='rail_reference'));
  const check=v.native_fit;$('#changerStatus').textContent=`${v.parts.toLocaleString()}部品 · ${check?.passed===true?'CAD接続部を確認済み':check?.passed===false?'接続部に干渉あり':check?.scope==='source_reference'?'原本ソリッドを確認済み':'原本構成'}`;$('#changerStatus').classList.toggle('notice',check?.passed===false);
  const facts=[['構成数',`${catalog.variants.length}構成`],['取付参照',v.system==='stealthchanger'?'MGN12 / 原本寸法':'原本の機構・寸法'],['Z変位',v.probe_travel_mm?`${v.probe_travel_mm[1]} mmの接続部検証`:'可動検証未登録']];$('#changerSpec').replaceChildren(...facts.flatMap(([k,t])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=t;return [dt,dd]}));
  const notes=[...v.notes,...(check?.collisions||[]).map(c=>`${c.label}：交差体積 ${c.volume_mm3.toFixed(3)} mm³`)];$('#changerNotes').replaceChildren(...notes.map(t=>{const li=document.createElement('li');li.textContent=t;return li}));const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);$('#changerDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
  const u=new URL(location.href);u.searchParams.set('changer',v.id);history.replaceState(null,'',u);document.body.dataset.changer=v.id;document.body.dataset.ready='true';$('#loading').hidden=true;
 }catch(e){$('#loading').textContent=e.message;$('#changerStatus').textContent='切替に失敗しました';console.error(e)}finally{busy=false;for(const k of changerDimensions)$('#'+k).disabled=false}
}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(Math.max(b.width,1),Math.max(b.height,1));camera.aspect=Math.max(b.width,1)/Math.max(b.height,1);camera.updateProjectionMatrix();fit();dirty=true}new ResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Toolchanger',afterRender:()=>{dirty=true}});
try{const r=await fetch('../TOOLCHANGER_CONFIGURATIONS.json?v=public-v18',{cache:'no-cache'});if(!r.ok)throw Error('交換機構カタログを取得できません');catalog=await r.json();for(const k of changerDimensions)$('#'+k).onchange=()=>install(changerChoice(catalog,Object.fromEntries(changerDimensions.map(k=>[k,$('#'+k).value])),k));for(const s of catalog.sources){const a=document.createElement('a');a.textContent=s.repository+' · '+s.commit.slice(0,12);a.href=s.url+'/tree/'+s.commit;a.target='_blank';a.rel='noopener';$('#changerSources').append(a,document.createElement('br'))}const wanted=new URLSearchParams(location.search).get('changer');await install(catalog.variants.find(v=>v.id===wanted)||catalog.variants.find(v=>v.id==='stealthchanger_standard_6_stealthburner')||catalog.variants[0])}catch(e){$('#loading').textContent=e.message;console.error(e)}resize();
