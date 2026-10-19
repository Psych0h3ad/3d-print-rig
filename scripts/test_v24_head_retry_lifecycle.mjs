// Lifecycle fixtures supplement the actual-export release assay; they do not
// certify source geometry, native mating features or machine clearances.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=process.argv.indexOf('--source'),source=arg<0?root:path.resolve(process.argv[arg+1]);
const viewer=path.join(source,'site/viewer');
const THREE=await import(pathToFileURL(path.join(root,'site/viewer/vendor/three.module.js')));
const text=name=>fs.readFileSync(path.join(viewer,name),'utf8');
function production(text,name,dependencies){
 const start=text.indexOf('export async function '+name);assert(start>=0,name);
 return Function(...Object.keys(dependencies),'return '+text.slice(start).replace(/^export /,''))(...Object.values(dependencies));
}
class Element{
 constructor(){this.value='0';this.disabled=true;this.checked=true;this.hidden=false;this.dataset={};this.children=[];this.textContent='';}
 append(...x){this.children.push(...x)}addEventListener(){}removeAttribute(){}setAttribute(){}
 getBoundingClientRect(){return {width:800,height:600}}
}
function fixture({initialFailure=true,allowInitialFailure=true}={}){
 const elements=new Map(),body=new Element(),document={body,createElement:()=>new Element(),querySelector:s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)}};
 const profile={size_mm:250,head_group:'head',display_reference_xyz_mm:[125,129,27],nozzle_tip_mm:[0,0,0],display_limits_mm:{X:[0,250],Y:[0,250],Z:[0,230]},bed_surface_min_xy_mm:[0,0],bed_top_world_z_mm:0,appearance:{storage_key:'fixture',palette_defaults:{base:'#112233',accent:'#445566',frame:'#778899'}}};
 const variant={id:'head',machine_head:{nozzle_mm:[125,129,27]},probe:'none'};
 const catalog={variants:[variant],probes:[],dimensions:[]},group=new THREE.Group();
 let fail=initialFailure,current=null,configuration,headHandle,headSetups=0,exportSetups=0,programSetups=0,bankSettled=0;
 const rig={rig:group,gantry:{setFlexibleVisible(){}},install:async()=>{if(fail)throw Error('controlled source fetch failure')},setDelta:p=>group.position.set(p[0]/1000,p[2]/1000,-p[1]/1000),setPalette(){},get active(){return current}};
 const visibility={install(){},update(){}},location={search:'',href:'http://localhost/viewer/v24-reference.html'};
 const setup=production(text('machine-heads.js'),'setupV24MachineHeads',{
  THREE,document,location,workspaceTask:f=>f(),loadMachineHeadCatalog:async()=>({heads:{},registry:{machines:{test:{stock_head_keys:[]}}},bank:{}}),v24HeadCatalog:()=>catalog,loadMonolithMachines:async c=>c,createMachineHeads:()=>rig,stockGantryVisibility:()=>visibility,ensureMachineHeadControls:()=>new Element(),stockProbeFit:()=>null,v24NativeDriveMetadata:()=>null,
  setupChangerBank:()=>({install:rig.install,bind:async c=>c,options:{onSettled:()=>bankSettled++}}),
  setupConfigurations:async(_catalog,install,options)=>{
   configuration={get current(){return current},retry:async()=>{try{await install(variant);current=variant;return true}catch{current=null;return false}finally{options.onSettled?.(current)}}};await configuration.retry();return configuration;
  },alphaReference:(_p,_v,r)=>r,alphaLimits:l=>l,monolithDisplayLimits:l=>l,alphaResetPose:(_v,r)=>r,alphaResetLabel:()=>'',alphaRangeNotice:()=>''
 });
 class Renderer{constructor(){this.domElement=new Element()}setPixelRatio(){}setClearColor(){}setSize(){}render(){}}
 class Orbit{constructor(){this.target=new THREE.Vector3()}addEventListener(){}update(){}}
 let adapter;const scene=new THREE.Scene(),manifest={parts:[]};
 const mount=production(text('v24-reference.js'),'mount',{
  THREE:{...THREE,WebGLRenderer:Renderer},document,location,devicePixelRatio:1,OrbitControls:Orbit,GLTFLoader:class{},localStorage:{getItem:()=>null,setItem(){}},
  setupMachineNavigation(){},setupPublicInfo(){},workspaceFrame:f=>f(),WorkspaceResizeObserver:class{observe(){}},setupGrid:()=>new THREE.Group(),setResponsiveAspect(){},frameResponsiveView(){},workspaceTask:f=>f(),contentSHA256:async()=>'',alphaNativeHostModelOptions:()=>({}),alphaNozzlePosition:()=>null,alphaHostContext:()=>({}),alphaResetPose:(_v,r)=>r,
  loadModel:async()=>({scene:new THREE.Group()}),fetch:async u=>({ok:true,text:async()=>JSON.stringify(String(u).endsWith('assembly_manifest.json')?manifest:profile)}),
  createV24Adapter:(_r,_m,p)=>(adapter={nodes:new Map(),records:new Map(),setPalette(){},setFlexibleVisible(){},setEnclosureVisible(){},setPose:xyz=>({cad_delta_xyz_mm:['x','y','z'].map((a,i)=>+xyz[a]-p.display_reference_xyz_mm[i])})}),
  setupV24MachineHeads:async options=>{headSetups++;headHandle=await setup({...options,machine:'test',allowInitialFailure});return headHandle},
  setupGcodePanel:()=>{programSetups++;return{invalidate(){}}},displayedMachineLimits(){},setupRenderExport:()=>{exportSetups++;return{}},setupSceneDisplay(){}
 });
 return {document,group,profile,rig,setup,mount,scene,get configuration(){return configuration},get headHandle(){return headHandle},set fail(v){fail=v},get counts(){return {headSetups,exportSetups,programSetups,bankSettled}}};
}
for(const initialFailure of [true,false]){
 const f=fixture({initialFailure}),scope={renderer:x=>x,resource:x=>x,scene:()=>f.scene};await f.mount(scope);
 const $=s=>f.document.querySelector(s);
 if(initialFailure){assert(!f.document.body.dataset.ready);assert(f.document.body.dataset.error);assert($('#openRender').disabled);assert.equal(f.counts.exportSetups,0);assert.equal(f.headHandle.ready,false);assert.equal(await f.configuration.retry(),false);assert(!f.document.body.dataset.ready);f.fail=false;assert(await f.configuration.retry());}
 assert.equal(f.headHandle.ready,true);assert.equal(f.document.body.dataset.ready,'true');assert(!f.document.body.dataset.error);assert(!$('#openRender').disabled);
 for(const xyz of [[0,0,0],[250,250,230],[125,100,100],[0,250,0]]){for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];$('#x').oninput();const d=xyz.map((v,i)=>v-f.profile.display_reference_xyz_mm[i]);assert.deepEqual(f.group.position.toArray(),[d[0]/1000,d[2]/1000,-d[1]/1000]);}
 $('#reset').onclick();assert(f.group.position.length()<1e-14);for(let i=0;i<3;i++)assert(await f.configuration.retry());assert.equal(f.counts.headSetups,1);assert.equal(f.counts.programSetups,1);assert.equal(f.counts.exportSetups,1);assert(f.counts.bankSettled>=4);
}
const legacy=fixture({initialFailure:true});await assert.rejects(legacy.setup({machine:'test',profile:legacy.profile,adapter:{nodes:new Map(),records:new Map()},scene:legacy.scene,render(){},applyPose(){}}),/ヘッド構成を表示できませんでした/);
const {translate,loadLanguage}=await import(pathToFileURL(path.join(viewer,'i18n.mjs')));
for(const language of ['ja','en','es','ko','ru']){await loadLanguage(language);const message=translate('読込エラー: ヘッド構成を表示できませんでした',language);assert(message.length);if(language!=='ja')assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(message),'Untranslated retry error: '+language);}
console.log('V24 initial failure/retry lifecycle: motion, reset, readiness, export, idempotence and default failure contract pass');
