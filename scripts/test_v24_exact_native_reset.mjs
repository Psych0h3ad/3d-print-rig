// Actual six delivered GLBs and production adapter/setup; DOM range sanitation
// is a fixture. Browser confirmation remains an independent release check.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const assets=path.resolve(arg('--assets')||path.join(root,'site')),source=path.resolve(arg('--source')||root),report=arg('--report');
const sha=b=>createHash('sha256').update(b).digest('hex');
const THREE=await import('../site/viewer/vendor/three.module.js');
const {GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
const {createV24Adapter}=await import('../site/viewer/v24_matrix_adapter.mjs');
const text=fs.readFileSync(path.join(source,'site/viewer/machine-heads.js'),'utf8');
const start=text.indexOf('export async function setupV24MachineHeads');assert(start>=0);
const contract=JSON.parse(fs.readFileSync(path.join(root,'site/APPROVED_DELIVERY.json'))),approved=new Map(contract.files.map(r=>[r.path,r]));
globalThis.ProgressEvent??=class{constructor(type,fields){Object.assign(this,{type},fields)}};
class Element{
 constructor(range=false){this.range=range;this._value='0';this._step='any';this._min=0;this._max=100;this.checked=true;this.dataset={};this.children=[];this.textContent='';}
 set value(value){let n=Number(value);if(this.range){n=Math.max(this._min,Math.min(this._max,n));if(this._step!=='any'){const s=Number(this._step);n=this._min+Math.round((n-this._min)/s)*s}}this._value=String(n)}get value(){return this._value}
 set step(s){this._step=s;this.value=this._value}get step(){return this._step}
 set min(n){this._min=Number(n);this.value=this._value}get min(){return this._min}
 set max(n){this._max=Number(n);this.value=this._value}get max(){return this._max}
 append(...x){this.children.push(...x)}
}
const result={schema:'actual-v24-native-reset-v1',all_passed:false,scope:'Exact original profile references, all actual GLB node world matrices and source geometry objects after endpoint/reverse/reset. Range sanitation is a DOM fixture; no native-solid/whole-machine fit certificate.',machines:[]};
const save=()=>{if(report)fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n')};
async function check(machine){
 const dir=`machines/${machine}`,pins={};
 function body(name){const relative=dir+'/'+name,b=fs.readFileSync(path.join(assets,relative)),row=approved.get(relative);assert(row,'Unregistered actual asset '+relative);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);pins[name]={bytes:b.length,sha256:sha(b),public_url:row.url};return b}
 const manifest=JSON.parse(body('assembly_manifest.json')),profile=JSON.parse(body('machine_profile.json')),reference=[...profile.display_reference_xyz_mm];
 const raw=gunzipSync(body('model.glb.gz')),{scene}=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 scene.updateMatrixWorld(true);const nodes=[],native=[],geometries=[];
 scene.traverse(o=>{nodes.push(o);native.push([...o.matrixWorld.elements]);if(o.isMesh)geometries.push([o,o.geometry])});
 const adapter=createV24Adapter(scene,manifest,profile),elements=new Map();
 const document={querySelector:n=>{if(!elements.has(n))elements.set(n,new Element(/^#[xyz]$/.test(n)));return elements.get(n)},createElement:()=>new Element()};
 const $=document.querySelector;for(const[i,a]of ['x','y','z'].entries()){$('#'+a).min=profile.display_limits_mm[a.toUpperCase()][0];$('#'+a).max=profile.display_limits_mm[a.toUpperCase()][1];$('#'+a).value=reference[i]}
 let active,last;const applyPose=()=>last=adapter.setPose(Object.fromEntries(['x','y','z'].map(a=>[a,Number($('#'+a).value)])));
 const rig={rig:new THREE.Group(),gantry:{setFlexibleVisible(){}},setDelta(){},setPalette(){},get active(){return active}};
 const dependencies={THREE,document,location:{search:'',href:'http://fixture.invalid/viewer/v24-reference.html'},workspaceTask:f=>f(),
  loadMachineHeadCatalog:async()=>({heads:{},registry:{machines:{[machine]:{stock_head_keys:[],xy_motors:profile.cnc?4:2}}},bank:{}}),
  v24HeadCatalog:()=>({variants:[],probes:[],dimensions:[]}),loadMonolithMachines:async c=>c,createMachineHeads:()=>rig,
  stockGantryVisibility:()=>({install(){},update(){}}),ensureMachineHeadControls:()=>new Element(),stockProbeFit:()=>null,
  v24NativeDriveMetadata:()=>null,setupChangerBank:()=>({install:async v=>{active=v},bind:async()=>{},options:{}}),
  setupConfigurations:async(c,install)=>{await install(c.variants[0]);return {current:c.variants[0]}},
  alphaReference:(_p,_v,r)=>r,alphaLimits:l=>l,monolithDisplayLimits:l=>l,alphaResetPose:(_v,r)=>[...r],alphaResetLabel:()=>'',alphaRangeNotice:()=>''};
 const setup=Function(...Object.keys(dependencies),'return '+text.slice(start).replace(/^export /,''))(...Object.values(dependencies));
 await setup({machine,profile,adapter,scene,render(){},applyPose});
 const initial={display_xyz_mm:[...last.display_xyz_mm],cad_delta_xyz_mm:[...last.cad_delta_xyz_mm],atReference:last.atReference,range_steps:['x','y','z'].map(a=>$('#'+a).step)};
 result.current_diagnostic={machine,input_files:pins,reference_xyz_mm:reference,initial};save();
 function exactReset(){
  for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=profile.display_reference_xyz_mm[i];applyPose();scene.updateMatrixWorld(true);
  assert.deepEqual(last.display_xyz_mm,reference,machine+' original reference was quantized');assert.deepEqual(last.cad_delta_xyz_mm,[0,0,0]);assert.equal(last.atReference,true);
  for(const[i,o]of nodes.entries())assert.deepEqual(o.matrixWorld.elements,native[i],machine+' native world matrix '+i);
  for(const[o,g]of geometries)assert.equal(o.geometry,g,machine+' original geometry not restored');
 }
 assert.deepEqual(initial.range_steps,['any','any','any'],machine+' installation overwrote lossless range steps');exactReset();
 const min=['X','Y','Z'].map(a=>profile.display_limits_mm[a][0]),max=['X','Y','Z'].map(a=>profile.display_limits_mm[a][1]),mid=min.map((v,i)=>(v+max[i])/2),poses=[min,max,mid,[max[0],min[1],max[2]],[min[0],max[1],min[2]]];
 for(const xyz of poses){for(const[i,a]of ['x','y','z'].entries())$('#'+a).value=xyz[i];applyPose();assert.deepEqual(last.display_xyz_mm,xyz);exactReset()}
 assert.deepEqual(profile.display_reference_xyz_mm,reference,'Original source profile changed');
 result.machines.push({machine,input_files:pins,reference_xyz_mm:reference,initial,pose_requests:poses,native_world_matrices_restored:nodes.length,original_mesh_geometries_restored:geometries.length,final_delta_xyz_mm:last.cad_delta_xyz_mm,atReference:last.atReference,flexible_visible_count:last.flexible_visible_count});save();
 scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});
}
try{
 for(const size of [250,300,350])for(const type of ['printed','ldo_cnc']){await check(`voron_v24_${size}_${type}`);globalThis.gc?.()}
 delete result.current_diagnostic;result.all_passed=true;result.production_setup_sha256=sha(Buffer.from(text));save();console.log(JSON.stringify({all_passed:true,actual_machines:result.machines.length,exact_native_reset:true,all_source_bytes_unchanged:true}));
}catch(error){result.error=error.message;save();throw error}
