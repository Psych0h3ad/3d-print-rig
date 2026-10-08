import {contentSHA256} from './mount-validation.mjs';
import {alphaResetPose,alphaHostContext,alphaNozzlePosition,alphaNativeHostModelOptions} from './trinity-alpha-host-extensions.mjs?v=eaac241cfd978128d54d';
import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupSceneDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {workspaceFrame,WorkspaceResizeObserver,workspaceTask} from './workspace-lifecycle.mjs';
import {setResponsiveAspect,frameResponsiveView} from './responsive-camera.mjs';
import {appearanceRole} from './appearance-role.mjs?v=6b7b8efda77bfc3ce74d';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {createV24Adapter} from './v24_matrix_adapter.mjs?v=9633233bf8f9aab91d31';
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {setupGrid} from './grid-control.js';
import {setupRenderExport} from './render-export.js';
import {setupPublicInfo} from './public-info.js?v=1a61579df968fc52f420';
import {setupGcodePanel,displayedMachineLimits} from './gcode-panel.js?v=f471190665709ba23159';
import {setupV24MachineHeads} from './machine-heads.js?v=12fd60c25f15c89bf64d';
export async function mount(scope){
const $=s=>document.querySelector(s),ids=[250,300,350].flatMap(size=>['printed','ldo_cnc'].map(structure=>`voron_v24_${size}_${structure}`));
const wanted=new URLSearchParams(location.search).get('machine'),id=ids.includes(wanted)?wanted:ids[0];
setupMachineNavigation(id);setupPublicInfo({machineId:id});
const stage=$('#stage'),renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#edf1f4');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(38,1,.001,10),orbit=scope.resource(new OrbitControls(camera,renderer.domElement));scene.add(new THREE.HemisphereLight('#ffffff','#6c7981',2.4));
for(const pos of [[.4,.6,.5],[-.3,.2,-.4]]){const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(...pos);scene.add(light)}
let adapter,profile,pending=false,machineHeads,program;const nativeInputHashes={};
function render(){if(pending)return;pending=true;workspaceFrame(()=>{pending=false;renderer.render(scene,camera)})}
const grid=setupGrid(scene,render);grid.position.y=-.096;
function resize(){const b=stage.getBoundingClientRect();renderer.setSize(b.width,b.height,false);setResponsiveAspect(camera,orbit,b.width,b.height);render()}
new WorkspaceResizeObserver(resize).observe(stage);orbit.addEventListener('change',render);
function view(name){camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);orbit.target.set(0,.22,0);camera.position.set(...({iso:[.98,.83,1.4],front:[0,.24,1.65],top:[0,1.8,0]}[name]));frameResponsiveView(camera,orbit);render()}
for(const name of ['iso','front','top'])$('#'+name).onclick=()=>view(name);view('iso');
$('#focusHead').onclick=()=>{if(!adapter||machineHeads?.focus(camera,orbit))return;const box=new THREE.Box3();for(const [key,node] of adapter.nodes)if(adapter.records.get(key).group===profile.head_group)box.expandByObject(node);if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(.1,.06,.2));orbit.update();render()};
function applyPose(){if(!adapter)return;const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));machineHeads?.update(pose);const nozzle=alphaNozzlePosition(machineHeads?.variant,pose.cad_delta_xyz_mm);if(nozzle)document.body.dataset.alphaNozzleCadMm=JSON.stringify(nozzle);else delete document.body.dataset.alphaNozzleCadMm;for(const a of ['x','y','z'])$('#'+a+'v').textContent=Number($('#'+a).value).toFixed(2)+' mm';
 $('#motionStatus').textContent=machineHeads?.monolith?'ベッド固定 · Monolithの8個のZガイドとガントリーがZ＋へ追従':'ベッド固定 · X/Yヘッドと4Zガイド・ガントリーがZ＋へ追従';$('#gantryMotionHelp').textContent=machineHeads?.monolith?'Zを上げるとMonolithガントリーと8個のガイドブロックが上がります。XY '+machineHeads.variant.belt_width_mm+' mm。':'Zを上げるとガントリーと4つのガイドブロックが上がります。XY 6 mm / Z 9 mmベルト。';$('#motionBeltHelp').textContent=machineHeads?.monolith?'MonolithのXYベルトはヘッド・Y軸・ガントリーの移動に追従します。クランプ内部・歯・張力は未再現です。':profile.cnc?'このCNC参照モデルはZベルトのみ収録。XYベルトは未収録です。':'Zベルトはフレーム側で固定。XYベルトはヘッド・Y軸・ガントリーに追従します。移動時はクランプ内部・歯・張力を省いた経路プレビューです。';document.body.dataset.pose=JSON.stringify(pose);document.body.dataset.flexibleVisible=String(pose.flexible_visible_count>0);render();}
try{
 const root='../machines/'+id+'/',json=async name=>{return workspaceTask(async()=>{const r=await fetch(root+name,{cache:'no-cache'});if(!r.ok)throw Error(name+'の読込に失敗');const text=await r.text();nativeInputHashes[name]=await contentSHA256(text);return JSON.parse(text)});};
 const [manifest,p,g]=await Promise.all([json('assembly_manifest.json'),json('machine_profile.json'),loadModel(new GLTFLoader(),root+'model.glb',undefined,alphaNativeHostModelOptions(id))]);
 profile=p;scene.add(g.scene);adapter=createV24Adapter(g.scene,manifest,profile);const originals=new Map(),protectedMaterials=[];
 for(const [key,node] of adapter.nodes)node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){originals.set(material,material.color.clone());if(!appearanceRole(adapter.records.get(key)))protectedMaterials.push(material);if(material.transparent)material.depthWrite=false}});
 $('#machineTitle').textContent=`V2.4 / ${profile.size_mm}`;$('#structureLabel').textContent=profile.cnc?'LDO CNC AWD参照 · XY/Zジョイントは元設計のプリント構造':'R2標準プリント構造';$('#badge').textContent=$('#machineTitle').textContent+' · '+manifest.parts.length.toLocaleString()+' PARTS';
 const limits=profile.display_limits_mm;$('#clearanceStatus').textContent=`表示範囲 X ${limits.X.join('–')} / Y ${limits.Y.join('–')} / Z ${limits.Z.join('–')} mm`+(profile.cnc?'。前駆動ユニットとの干渉を避けるため、全X幅の比較ではY前端を56 mmに制限しています。':'');
 for(const [i,a] of ['x','y','z'].entries()){$('#'+a).min=limits[a.toUpperCase()][0];$('#'+a).max=limits[a.toUpperCase()][1];$('#'+a).value=profile.display_reference_xyz_mm[i];$('#'+a).disabled=false;$('#'+a).oninput=applyPose}
 $('#reset').disabled=false;$('#reset').onclick=()=>{const xyz=alphaResetPose(machineHeads?.variant,profile.display_reference_xyz_mm);for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()};$('#belts').onchange=()=>{adapter.setFlexibleVisible($('#belts').checked);applyPose()};$('#enclosure').onchange=()=>{adapter.setEnclosureVisible($('#enclosure').checked);render()};
 const valid=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);let palette={base:null,accent:null,frame:null};try{const saved=JSON.parse(localStorage.getItem(profile.appearance.storage_key)||'null');if(saved?.machine_id===id)for(const role of Object.keys(palette))if(valid(saved.colors?.[role]))palette[role]=saved.colors[role]}catch{}
 function applyPalette(){for(const [m,c] of originals)m.color.copy(c);adapter.setPalette(Object.fromEntries(Object.entries(palette).map(([r,c])=>[r,c||profile.appearance.palette_defaults[r]])));machineHeads?.setPalette(Object.fromEntries(Object.entries(palette).map(([r,c])=>[r,c||profile.appearance.palette_defaults[r]])));for(const role of Object.keys(palette)){const v=palette[role]||profile.appearance.palette_defaults[role];$('#'+role).value=v;$('#'+role+'Hex').value=v;$('#'+role+'Hex').removeAttribute('aria-invalid')}$('#frameFinish').value=palette.frame==='#b9bec4'?'silver':!palette.frame||palette.frame===profile.appearance.palette_defaults.frame?'black':'custom';document.body.dataset.protectedChanges=String(protectedMaterials.filter(m=>!m.color.equals(originals.get(m))).length);$('#paletteStatus').textContent=Object.values(palette).some(Boolean)?'この機種の配色':'標準色';render()}
 function save(){try{localStorage.setItem(profile.appearance.storage_key,JSON.stringify({machine_id:id,colors:palette}))}catch{}}
 for(const role of Object.keys(palette)){$('#'+role).disabled=false;$('#'+role+'Hex').disabled=false;$('#'+role).oninput=()=>{palette[role]=$('#'+role).value;applyPalette();save()};$('#'+role+'Hex').oninput=()=>{const v=$('#'+role+'Hex').value;if(!valid(v)){$('#'+role+'Hex').setAttribute('aria-invalid','true');return}palette[role]=v;applyPalette();save()}}
 $('#frameFinish').disabled=false;$('#frameFinish').onchange=()=>{if($('#frameFinish').value==='custom')return;palette.frame=$('#frameFinish').value==='silver'?'#b9bec4':profile.appearance.palette_defaults.frame;applyPalette();save()};$('#resetPalette').disabled=false;$('#resetPalette').onclick=()=>{palette={base:null,accent:null,frame:null};applyPalette();save()};applyPalette();
 machineHeads=await setupV24MachineHeads({machine:id,profile,adapter,scene,render,applyPose,nativeInputHashes,beforeInstall:()=>program?.invalidate(),onChange:v=>{program?.invalidate();$('#badge').textContent=$('#machineTitle').textContent+(v.machine_gantry?' · Monolith '+v.belt_width_mm+' mm':v.machine_head?' · ヘッド交換プレビュー':' · '+manifest.parts.length.toLocaleString()+' PARTS')}});applyPalette();
 program=setupGcodePanel({container:document.querySelector('aside'),profile,adapter,scene,render,getLimits:displayedMachineLimits,getContext:()=>alphaHostContext({configuration:machineHeads.variant?.id||'stock'},machineHeads.variant),setPose:xyz=>{for(const [i,a] of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose()}});
 setupRenderExport({renderer,scene,camera,controls:orbit,name:id,afterRender:render});$('#status').hidden=true;document.body.dataset.ready='true';document.body.dataset.parts=String(manifest.parts.length);applyPose();resize();
}catch(e){$('#status').textContent='読込エラー: '+e.message;document.body.dataset.error=e.message;console.error(e)}

setupSceneDisplay(scene,renderer,camera,scope,THREE);
}
