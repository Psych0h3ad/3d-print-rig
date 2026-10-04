import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=extra-machines-55';
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceTask,WorkspaceResizeObserver} from './workspace-lifecycle.mjs';
import {setResponsiveAspect} from './responsive-camera.mjs?v=workspace-belts-1';
import {appearanceRole} from './appearance-role.mjs?v=workspace-belts-1';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js?v=workspace-belts-1';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=workspace-belts-1';
import {setupPublicInfo} from './public-info.js?v=workspace-belts-2';
import {setupRenderExport} from './render-export.js?v=workspace-belts-2';
import {changerDimensions,changerChoice,changerChoices,changerPlacement} from './toolchanger-model.js?v=workspace-belts-1';
export async function mount(scope){
const $=s=>document.querySelector(s),stage=$('#stage'),scene=scope.scene(new THREE.Scene()),bench=new THREE.Group();scene.add(bench);scene.background=new THREE.Color('#edf1f5');
const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,1,.0001,20),controls=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#687781',2.4));
for(const p of [[.8,1,.7],[-.5,.3,-.6]]){const l=new THREE.DirectionalLight('#ffffff',2);l.position.set(...p);scene.add(l)}
const grid=new THREE.GridHelper(1.2,24,'#8b9ca8','#c9d2d8');grid.position.y=-.08;grid.visible=false;scene.add(grid);
const cached=new Map(),loader=new GLTFLoader();let catalog,actual,busy=false,dirty=true,view='iso',box=new THREE.Box3();
const labels={yudx:'YUDX · Dumpling lab',yudx_mgn12:'MGN12H · VORON取付参照',yudx_assembly:'MGN12Hヘッド・ドック原本組立',yudx_head:'MGN12Hヘッド',yudx_extruder:'専用押出機',yudx_tool:'交換ホットエンド',yudx_dock:'ドック・ノズル清掃',stealthchanger:'StealthChanger V1.1',tapchanger:'TapChanger',madmax:'MadMax · Maxwell coupling',mgn9_6:'MGN9H / 6 mm',mgn12_6:'MGN12H / 6 mm',db_ah_plate:'Dragon Burner / AntHead interface',xol_a4t_plate:'Xol / A4T plate · Andrewmcgr',standard_6:'通常経路 / 6 mm',standard_9:'通常経路 / 9 mm · BT123 Split Keeper',monolith_6:'Monolith反転 / 6 mm · 専用Keeper',monolith_9:'Monolith反転 / 9 mm · 専用Keeper',source:'原本の機構別構成',stealthburner:'Stealthburner',xol:'Xol',a4t:'A4T',anthead:'Anthead',blackbird:'BlackBird',dragonburner:'Dragon Burner',jabberwocky:'JabberWocky',rapidburner:'Rapid Burner',yavoth:'Yavoth'};
const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
async function asset(id){return workspaceTask(async()=>{
 if(cached.has(id))return cached.get(id);const spec=catalog.assets[id];if(!spec)throw Error('未登録のCADです');
 const promise=Promise.all([fetch('../'+spec.meta).then(r=>{if(!r.ok)throw Error('部品表を取得できません');return r.json()}),loadModel(loader,'../'+spec.glb)]).then(([meta,g])=>{
  const root=g.scene,lookup=new Map(meta.parts.map(p=>[p.key,p])),meshes=[];root.visible=false;
  root.traverse(m=>{if(!m.isMesh)return;m.material=m.material.clone();m.material.side=THREE.DoubleSide;const row=lookup.get(m.userData.part_key||m.name);meshes.push({mesh:m,row})});bench.add(root);promise.loaded={root,meshes,meta};return promise.loaded;
 }).catch(e=>{cached.delete(id);throw e});cached.set(id,promise);return promise;
});}
function appearance(){for(const p of cached.values())for(const {mesh,row} of p.loaded?.meshes||[]){const role=appearanceRole(row);if(['base','accent'].includes(role))mesh.material.color.set($('#'+role).value)}grid.visible=$('#grid').checked;dirty=true}
function place(){if(!actual)return;box=new THREE.Box3();for(const e of actual.modules){const a=cached.get(e.id)?.loaded;if(!a)continue;const hidden=new Set(e.hidden_keys||[]);a.root.position.copy(point(changerPlacement(actual,e,{probe:+$('#probeTravel').value,explode:+$('#explode').value})));a.root.visible=e.role!=='dock'||$('#showDock').checked;for(const {mesh,row} of a.meshes)mesh.visible=!hidden.has(row?.key)&&(row?.component!=='rail_reference'||$('#showRail').checked)&&(row?.component!=='cover'||$('#showCovers').checked);a.root.updateMatrixWorld(true);if(a.root.visible)for(const {mesh} of a.meshes)if(mesh.visible){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))}}$('#probeValue').textContent=`${$('#probeTravel').value} mm`;if(!box.isEmpty()){const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);$('#changerDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`}dirty=true}
function fit(){if(!actual||box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());controls.target.copy(center);const fov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(fov/2)*camera.aspect),distance=size.length()/2/Math.sin(Math.min(fov,hfov)/2)*1.08;camera.up.set(0,1,0);camera.position.copy(center).addScaledVector(new THREE.Vector3(...({iso:[1,.8,1.2],front:[0,0,1],back:[0,0,-1],side:[1,0,0]}[view])).normalize(),distance);controls.minDistance=.025;controls.maxDistance=5;controls.update();dirty=true}
for(const id of ['base','accent','grid'])$('#'+id).oninput=appearance;
for(const id of ['probeTravel','explode'])$('#'+id).oninput=()=>{place()};for(const id of ['showDock','showRail','showCovers'])$('#'+id).onchange=()=>{place();fit()};
for(const id of ['iso','front','back','side'])$('#'+id).onclick=()=>{view=id;fit()};$('#fit').onclick=()=>{place();fit()};
function menus(v){for(const k of changerDimensions){const s=$('#'+k);s.replaceChildren(...changerChoices(catalog,v,k).map(id=>{const o=document.createElement('option');o.value=id;o.textContent=labels[id]||catalog.variants.find(x=>x.system===v.system&&x.toolhead===id)?.label||id;return o}));s.value=v[k]}}
async function install(v){return workspaceTask(async()=>{
 if(busy)return;busy=true;for(const k of changerDimensions)$('#'+k).disabled=true;$('#loading').hidden=false;$('#loading').textContent='選択した交換機構を読み込み中…';
 try{
  await Promise.all(v.modules.map(e=>asset(e.id)));for(const p of cached.values())if(p.loaded)p.loaded.root.visible=false;actual=v;$('#probeTravel').value='0';$('#explode').value='0';$('#probeTravel').disabled=!v.probe_travel_mm;$('#explode').disabled=!v.modules.some(m=>m.role==='tool');$('#showDock').disabled=!v.modules.some(m=>m.role==='dock');menus(v);place();appearance();fit();
  $('#showRail').disabled=!v.modules.some(e=>cached.get(e.id)?.loaded.meta.parts.some(p=>p.component==='rail_reference'&&!(e.hidden_keys||[]).includes(p.key)));
  $('#showCovers').disabled=!v.modules.some(e=>cached.get(e.id)?.loaded.meta.parts.some(p=>p.component==='cover'&&!(e.hidden_keys||[]).includes(p.key)));
  const check=v.native_fit;$('#changerStatus').textContent=`${v.parts.toLocaleString()}部品 · ${check?.passed===true?'ピンとバックプレートの登録姿勢を確認':check?.passed===false?'接続部に干渉あり':check?.scope==='source_reference'?'原本ソリッドを確認済み':'原本構成'}`;$('#changerStatus').classList.toggle('notice',check?.passed===false);
  const fixing=v.modules.map(e=>cached.get(e.id)?.loaded.meta.fixing_depth_verification).find(Boolean),bolt=fixing?.records?.[0];
  const facts=[['構成数',`${catalog.variants.length}構成`],...(v.system==='yudx'?[['構成','専用押出機 / Bambu P1P型 / MGN12H']]:[]),['取付参照',v.system==='stealthchanger'?'MGN12H → Keeper → シャトル':v.system==='yudx'?'MGN12H → 専用キャリッジ → 交換ホットエンド':'原本の機構・寸法'],['Z変位',v.probe_travel_mm?'0 / 1.5 / 3 mmの3姿勢。連続可動は未確認':'可動検証未登録'],...(bolt?[['固定ネジ',`4 × M3×${bolt.nominal_length_mm} BHCS`]]:[])];$('#changerSpec').replaceChildren(...facts.flatMap(([k,t])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=t;return [dt,dd]}));
  const notes=[...v.notes,...(check?.collisions||[]).map(c=>`${c.label}：交差体積 ${c.volume_mm3.toFixed(3)} mm³`)];
  if(v.system==='stealthchanger')notes.push('印刷版シャトルとKeeperを選択した構成です。ヘッド側の3本のピンをシャトルのブッシュへ接続します。','磁石・予圧調整・ベルト保持・荷重・実行可能な交換経路は未検証です。');
  if(bolt)notes.push('固定ネジの穴軸・頭の座面・モデルの穴底との隙間を確認。実機のねじ深さ・保持強度の認証ではありません。');
  if(bolt?.nominal_length_mm===14)notes.push('MonolithのM3×14はCADの穴深さに合う原寸部品を選択。作者の推奨締結仕様としては扱いません。');
  if(fixing?.head_body_contacts?.length){notes.push('上側のネジ頭とシャトル穴に約0.087 mmの半径方向の食い込みが残っています。機械的な取付適合は未確定です。');$('#changerStatus').textContent='固定ネジの穴底を修正 · ネジ頭と穴に干渉あり';$('#changerStatus').classList.add('notice')}
  $('#changerNotes').replaceChildren(...notes.map(t=>{const li=document.createElement('li');li.textContent=t;return li}));const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);$('#changerDimensions').textContent=`${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
  const u=new URL(location.href);u.searchParams.set('changer',v.id);replaceWorkspaceURL(null,'',u);document.body.dataset.changer=v.id;document.body.dataset.ready='true';$('#loading').hidden=true;
 }catch(e){$('#loading').textContent=e.message;$('#changerStatus').textContent='切替に失敗しました';console.error(e)}finally{busy=false;for(const k of changerDimensions)$('#'+k).disabled=false}
});}
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(Math.max(b.width,1),Math.max(b.height,1));setResponsiveAspect(camera,controls,b.width,b.height);dirty=true}new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',()=>{dirty=true});renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false}});
setupPublicInfo({includeDownloads:false});setupRenderExport({renderer,scene,camera,controls,name:'3D_Print_Rig_Toolchanger',afterRender:()=>{dirty=true}});
try{const r=await fetch('../TOOLCHANGER_CONFIGURATIONS.json?v=yudx-49',{cache:'no-cache'});if(!r.ok)throw Error('交換機構カタログを取得できません');catalog=await r.json();for(const k of changerDimensions)$('#'+k).onchange=()=>install(changerChoice(catalog,Object.fromEntries(changerDimensions.map(k=>[k,$('#'+k).value])),k));for(const s of catalog.sources){const a=document.createElement('a');a.textContent=s.repository+' · '+s.commit.slice(0,12);a.href=s.url+'/tree/'+s.commit;a.target='_blank';a.rel='noopener';$('#changerSources').append(a,document.createElement('br'))}const wanted=new URLSearchParams(location.search).get('changer');await install(catalog.variants.find(v=>v.id===wanted)||catalog.variants.find(v=>v.id==='stealthchanger_standard_6_stealthburner')||catalog.variants[0])}catch(e){$('#loading').textContent=e.message;console.error(e)}resize();

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
