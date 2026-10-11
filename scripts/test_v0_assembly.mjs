// Production static-stage controller with keyed object fixtures. No CAD fit proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {v0AssemblySchema,validateV0AssemblyStages,createV0AssemblyStages} from '../site/viewer/v0-assembly.mjs';

const modelHash='a'.repeat(64),manifestHash='b'.repeat(64),manualHash='c'.repeat(64);
const receipts={'model.glb':modelHash,'assembly_manifest.json':manifestHash};
const fixture=()=>{
 const keys=['frame','rail','block','screw','bed','alternative'],parent={name:'native source'},nodes=new Map();
 for(const [i,key]of keys.entries()){
  const node={visible:key!=='alternative',userData:{part_key:key},parent,children:[],position:{x:i,y:2,z:3},quaternion:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},material:{color:'#24272c'}};
  node.children.push({visible:true,parent:node,children:[],material:{color:'#b9bec4'},position:{x:0,y:0,z:0}});nodes.set(key,node);
 }
 const manifest={machine_id:'voron_v02r1_120',parts:keys.map(key=>({key}))};
 const machine={schema:v0AssemblySchema,machines:{[manifest.machine_id]:{model_sha256:modelHash,manifest_sha256:manifestHash,parts:keys.length,
  manual:{url:'https://example.test/voron-v0.2r1-manual.pdf',sha256:manualHash,pages:120,revision:'V0.2r1'},
  stages:[{id:'frame',title:'Frame',title_ja:'フレーム',page_start:10,page_end:20,part_keys:['frame','alternative']},
   {id:'rail',title:'Rail and carriage',page_start:21,page_end:35,part_keys:['rail','block','screw']},
   {id:'bed',title:'Bed',page_start:36,page_end:40,part_keys:['bed'],note:'Native static placement only.'}]}}};
 return {nodes,manifest,machine,receipts:{...receipts}};
};
const selected=input=>input.machine.machines[input.manifest.machine_id];
const visibility=nodes=>[...nodes].map(([key,node])=>[key,node.visible]);
function unchangedState(nodes){return [...nodes].map(([key,n])=>({key,parent:n.parent,children:n.children,position:n.position,positionValues:{...n.position},quaternion:n.quaternion,quaternionValues:{...n.quaternion},scale:n.scale,scaleValues:{...n.scale},material:n.material,color:n.material.color,child:n.children[0],childMaterial:n.children[0].material,childColor:n.children[0].material.color,childVisible:n.children[0].visible}))}
function assertUnchanged(nodes,state){
 for(const saved of state){const n=nodes.get(saved.key);for(const field of ['parent','children','position','quaternion','scale','material'])assert.equal(n[field],saved[field]);
  assert.deepEqual(n.position,saved.positionValues);assert.deepEqual(n.quaternion,saved.quaternionValues);assert.deepEqual(n.scale,saved.scaleValues);assert.equal(n.material.color,saved.color);
  assert.equal(n.children[0],saved.child);assert.equal(n.children[0].material,saved.childMaterial);assert.equal(n.children[0].material.color,saved.childColor);assert.equal(n.children[0].visible,saved.childVisible);
 }
}
let positives=0,negatives=0;
const input=fixture(),native=visibility(input.nodes),unchanged=unchangedState(input.nodes),controller=createV0AssemblyStages(input);
assert.equal(controller.current(),null);assert.deepEqual(controller.getBoundsKeys(),[]);assert.equal(controller.leave(),null);positives++;
for(const index of [0,2,1,2,0,1,0,2]){
 const current=controller.setStage(index),spec=selected(input),expected=spec.stages.slice(0,index+1).flatMap(s=>s.part_keys),visible=expected.filter(key=>key!=='alternative');
 assert.equal(current.index,index);assert.equal(current.total,3);assert.equal(current.id,spec.stages[index].id);assert.equal(current.title,spec.stages[index].title);
 assert.deepEqual(current.pages,[spec.stages[index].page_start,spec.stages[index].page_end]);assert.equal(current.added,spec.stages[index].part_keys.length);assert.deepEqual(current.part_keys,spec.stages[index].part_keys);assert.deepEqual(current.cumulative_part_keys,expected);
 assert.equal(current.visible_count,visible.length);assert.deepEqual(controller.getBoundsKeys(),spec.stages[index].part_keys.filter(key=>key!=='alternative'));assert.deepEqual(controller.current(),current);
 for(const [key,node]of input.nodes)assert.equal(node.visible,visible.includes(key));assertUnchanged(input.nodes,unchanged);positives++;
}
controller.leave();assert.deepEqual(visibility(input.nodes),native);assertUnchanged(input.nodes,unchanged);assert.equal(controller.current(),null);positives++;
// A new entry captures current filters, not a constructor-time visibility mask.
input.nodes.get('bed').visible=false;const filtered=visibility(input.nodes);
controller.setStage(2);assert.equal(controller.current().visible_count,4);assert(!controller.getBoundsKeys().includes('bed'));controller.leave();assert.deepEqual(visibility(input.nodes),filtered);positives++;
// Caller mutations cannot change retained stage data or returned arrays.
const detached=fixture(),copyController=createV0AssemblyStages(detached);selected(detached).stages[0].part_keys.push('unknown');selected(detached).stages[0].title='Mutated';
let copy=copyController.setStage(0);copy.part_keys.push('unknown');copy.cumulative_part_keys.length=0;copy.pages[0]=0;
assert.equal(copyController.current().title,'Frame');assert.equal(copyController.current().added,2);assert.deepEqual(copyController.current().part_keys,['frame','alternative']);assert.deepEqual(copyController.current().cumulative_part_keys,['frame','alternative']);assert.deepEqual(copyController.current().pages,[10,20]);copyController.leave();positives++;
// Selected-entry API uses the same strict native and manual checks.
const entry=fixture();entry.machine=selected(entry);assert.equal(validateV0AssemblyStages(entry).parts,6);positives++;
const hiddenParent=fixture();hiddenParent.nodes.get('bed').parent={visible:false};const parentController=createV0AssemblyStages(hiddenParent);parentController.setStage(2);
assert.equal(hiddenParent.nodes.get('bed').visible,true);assert.equal(parentController.current().visible_count,4);assert(!parentController.getBoundsKeys().includes('bed'));parentController.leave();assert.equal(hiddenParent.nodes.get('bed').parent.visible,false);positives++;
function reject(mutator,pattern){const value=fixture();mutator(value);const before=visibility(value.nodes);assert.throws(()=>validateV0AssemblyStages(value),pattern);assert.deepEqual(visibility(value.nodes),before);negatives++}
// Preloading instructions may precede mounting. The display assignment must
// wait for the exact receiving source part, including forward/reverse stages.
const seated=fixture();selected(seated).seat_display_dependencies=[{part_key:'screw',carrier_key:'block',preload_stage_id:'frame'}];
const seatedController=createV0AssemblyStages(seated);
for(const index of [0,2,1,0,1]){seatedController.setStage(index);assert(!seated.nodes.get('screw').visible||seated.nodes.get('block').visible)}seatedController.leave();positives++;
for(const change of [
 x=>x.seat_display_dependencies=null,
 x=>x.seat_display_dependencies=[{part_key:'unknown',carrier_key:'rail',preload_stage_id:'frame'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'unknown',preload_stage_id:'frame'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'screw',preload_stage_id:'frame'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'rail',preload_stage_id:'unknown'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'rail',preload_stage_id:'bed'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'bed',preload_stage_id:'frame'}],
 x=>x.seat_display_dependencies=[{part_key:'screw',carrier_key:'rail',preload_stage_id:'frame'},{part_key:'screw',carrier_key:'block',preload_stage_id:'frame'}],
 x=>x.seat_display_dependencies=[{part_key:'rail',carrier_key:'block',preload_stage_id:'frame'},{part_key:'block',carrier_key:'rail',preload_stage_id:'frame'}],
])reject(value=>change(selected(value)),/seat|receiving/);
for(const name of ['model.glb','assembly_manifest.json']){reject(x=>{x.receipts[name]='d'.repeat(64)},/Stale/);reject(x=>{delete x.receipts[name]},/unverified/)}
reject(x=>{x.machine.schema='unknown-schema'},/schema/);
reject(x=>{x.machine.machines={}},/Unregistered machine/);
reject(x=>{selected(x).machine_id='unknown-machine'},/identity mismatch/);
reject(x=>{x.manifest.machine_id='unknown-machine'},/Unregistered/);
reject(x=>{selected(x).model_sha256='not-a-hash'},/hashes/);
reject(x=>{selected(x).parts=7},/count/);
reject(x=>{selected(x).parts=6.5},/count/);
reject(x=>{x.nodes.delete('rail')},/count/);
reject(x=>{x.nodes.set('unknown',x.nodes.get('rail'))},/count/);
reject(x=>{x.nodes.delete('rail');x.nodes.set('unknown',{visible:true})},/Missing/);
reject(x=>{x.nodes.set('rail',x.nodes.get('frame'))},/duplicate native node/);
reject(x=>{x.nodes.get('rail').userData.part_key='unknown'},/identity/);
reject(x=>{x.nodes.get('rail').visible=null},/native node/);
reject(x=>{Object.defineProperty(x.nodes.get('rail'),'visible',{writable:false})},/writable/);
reject(x=>{x.manifest.parts[1].key='frame'},/duplicate manifest/);
reject(x=>{selected(x).stages[1].part_keys.push('frame')},/more than once/);
reject(x=>{selected(x).stages[0].part_keys.push('frame')},/more than once/);
reject(x=>{selected(x).stages[2].part_keys=[]},/Unassigned/);
reject(x=>{selected(x).stages[0].part_keys.push('unknown')},/Unknown stage part/);
reject(x=>{selected(x).stages[1].id='frame'},/stage identity/);
reject(x=>{selected(x).stages[1].title=' '},/title/);
reject(x=>{selected(x).stages[0].title_ja=' '},/Japanese/);
reject(x=>{selected(x).stages[0].note={}},/stage copy/);
reject(x=>{selected(x).stages=[]},/Missing manual stages/);
for(const [field,value]of [['page_start',0],['page_start',1.5],['page_start',21],['page_end',121],['page_end',NaN]])reject(x=>{selected(x).stages[0][field]=value},/page range/);
for(const [field,value]of [['url','file:///manual.pdf'],['url','https://user:password@example.test/manual.pdf'],['url','bad-url'],['sha256','invalid'],['pages',0],['pages',3.5],['revision',' ']])reject(x=>{selected(x).manual[field]=value},/manual|Manual/);
const invalidStage=fixture(),invalidController=createV0AssemblyStages(invalidStage);invalidController.setStage(1);
for(const index of [-1,3,1.5,NaN,Infinity,'1',null]){const before=visibility(invalidStage.nodes),current=invalidController.current();assert.throws(()=>invalidController.setStage(index),/index out of range/);assert.deepEqual(visibility(invalidStage.nodes),before);assert.deepEqual(invalidController.current(),current);negatives++}invalidController.leave();
// Out-of-band updates fail before touching any visibility; after resolving the
// conflict, leave restores the exact native mask from assembly-mode entry.
for(const change of ['visibility','descendant visibility','parent visibility','ancestor graph','identity','parent','children','map','readonly']){
 const value=fixture(),c=createV0AssemblyStages(value),original=visibility(value.nodes);c.setStage(0);const node=value.nodes.get('rail'),child=node.children[0];let restore;
 if(change==='visibility'){node.visible=true;restore=()=>{node.visible=false}}
 if(change==='descendant visibility'){child.visible=false;restore=()=>{child.visible=true}}
 if(change==='parent visibility'){node.parent.visible=false;restore=()=>{delete node.parent.visible}}
 if(change==='ancestor graph'){node.parent.parent={};restore=()=>{delete node.parent.parent}}
 if(change==='identity'){node.userData.part_key='stale';restore=()=>{node.userData.part_key='rail'}}
 if(change==='parent'){const p=node.parent;node.parent={};restore=()=>{node.parent=p}}
 if(change==='children'){node.children.push({visible:true});restore=()=>{node.children.pop()}}
 if(change==='map'){value.nodes.delete('rail');restore=()=>{value.nodes.set('rail',node)}}
 if(change==='readonly'){Object.defineProperty(node,'visible',{writable:false});restore=()=>{Object.defineProperty(node,'visible',{writable:true})}}
 const before=visibility(value.nodes);assert.throws(()=>c.setStage(2),/changed/);assert.deepEqual(visibility(value.nodes),before);negatives++;
 assert.throws(()=>c.leave(),/changed/);assert.deepEqual(visibility(value.nodes),before);negatives++;
 restore();c.leave();assert.deepEqual(new Map(visibility(value.nodes)),new Map(original));positives++;
}
// Support-omitted stock display wrappers follow their exact native stage keys.
// Hidden original support-bearing leaves stay hidden even in the final stage.
function companionFixture(){
 const value=fixture();for(const key of ['rail','block'])value.nodes.get(key).visible=false;
 const parent={visible:true},node={visible:true,parent,children:[],position:{x:1,y:2,z:3},material:{color:'#232527'}};
 node.children.push({visible:true,parent:node,children:[],material:{color:'#aaaaaa'}});
 value.companions=[{node,part_keys:['rail','block']}];return value;
}
const companion=companionFixture(),wrapper=companion.companions[0].node,wrapperMaterial=wrapper.material,wrapperPosition={...wrapper.position};
const companionNative=visibility(companion.nodes),companionController=createV0AssemblyStages(companion);
for(const index of [0,1,2,1,0,2]){
 const current=companionController.setStage(index);assert.equal(wrapper.visible,index>0);
 assert.equal(companion.nodes.get('rail').visible,false);assert.equal(companion.nodes.get('block').visible,false);
 assert.equal(wrapper.material,wrapperMaterial);assert.deepEqual(wrapper.position,wrapperPosition);
 assert.equal(current.visible_count,[1,4,5][index]);assert.equal(current.added,[2,3,1][index]);
 const focus=companionController.getBoundsNodes();
 assert.deepEqual(companionController.getBoundsKeys(),[['frame'],['rail','block','screw'],['bed']][index]);
 if(index===1){assert(focus.includes(wrapper));assert(focus.includes(companion.nodes.get('screw')));assert.equal(focus.length,2)}
 else assert.deepEqual(focus,[companion.nodes.get(index===0?'frame':'bed')]);positives++;
}
companionController.leave();assert.deepEqual(visibility(companion.nodes),companionNative);assert.equal(wrapper.visible,true);assert.deepEqual(companionController.getBoundsNodes(),[]);positives++;
const hiddenCompanion=companionFixture();hiddenCompanion.companions[0].node.visible=false;const hc=createV0AssemblyStages(hiddenCompanion);hc.setStage(1);assert.equal(hc.current().visible_count,2);assert.deepEqual(hc.getBoundsKeys(),['screw']);hc.leave();assert.equal(hiddenCompanion.companions[0].node.visible,false);positives++;
const detachedCompanion=companionFixture(),dc=createV0AssemblyStages(detachedCompanion);detachedCompanion.companions[0].part_keys.length=0;dc.setStage(1);assert.equal(detachedCompanion.companions[0].node.visible,true);dc.leave();positives++;
function rejectCompanion(mutator,pattern){const value=companionFixture();mutator(value);const before=visibility(value.nodes);assert.throws(()=>validateV0AssemblyStages(value),pattern);assert.deepEqual(visibility(value.nodes),before);negatives++}
rejectCompanion(x=>{x.companions=null},/companions/);
rejectCompanion(x=>{x.companions[0].node=x.nodes.get('rail')},/duplicate.*node/);
rejectCompanion(x=>{x.companions.push(x.companions[0])},/duplicate.*node/);
rejectCompanion(x=>{x.companions[0].part_keys.push('unknown')},/Unknown.*key/);
rejectCompanion(x=>{x.companions[0].part_keys.push('rail')},/Duplicate.*key/);
rejectCompanion(x=>{x.companions[0].part_keys=[]},/Missing.*keys/);
rejectCompanion(x=>{x.companions.push({node:{visible:true},part_keys:['rail']})},/Duplicate.*key/);
rejectCompanion(x=>{x.companions[0].node.visible=null},/visibility/);
rejectCompanion(x=>{Object.defineProperty(x.companions[0].node,'visible',{writable:false})},/writable/);
rejectCompanion(x=>{x.nodes.get('rail').parent=x.companions[0].node},/contains a native/);
rejectCompanion(x=>{x.nodes.get('rail').visible=true},/replacement is still visible/);
rejectCompanion(x=>{x.companions[0].node.parent=x.nodes.get('screw')},/overlap.*roots/);
rejectCompanion(x=>{const second={node:{visible:true,parent:x.companions[0].node},part_keys:['bed']};x.nodes.get('bed').visible=false;x.companions.push(second)},/overlap.*roots/);
for(const change of ['wrapper visibility','child visibility','wrapper parent','readonly']){
 const value=companionFixture(),c=createV0AssemblyStages(value),node=value.companions[0].node,child=node.children[0];c.setStage(0);let restore;
 if(change==='wrapper visibility'){node.visible=true;restore=()=>{node.visible=false}}
 if(change==='child visibility'){child.visible=false;restore=()=>{child.visible=true}}
 if(change==='wrapper parent'){const parent=node.parent;node.parent={visible:true};restore=()=>{node.parent=parent}}
 if(change==='readonly'){Object.defineProperty(node,'visible',{writable:false});restore=()=>{Object.defineProperty(node,'visible',{writable:true})}}
 const before=visibility(value.nodes),wrapperBefore=node.visible;
 assert.throws(()=>c.setStage(2),/changed/);assert.deepEqual(visibility(value.nodes),before);assert.equal(node.visible,wrapperBefore);negatives++;
 assert.throws(()=>c.leave(),/changed/);assert.deepEqual(visibility(value.nodes),before);assert.equal(node.visible,wrapperBefore);negatives++;
 restore();c.leave();assert.equal(node.visible,true);positives++;
}
// Optional final JSON: validate every registered row against metadata manifests
// from an explicit public asset root, or stage-derived keyed fixtures. No model
// download/parse or actual geometry certification is implied by this mode.
let catalogRows=0;
if(process.argv[2]){
 const catalog=JSON.parse(await fs.readFile(process.argv[2],'utf8'));assert.equal(catalog.schema,v0AssemblySchema);assert(catalog.machines&&Object.keys(catalog.machines).length);
 for(const [id,machine]of Object.entries(catalog.machines)){
  let manifest,manifestSHA=machine.manifest_sha256;
  if(process.argv[3]){const bytes=await fs.readFile(new URL('machines/'+encodeURIComponent(id)+'/assembly_manifest.json',new URL('file:///'+process.argv[3].replace(/\\/g,'/').replace(/\/$/,'')+'/')));const {createHash}=await import('node:crypto');manifestSHA=createHash('sha256').update(bytes).digest('hex');manifest=JSON.parse(bytes.toString('utf8'))}
  else manifest={machine_id:id,parts:machine.stages.flatMap(s=>s.part_keys).map(key=>({key}))};
  const nodes=new Map(manifest.parts.map(p=>[p.key,{visible:p.native_hidden!==true,userData:{part_key:p.key}}]));
  const c=createV0AssemblyStages({nodes,manifest,machine:catalog,receipts:{'model.glb':machine.model_sha256,'assembly_manifest.json':manifestSHA}}),original=visibility(nodes);
  for(const index of [0,machine.stages.length-1,Math.floor((machine.stages.length-1)/2),0])c.setStage(index);c.leave();assert.deepEqual(visibility(nodes),original);catalogRows++;
 }
}
console.log(JSON.stringify({result:'PASS',positives,negatives,catalog_rows:catalogRows,scope:'Production static cumulative stage validation/controller with keyed object fixtures. Optional catalog mode validates stage mapping and supplied manifest bytes; it does not authenticate or audit actual GLB geometry, manual bytes, insertion motion or native-solid clearance.'},null,2));
