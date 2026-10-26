// Independent adversarial review. Imported production helpers and exact app
// function bodies; UI/storage are observation doubles, never mirrored reducers.
// Passing planning-envelope checks are not browser, CAD or clearance proof.
import assert from 'node:assert/strict';
import {needsEquipmentPreview} from '../site/layout/layout-equipment-preview.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const site=path.resolve(option('--site')||fileURLToPath(new URL('../site/',import.meta.url)));
const resources=new Map();
function read(relative){const file=path.join(site,relative),bytes=fs.readFileSync(file);resources.set(relative,{file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});return bytes.toString('utf8');}
const sources=Object.fromEntries(['layout/layout-state.mjs','layout/layout-groups.mjs','layout/layout-group-data.mjs',
  'layout/layout-app.mjs','layout/layout-geometry.mjs','layout/layout-constraints.mjs','layout/layout-placement.mjs','layout/layout-i18n.mjs',
  'layout/layout-clipboard.mjs','layout/layout-collision.mjs'].map(file=>[file,read(file)]));
const groupsURL=pathToFileURL(path.join(site,'layout/layout-groups.mjs'));
// Match the production dependency identity, including its cache query. Error
// constructors from separate ESM URLs are distinct even with identical bytes.
const stateSpecifier=sources['layout/layout-groups.mjs'].match(/\bfrom\s*(['"])(\.\/layout-state\.mjs(?:\?[^'"]*)?)\1/u)?.[2];
assert(stateSpecifier,'Missing production layout-state dependency in layout-groups.mjs');
const stateModuleURL=new URL(stateSpecifier,groupsURL).href;
const S=await import(stateModuleURL);
const G=await import(groupsURL);
const D=await import(pathToFileURL(path.join(site,'layout/layout-group-data.mjs')));
const P=await import(pathToFileURL(path.join(site,'layout/layout-placement.mjs')));
const I=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const H=await import(pathToFileURL(path.join(site,'layout/layout-clipboard.mjs')));
const app=sources['layout/layout-app.mjs'];
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
// Deliberately small, asymmetric envelopes make independent numerical witnesses
// easy to calculate. They are test inputs, not substitute registered CAD assets.
const rows=[{id:'review-machine',label:'Review machine',widthMm:100,depthMm:60,heightMm:100}];
const C=S.createCatalog(rows);
const printer=(id,parentId=null,xMm=0,zMm=0,yawDeg=0,surfaceId=parentId?'top':'floor')=>({id,machineId:rows[0].id,configurationId:'config:keep/exact',attachment:{parentId,surfaceId,...pose(xMm,zMm,yawDeg)}});
const desk=(id='bench',x=0,z=0,yaw=0)=>S.createDesk({id,widthMm:600,depthMm:400,heightMm:700,pose:pose(x,z,yaw)});
const empty=()=>S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000})},C);
function farm(){return G.createGroup(S.createDefaultLayout({room:empty().room,furniture:[desk()],printers:[printer('on-bench','bench',-150),printer('on-bench-2','bench',150),printer('loose',null,900)]},C),{id:'farm',name:'Review cell',memberIds:['bench','loose']},C);}
const encode=state=>S.serializeLayout(state,C);
const clone=value=>JSON.parse(JSON.stringify(value));
function rejected(fn,codes){assert.throws(fn,error=>error instanceof S.LayoutValidationError&&(!codes||error.errors.some(e=>codes.includes(e.code))));}
const line=(file,needle)=>{const text=sources[file],index=text.indexOf(needle);assert(index>=0,`Missing source witness ${needle}`);return {file,line:text.slice(0,index).split('\n').length,ref:needle};};
const ref=(module,needle)=>line(`layout/layout-${module}.mjs`,needle);
function slice(begin,end){const from=app.indexOf(begin),to=app.indexOf(end,from+begin.length);assert(from>=0&&to>from,`App body boundary changed: ${begin}`);assert.equal(app.indexOf(begin,from+begin.length),-1,`Ambiguous app body: ${begin}`);return app.slice(from,to);}
const lifecycle=slice('const id=prefix=>','function makeDefault(');
const motion=slice('let pendingMove=','\nasync function render(');
const actions=slice('async function act(action){','\nfunction updateViewPresentation(');

function replay(initial,{library=[],storageFailure=false}={}){
  // All group/state/placement decisions below come from the exact product
  // bodies above. Only browser services and observable sinks are doubles.
  const factory=new Function('deps',`
 const needsEquipmentPreview=${needsEquipmentPreview.toString()},isLayoutEquipmentPreviewPrepared=()=>false,prepareLayoutEquipmentPreview=()=>{throw Error('Unexpected equipment request in native-only fixture');};const equipmentRows=[];

    const {createDefaultLayout,createDesk,createShelf,createCatalog,applyAction,applyWorldMove,resolveWorldMove,resolveWorldRotation,placementViolations,deriveScene,worldTransform,validatePlacement,serializeLayout,parseLayout,resolveSupportedPrinterRotation}=deps.S;
    const {createGroup,renameGroup,ungroup,removeGroup,groupInfo,transformGroup,resolveGroupMove,resolveGroupRotation,captureGroupTemplate,groupTemplateInfo,proposeGroupPlacement,parseGroupLibrary,GROUP_LIBRARY_LIMIT}=deps.G;
    const {proposePlacement}=deps.P;
    const {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard,regroupLayoutSelection}=deps.H;
    let state=deps.initial,catalog=deps.catalog,rows=deps.rows,selected=null,busy=false,roomEditing=false,disposed=false,operation=null,renderURL=null;
    let placement=null,lastPlacementTarget=null,interactionGeneration=0,nextId=1,groupLibrary=deps.library,storageFailure=deps.storageFailure,clipboardText='';
    const past=[],future=[],writes=[],updates=[],libraries=[],views=[],errors=[],status={hidden:true,textContent:'',dataset:{}};
    const maxFileBytes=2*1024*1024,storageKey='3d-print-rig-layout-v1',groupLibraryKey='3d-print-rig-layout-sets-v1';
    const document={body:{dataset:{}}},$=selector=>selector==='#layout-status'?status:null;
    const language={t:deps.translate},localStorage={setItem(key,value){if(storageFailure)throw Error('Storage blocked');writes.push({key,value});}};
    const ui={update(next,id,issues){updates.push({state:next,id,issues});},setStatus(value){if(value.error)errors.push(value.message);},setGroupLibrary(items){libraries.push(items);}};
    const view={setState(){},setPlacement(){},refreshPlacement(){return true;},view(mode){views.push(mode);},canvas:{focus(){}}};
    ${lifecycle}
    ${motion}
    const render=()=>{throw Error('Rendering is outside this replay');};
    ${actions}
    return {act,previewPlacement,placeProposal,worldMove,worldRotate,constrainMove,constrainRotate,cancelPlacement,commit,
      flags:patch=>{if('busy'in patch)busy=patch.busy;if('roomEditing'in patch)roomEditing=patch.roomEditing;if('disposed'in patch)disposed=patch.disposed;if('storageFailure'in patch)storageFailure=patch.storageFailure;},
      read:()=>({state,selected,placement,lastPlacementTarget,groupLibrary,past:[...past],future:[...future],writes:[...writes],updates:[...updates],libraries:[...libraries],views:[...views],errors:[...errors],status:{...status}})};
  `);
  return factory({S,G,P,H,initial,catalog:C,rows,library:clone(library),storageFailure,translate:I.createLayoutTranslator('en')});
}

const tests=[];
async function test(name,refs,run){const evidence={};try{await run(evidence);tests.push({name,status:'PASS',refs,evidence});}catch(error){tests.push({name,status:'FAIL',refs,evidence,error:{name:error.name,message:error.message,stack:error.stack}});}}

await test('hostile imported group shapes reject with structured errors and no prototype writes',[ref('state','if (state.groups !== undefined)')],()=>{
  const base=farm(),before=encode(base);
  for(const bad of [null,{},'farm',Array(S.LIMITS.maxGroups+1).fill(null),[null],[[]],[{...clone(base.groups[0]),__unexpected:true}]]){
    const candidate={...clone(base),groups:bad};rejected(()=>S.parseLayout(JSON.stringify(candidate),C));
  }
  const pollution=JSON.parse(JSON.stringify(base).replace('"name":"Review cell"','"__proto__":{"reviewPolluted":true},"name":"Review cell"'));
  rejected(()=>S.parseLayout(JSON.stringify(pollution),C),['UNKNOWN_FIELD']);assert.equal({}.reviewPolluted,undefined);assert.equal(encode(base),before);
});
await test('group import enforces bounded arrays, names and finite canonical coordinates',[ref('state','if (!Array.isArray(g.memberIds)'),ref('state','poseCheck(g.pose')],()=>{
  const base=farm();const edits=[g=>g.name='x'.repeat(81),g=>g.name='bad\u0000name',g=>g.memberIds=Array(193).fill('bench'),g=>g.memberPoses=Array(193).fill({id:'bench',pose:pose()}),g=>g.originPose.xMm=S.LIMITS.maxCoordinateMm+1,g=>g.pose.yawDeg=S.LIMITS.maxYawDeg+1,g=>delete g.pose.zMm];
  for(const edit of edits){const candidate=clone(base);edit(candidate.groups[0]);rejected(()=>S.parseLayout(JSON.stringify(candidate),C));}
  rejected(()=>S.parseLayout(' '.repeat(S.LIMITS.maxJsonChars+1),C),['JSON_SIZE_LIMIT']);
});
await test('canonical reference IDs cannot be swapped, duplicated, missing, attached or assigned twice',[ref('state','const references = new Set()'),ref('state','if (assigned.has(id)')],()=>{
  const base=farm();const edits=[g=>g.memberPoses[0].id='missing',g=>g.memberPoses[1].id='bench',g=>g.memberPoses.pop(),g=>g.memberIds[0]='on-bench',g=>g.memberIds[1]='bench',g=>g.memberPoses[0].pose.xMm+=.125];
  for(const edit of edits){const candidate=clone(base);edit(candidate.groups[0]);rejected(()=>S.parseLayout(JSON.stringify(candidate),C));}
  const shared=clone(base);shared.groups.push({...clone(base.groups[0]),id:'other-farm'});rejected(()=>S.parseLayout(JSON.stringify(shared),C),['GROUP_MEMBER_ASSIGNED']);
  for(const id of ['bench','farm']){const candidate=clone(base);candidate.groups.push({...clone(base.groups[0]),id});rejected(()=>S.parseLayout(JSON.stringify(candidate),C),['DUPLICATE_ENTITY_ID']);}
});
await test('invalid group and root IDs return INVALID_ID diagnostics instead of throwing TypeError',[ref('state','identifier(g.id,'),ref('state','identifier(id, `${path}.memberIds')],e=>{
  const observations=[];
  for(const target of ['group-id','root-id'])for(const id of ['constructor','prototype','__proto__','x'.repeat(129),'bad id',null]){
    const candidate=clone(farm());if(target==='group-id')candidate.groups[0].id=id;else{candidate.groups[0].memberIds[0]=id;candidate.groups[0].memberPoses[0].id=id;}
    try{const result=S.validateState(candidate,C);observations.push({target,id,result});}catch(error){observations.push({target,id,exception:{name:error.name,message:error.message}});}
  }
  const invalidPlan=clone(farm());invalidPlan.groups[0].id='__proto__';
  e.counterexample={mutation:'Set groups[0].id or groups[0].memberIds[0] and its canonical reference id to an invalid identifier in an otherwise-valid farm plan.',invalidPlan,observations};
  assert.deepEqual(observations.filter(o=>o.exception),[],'validateState must report structured invalid-ID errors for hostile JSON');
  assert(observations.every(o=>o.result.ok===false&&o.result.errors.some(error=>error.code==='INVALID_ID')));
});
await test('canonical anchors reject stale local references after a real group rotation',[ref('group-data','export function groupRootPose'),ref('state',"issue(errors,'GROUP_POSE_MISMATCH'")],()=>{
  const moved=G.transformGroup(farm(),'farm',{yawDeg:37,xMm:500,zMm:-100},C),bad=clone(moved);bad.groups[0].memberPoses[1].pose.zMm+=.00001;
  rejected(()=>S.parseLayout(JSON.stringify(bad),C),['GROUP_POSE_MISMATCH']);assert.deepEqual(S.parseLayout(encode(moved),C),moved);
});
await test('saved library rejects oversized text, count, duplicate IDs and missing template parents',[ref('groups','export function parseGroupLibrary'),ref('groups','export function validateGroupTemplate')],()=>{
  const template=G.captureGroupTemplate(farm(),'farm',C),item={id:'saved',template};
  rejected(()=>G.parseGroupLibrary('x'.repeat(S.LIMITS.maxJsonChars+1),C),['JSON_SIZE_LIMIT']);
  rejected(()=>G.parseGroupLibrary(JSON.stringify(Array.from({length:G.GROUP_LIBRARY_LIMIT+1},(_,i)=>({...item,id:`saved-${i}`}))),C),['GROUP_LIBRARY_LIMIT']);
  rejected(()=>G.parseGroupLibrary(JSON.stringify([item,item]),C),['GROUP_TEMPLATE']);
  for(const bad of [null,{},[null],[{...item,id:'__proto__'}],[{...item,extra:true}],[{...item,template:{...template,name:'\u007fbad'}}]])rejected(()=>G.parseGroupLibrary(JSON.stringify(bad),C));
  const broken=clone(item);broken.template.printers[0].attachment.parentId='outside-template';rejected(()=>G.parseGroupLibrary(JSON.stringify([broken]),C),['UNKNOWN_PARENT']);
});
await test('maximum library validates each independent set without aliasing imported objects',[ref('groups','return clone(items)')],()=>{
  const template=G.captureGroupTemplate(farm(),'farm',C),items=Array.from({length:G.GROUP_LIBRARY_LIMIT},(_,i)=>({id:`saved-${i}`,template:clone(template)}));
  const parsed=G.parseGroupLibrary(JSON.stringify(items),C);assert.equal(parsed.length,24);parsed[0].template.furniture[0].widthMm=777;assert.equal(parsed[1].template.furniture[0].widthMm,600);assert.equal(items[0].template.furniture[0].widthMm,600);
});
await test('prefix-like IDs and shelf surface IDs remap parents exactly without rewriting local identities',[ref('groups','const printers=source.printers.map'),ref('groups','source.furniture.forEach')],()=>{
  const shelf=S.createShelf({id:'stamp:p1',widthMm:800,depthMm:600,heightMm:1400,levels:[{id:'stamp:f1',topMm:200},{id:'same-as-printer',topMm:1000}]}),parent=shelf.id;
  const input=S.createDefaultLayout({room:empty().room,furniture:[shelf],printers:[printer('same-as-printer',parent,0,0,13,'stamp:f1'),printer('stamp:f1',parent,0,0,-23,'same-as-printer')]},C);
  const grouped=G.createGroup(input,{id:'source-group',name:'Rack',memberIds:[parent]},C),template=G.captureGroupTemplate(grouped,'source-group',C);
  const next=G.instantiateGroupTemplate(empty(),template,{id:'stamp',xMm:1200,zMm:500,yawDeg:90},C);
  assert.deepEqual(next.groups[0].memberIds,['stamp:f1']);assert.equal(next.printers[0].attachment.parentId,'stamp:f1');assert.equal(next.printers[0].attachment.surfaceId,'stamp:f1');
  assert.equal(next.printers[1].attachment.surfaceId,'same-as-printer');assert.equal(next.printers[1].configurationId,'config:keep/exact');assert.equal(S.validateState(next,C).ok,true);assert.equal(S.validatePlacement(next,C).length,0);
});
await test('duplicate destination IDs reject atomically without partially remapping parents',[ref('groups','export function instantiateGroupTemplate')],()=>{
  const template=G.captureGroupTemplate(farm(),'farm',C),target=S.createDefaultLayout({room:empty().room,furniture:[desk('copy:f1',-3500)]},C),before=encode(target);
  rejected(()=>G.instantiateGroupTemplate(target,template,{id:'copy',xMm:2000,zMm:0},C),['DUPLICATE_ENTITY_ID']);assert.equal(encode(target),before);
});
await test('group path cannot cut through a narrow interior notch with valid endpoints',[ref('groups','const accepts=pose=>'),ref('groups','export function transformGroup')],e=>{
  const room=S.createRoomPolygon({polygonMm:[[0,0],[6000,0],[6000,4000],[3001,4000],[3001,1000],[2999,1000],[2999,4000],[0,4000]]});
  const input=S.createDefaultLayout({room,furniture:[desk('notch-probe',1000,3000)]},C),grouped=G.createGroup(input,{id:'g',name:'Notch',memberIds:['notch-probe']},C);
  e.counterexample={room:room.polygonMm,start:pose(1000,3000),end:pose(5000,3000),independentWitness:'At t=0.5, footprint contains x=3000,z=3000 inside the 2 mm notch.'};
  rejected(()=>G.transformGroup(grouped,'g',{xMm:5000,zMm:3000},C),['ROOM_OUT_OF_BOUNDS']);
  const resolved=G.resolveGroupMove(grouped,{id:'g',x:5000,z:3000},C,{snapMm:0});assert(resolved.boundaryLimited);assert(resolved.x<=2699);assert.equal(S.validatePlacement(resolved.state,C).length,0);
});
await test('separate group roots may occupy both arms while their empty bounding box crosses the corner',[ref('groups','const entities=[...scene.furniture'),ref('groups','if(contained&&convex&&delta===0)')],()=>{
  const room=S.createRoomPolygon({polygonMm:[[0,0],[5000,0],[5000,2000],[2000,2000],[2000,5000],[0,5000]]});
  const input=S.createDefaultLayout({room,furniture:[desk('west',800,3000),desk('south',3000,800)]},C),g=G.createGroup(input,{id:'g',name:'Two arms',memberIds:['west','south']},C);
  const next=G.transformGroup(g,'g',{xMm:g.groups[0].pose.xMm+50,zMm:g.groups[0].pose.zMm+50},C);assert.equal(S.validatePlacement(next,C).length,0);assert.equal(next.furniture[0].pose.xMm,850);assert.equal(next.furniture[1].pose.zMm,850);
});
await test('signed 180 and 360 degree turns cannot tunnel through a narrow rectangular room',[ref('groups','const pieces=Math.max'),ref('groups','export function resolveGroupRotation')],()=>{
  const room=S.createRoomRect({widthMm:1800,depthMm:500}),f=S.createDesk({id:'long',widthMm:1600,depthMm:300}),g=G.createGroup(S.createDefaultLayout({room,furniture:[f]},C),{id:'g',name:'Long',memberIds:['long']},C);
  for(const yawDeg of [180,-180,360,-360]){rejected(()=>G.transformGroup(g,'g',{yawDeg},C),['ROOM_OUT_OF_BOUNDS']);const p=G.resolveGroupRotation(g,{id:'g',yawDeg},C,{snapDeg:0});assert(p.boundaryLimited);assert(Math.abs(p.yawDeg)<90);assert.equal(S.validatePlacement(p.state,C).length,0);}
});
await test('wall-limited dogleg and immediate reversal preserve roots and implicit attachments',[ref('groups','// Keep the accepted dogleg.')],()=>{
  const g=farm(),local=g.printers.filter(p=>p.attachment.parentId!==null),r=G.resolveGroupMove(g,{id:'farm',x:9000,z:1400},C,{snapMm:0});assert(r.boundaryLimited);assert.equal(S.validatePlacement(r.state,C).length,0);
  const reverse=G.resolveGroupMove(r.state,{id:'farm',x:g.groups[0].pose.xMm,z:g.groups[0].pose.zMm},C,{snapMm:0});assert.deepEqual(reverse.state,g);assert.deepEqual(reverse.state.printers.filter(p=>p.attachment.parentId!==null),local);
});
await test('furniture resize and child edits retain anchors while individual root moves rebase exactly',[ref('group-data','export function rebaseLayoutGroups')],()=>{
  const start=G.transformGroup(farm(),'farm',{yawDeg:29,xMm:200,zMm:100},C),anchor=start.groups[0];
  let edited=S.applyAction(start,{type:'UPDATE_FURNITURE',id:'bench',patch:{widthMm:700}},C);assert.deepEqual(edited.groups[0],anchor);
  edited=S.applyAction(edited,{type:'UPDATE_PRINTER',id:'on-bench',patch:{attachment:{xMm:-170,yawDeg:21}}},C);assert.deepEqual(edited.groups[0],anchor);
  edited=S.applyAction(edited,{type:'UPDATE_FURNITURE',id:'bench',patch:{pose:{xMm:edited.furniture[0].pose.xMm+40}}},C);
  assert.deepEqual(edited.groups[0].originPose,anchor.pose);assert.deepEqual(D.groupRootPose(edited.groups[0],'bench'),edited.furniture[0].pose);
  const back=G.transformGroup(G.transformGroup(edited,'farm',{yawDeg:119,zMm:400},C),'farm',edited.groups[0].pose,C);assert.deepEqual(back,edited);assert.deepEqual(S.parseLayout(encode(back),C),edited);
});
await test('reattachment across groups follows real support while ungrouped roots remain canonical',[ref('group-data','const memberIds=group.memberIds.filter'),ref('groups','export function groupingForEntity')],()=>{
  let state=farm();state=S.applyAction(state,{type:'ADD_FURNITURE',furniture:desk('other-bench',2500)},C);state=G.createGroup(state,{id:'other',name:'Other',memberIds:['other-bench']},C);
  state=S.applyAction(state,{type:'SET_ATTACHMENT',id:'loose',attachment:{parentId:'other-bench',surfaceId:'top',...pose()}},C);
  assert.deepEqual(state.groups[0].memberIds,['bench']);assert.equal(G.groupingForEntity(state,'loose').id,'other');assert(G.groupEntityIds(state,'other').includes('loose'));assert.equal(S.validateState(state,C).ok,true);
  const noParent=S.applyAction(state,{type:'REMOVE_FURNITURE',id:'other-bench',detachChildren:true},C);assert.equal(G.groupingForEntity(noParent,'loose'),null);assert.equal(noParent.groups.length,1);assert.equal(S.validateState(noParent,C).ok,true);
});
await test('hostile group imports preserve app selection, state, history, redo and saved library',[ref('app',"case 'import':{"),ref('app','const next=parseLayout(text,catalog)')],async()=>{
  const initial=farm(),template=G.captureGroupTemplate(initial,'farm',C),r=replay(initial,{library:[{id:'saved',template}]});await r.act({type:'select',id:'farm'});await r.act({type:'group-rename',id:'farm',name:'Edited'});await r.act({type:'undo'});const before=r.read();
  const invalid=clone(initial);invalid.groups[0].memberIds=['on-bench'];const text=JSON.stringify(invalid);await r.act({type:'import',file:{size:text.length,text:async()=>text}});
  const after=r.read();assert.strictEqual(after.state,before.state);assert.deepEqual(after.past,before.past);assert.deepEqual(after.future,before.future);assert.equal(after.selected,'farm');assert.deepEqual(after.writes,before.writes);assert.deepEqual(after.groupLibrary,before.groupLibrary);assert(after.errors.length);
});
await test('delayed import cannot replace a newer group edit, selection, reset or library action',[ref('app','const source=state,text=await action.file.text()')],async()=>{
  for(const action of [{type:'group-rename',id:'farm',name:'New name'},{type:'select',id:'bench'},{type:'reset'},{type:'group-save',id:'farm'}]){
    const initial=farm(),r=replay(initial);let finish;const pending=r.act({type:'import',file:{size:encode(empty()).length,text:()=>new Promise(resolve=>finish=resolve)}});
    await r.act(action);const before=r.read();finish(encode(empty()));await pending;const after=r.read();assert.strictEqual(after.state,before.state);assert.deepEqual(after.writes,before.writes);assert.deepEqual(after.past,before.past);assert.equal(after.selected,before.selected);assert.deepEqual(after.groupLibrary,before.groupLibrary);
  }
});
await test('queued placement callbacks after undo, import and reset cannot resurrect canceled groups',[ref('app','function placeProposal('),ref('app',"if(placement&&!['add','duplicate','group-place','copy','paste']")],async()=>{
  for(const action of [{type:'undo'},{type:'reset'},{type:'import',file:{size:encode(empty()).length,text:async()=>encode(empty())}}]){
    const r=replay(farm());await r.act({type:'group-rename',id:'farm',name:'Before preview'});await r.act({type:'duplicate',id:'farm'});const old=r.previewPlacement({xMm:2500,zMm:2000,yawDeg:0,altKey:true});assert(old.valid,JSON.stringify(old.issues));
    await r.act(action);const before=r.read();assert.equal(before.placement,null);r.placeProposal(old,{repeat:true});assert.strictEqual(r.read().state,before.state);assert.deepEqual(r.read().writes,before.writes);
  }
});
await test('queued preview rechecks a changed room and cannot commit its old valid state',[ref('app','const fresh=previewPlacement(lastPlacementTarget)')],async()=>{
  const r=replay(farm());await r.act({type:'duplicate',id:'farm'});const old=r.previewPlacement({xMm:3000,zMm:2000,yawDeg:0,altKey:true});assert(old.valid);
  const smaller=S.applyAction(r.read().state,{type:'SET_ROOM',room:S.createRoomRect({widthMm:4000,depthMm:4000})},C);r.commit(smaller);const before=r.read();r.placeProposal(old);assert.strictEqual(r.read().state,before.state);assert.deepEqual(r.read().writes,before.writes);
});
await test('accepted old gesture callbacks cannot recreate groups removed by reset or import',[ref('app','function worldMove('),ref('app','function worldRotate(')],async()=>{
  for(const action of [{type:'reset'},{type:'import',file:{size:encode(empty()).length,text:async()=>encode(empty())}}]){
    const initial=farm(),r=replay(initial),p=initial.groups[0].pose,origin={x:p.xMm,z:p.zMm};
    const move=r.constrainMove({id:'farm',x:1100,z:600},{origin,previous:origin});assert(move);
    const rotation=r.constrainRotate({id:'farm',yawDeg:45},{origin:{yawDeg:0},previous:{yawDeg:0},snapDeg:15});assert(rotation);
    await r.act(action);const before=r.read();assert.equal(r.worldMove({id:'farm',x:move.x,z:move.z}),false);assert.equal(r.worldRotate({id:'farm',yawDeg:rotation.yawDeg}),false);assert.strictEqual(r.read().state,before.state);assert.deepEqual(r.read().past,before.past);assert.deepEqual(r.read().writes,before.writes);
  }
});
await test('repeated placement, undo and redo keep remapped parents and do not mutate saved templates',[ref('app','if(keepPlacing){'),ref('app',"case 'undo':")],async()=>{
  const original=farm(),template=G.captureGroupTemplate(original,'farm',C),saved=JSON.stringify(template),r=replay(empty(),{library:[{id:'saved',template}]});await r.act({type:'group-place',templateId:'saved'});
  let p=r.previewPlacement({xMm:-2500,zMm:0,yawDeg:90,altKey:true});assert(p.valid);r.placeProposal(p,{repeat:true});p=r.previewPlacement({xMm:2500,zMm:0,yawDeg:-90,altKey:true});assert(p.valid);r.placeProposal(p);
  const placed=r.read().state;assert.equal(placed.groups.length,2);assert.equal(new Set([...placed.furniture,...placed.printers,...placed.groups].map(e=>e.id)).size,10);
  for(const group of placed.groups){const parent=group.memberIds.find(id=>placed.furniture.some(f=>f.id===id));assert.equal(placed.printers.filter(p=>p.attachment.parentId===parent).length,2);}
  await r.act({type:'undo'});assert.equal(r.read().state.groups.length,1);await r.act({type:'redo'});assert.deepEqual(r.read().state,placed);assert.equal(JSON.stringify(r.read().groupLibrary[0].template),saved);
});
await test('saved-library storage failure leaves plan, library, history and metadata atomic',[ref('app','function saveGroupLibrary(items)')],async()=>{
  const initial=farm(),template=G.captureGroupTemplate(initial,'farm',C),r=replay(initial,{library:[{id:'saved',template}],storageFailure:true}),before=r.read();
  await r.act({type:'group-save',id:'farm'});await r.act({type:'group-template-remove',templateId:'saved'});const after=r.read();assert.strictEqual(after.state,before.state);assert.deepEqual(after.groupLibrary,before.groupLibrary);assert.deepEqual(after.past,[]);assert.deepEqual(after.writes,[]);assert.deepEqual(after.libraries,[]);assert(after.errors.every(e=>e===I.t('layout.error.GROUP_LIBRARY_STORAGE')));
});
await test('reset and undo restore exact rebased group anchors without losing saved units',[ref('app',"case 'reset':"),ref('app','function commit(next')],async()=>{
  const initial=farm(),r=replay(initial);await r.act({type:'UPDATE_FURNITURE',id:'bench',patch:{pose:{xMm:75.125}}});await r.act({type:'group-transform',id:'farm',patch:{yawDeg:41}});await r.act({type:'group-save',id:'farm'});const edited=r.read();await r.act({type:'reset'});assert.deepEqual(r.read().state,S.createDefaultLayout());assert.equal(r.read().groupLibrary.length,1);await r.act({type:'undo'});assert.deepEqual(r.read().state,edited.state);assert.deepEqual(r.read().groupLibrary,edited.groupLibrary);
});
await test('app generated group IDs avoid an imported descendant ID collision',[ref('app','const id='),ref('app','function beginPlacement('),ref('groups','export function instantiateGroupTemplate')],async e=>{
  const target=S.createDefaultLayout({room:empty().room,furniture:[desk('unit-1:f1',-3500,-3000)]},C),template=G.captureGroupTemplate(farm(),'farm',C),r=replay(target,{library:[{id:'saved',template}]});
  await r.act({type:'group-place',templateId:'saved'});const result=r.previewPlacement({xMm:2000,zMm:0,yawDeg:0,altKey:true});
  e.counterexample={existingFurnitureId:'unit-1:f1',requestedAction:{type:'group-place',templateId:'saved'},generatedGroupId:r.read().placement.id,target:{xMm:2000,zMm:0,yawDeg:0},result:{valid:result.valid,issues:result.issues},initialPlan:target,template};
  assert.equal(result.valid,true,'An unrelated imported descendant-style ID must not make the first saved unit placement impossible');
});

const sourceChanges=[];
for(const [relative,input]of resources){const actual=createHash('sha256').update(fs.readFileSync(input.file)).digest('hex');if(actual!==input.sha256)sourceChanges.push({file:relative,loaded:input.sha256,current:actual});}
const report={schema:'layout-group-edge-cases-review-v1',testedAt:new Date().toISOString(),nodeVersion:process.version,caseWorkers:1,passed:tests.every(t=>t.status==='PASS')&&!sourceChanges.length,
  productionStateSpecifier:stateSpecifier,stateModuleURL,
  tests,sourceInputs:Object.fromEntries(resources),sourceChanges,
  script:{path:fileURLToPath(import.meta.url),sha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex')},
  scope:'Actual helper exports and exact app function bodies; synthetic small planning envelopes; browser/UI/storage sinks are observation doubles. No browser, GPU, printer-model, native-solid, release or performance certification.'};
if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(option('--snapshot-dir')){
  const directory=path.resolve(option('--snapshot-dir'));fs.mkdirSync(directory,{recursive:true});
  for(const [relative,source]of Object.entries(sources)){const destination=path.join(directory,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,source,{flag:'wx'});}
  fs.writeFileSync(path.join(directory,'test_layout_group_edge_cases.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)),{flag:'wx'});
}
for(const failure of tests.filter(t=>t.status==='FAIL'))console.error(JSON.stringify(failure));
console.log(JSON.stringify({passed:report.passed,tests:tests.length,failures:tests.filter(t=>t.status==='FAIL').map(t=>t.name),sourceChanges,sourceInputs:report.sourceInputs,scope:report.scope}));
if(!report.passed)process.exitCode=1;
