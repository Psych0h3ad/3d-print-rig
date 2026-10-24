// Group transactions, real support parenting, continuous room paths and saved sets.
// These are static planning-envelope checks, not native printer fit evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=process.argv.indexOf('--site'),site=option<0?path.join(root,'site'):path.resolve(process.argv[option+1]);
const S=await import(pathToFileURL(path.join(site,'layout/layout-state.mjs')));
const G=await import(pathToFileURL(path.join(site,'layout/layout-groups.mjs')));
const C=S.createCatalog([{id:'a',widthMm:200,depthMm:160,heightMm:300},{id:'b',widthMm:180,depthMm:180,heightMm:250,baseOffsetMm:12}]);
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const printer=(id,parentId,xMm=0,zMm=0,surfaceId=parentId?'top':'floor')=>({id,machineId:'a',configurationId:'actual-saved-configuration',attachment:{parentId,surfaceId,...pose(xMm,zMm)}});
const empty=()=>S.createDefaultLayout({room:S.createRoomRect({widthMm:12000,depthMm:10000})},C);
const rejects=(fn,code)=>assert.throws(fn,error=>error.errors?.some(e=>e.code===code));
const cases=[];
function test(name,run){run();cases.push(name);}
function unit(){
  let s=S.createDefaultLayout({room:empty().room,furniture:[S.createDesk({id:'desk',widthMm:1200,depthMm:700,pose:pose(-1800,-900)})],
    printers:[printer('left','desk',-300,0),printer('right','desk',300,0),printer('floor',null,-900,-900)]},C);
  return G.createGroup(s,{id:'farm-1',name:'Production row',memberIds:['desk','floor']},C);
}
test('legacy plans remain valid and grouping never moves source objects',()=>{
  const legacy=empty(),parsed=S.parseLayout(S.serializeLayout(legacy,C),C);assert.deepEqual(parsed,legacy);
  const s=unit(),g=s.groups[0];assert.deepEqual(g.memberIds,['desk','floor']);
  assert.deepEqual(s.furniture[0].pose,pose(-1800,-900));assert.equal(G.groupingForEntity(s,'left').id,g.id);
  assert.deepEqual(G.groupEntityIds(s,g.id),['desk','floor','left','right']);
  assert.equal(G.groupInfo(s,g.id,C).printerCount,3);assert.equal(G.groupInfo(s,g.id,C).furnitureCount,1);
  assert.deepEqual(S.parseLayout(S.serializeLayout(s,C),C),s);
});
test('group move/turn preserves attachments and exact A-to-B-to-A reference poses',()=>{
  const a=unit(),p=a.groups[0].pose;
  let b=G.transformGroup(a,'farm-1',{xMm:1400,zMm:800,yawDeg:37},C);
  for(const id of ['left','right'])assert.deepEqual(b.printers.find(e=>e.id===id).attachment,a.printers.find(e=>e.id===id).attachment);
  b=G.transformGroup(b,'farm-1',{yawDeg:127},C);
  const back=G.transformGroup(b,'farm-1',p,C);assert.deepEqual(back,a);
  const before=JSON.stringify(b);rejects(()=>G.transformGroup(b,'farm-1',{xMm:900000},C),'ROOM_OUT_OF_BOUNDS');assert.equal(JSON.stringify(b),before);
});
test('item edits rebase, deleting a root cleans membership and attachment changes never orphan a group',()=>{
  let s=unit();s=S.applyAction(s,{type:'UPDATE_FURNITURE',id:'desk',patch:{pose:{xMm:-1700}}},C);
  const edited=s,g=s.groups[0],m=G.transformGroup(s,g.id,{xMm:g.pose.xMm+100},C);
  assert.deepEqual(G.transformGroup(m,g.id,g.pose,C),edited);
  s=S.applyAction(s,{type:'REMOVE_PRINTER',id:'floor'},C);assert.deepEqual(s.groups[0].memberIds,['desk']);
  s=S.applyAction(s,{type:'REMOVE_FURNITURE',id:'desk',detachChildren:true},C);assert.deepEqual(s.groups,[]);
  assert.equal(s.printers.length,2);assert.ok(s.printers.every(e=>e.attachment.parentId===null));
});
test('atomic set placement remaps both IDs and furniture references, repeats, and rejects overlap',()=>{
  const original=unit(),template=G.captureGroupTemplate(original,'farm-1',C);
  let s=G.instantiateGroupTemplate(original,template,{id:'copy-1',xMm:1400,zMm:900,yawDeg:90},C);
  assert.equal(s.furniture.length,2);assert.equal(s.printers.length,6);assert.equal(s.groups.length,2);
  assert.equal(s.printers.find(e=>e.id==='copy-1:p1').attachment.parentId,'copy-1:f1');
  assert.equal(s.printers.find(e=>e.id==='copy-1:p1').configurationId,'actual-saved-configuration');
  assert.equal(s.printers.find(e=>e.id==='copy-1:p3').attachment.parentId,null);
  rejects(()=>G.instantiateGroupTemplate(s,template,{id:'copy-2',xMm:1400,zMm:900,yawDeg:90},C),'ENVELOPE_OVERLAP');
  const preview=G.proposeGroupPlacement(s,{kind:'group',id:'copy-2',template,xMm:3307,zMm:900,yawDeg:0,snapMm:10},C);
  assert.equal(preview.valid,true,JSON.stringify(preview.issues));assert.equal(preview.world.xMm,3310);
  assert.equal(preview.state.groups.length,3);assert.equal(s.groups.length,2);
  const blocked=G.proposeGroupPlacement(s,{kind:'group',id:'copy-3',template,xMm:5900,zMm:900,yawDeg:0,snapMm:0},C);
  assert.equal(blocked.valid,false);assert.equal(blocked.state,null);assert.ok(blocked.issues.some(e=>e.code==='ROOM_OUT_OF_BOUNDS'));
});
test('shelf level IDs and local attachment survive stamping and group rotations',()=>{
  const shelf=S.createShelf({id:'rack',widthMm:900,depthMm:600,heightMm:1800,levels:[{id:'low',topMm:100},{id:'upper',topMm:900},{id:'top',topMm:1800}]});
  let s=S.createDefaultLayout({room:empty().room,furniture:[shelf],printers:[printer('low','rack',0,0,'low'),printer('upper','rack',0,0,'upper')]},C);
  s=G.createGroup(s,{id:'rack-group',name:'Rack',memberIds:['rack']},C);
  const t=G.captureGroupTemplate(s,'rack-group',C),copy=G.instantiateGroupTemplate(s,t,{id:'rack-copy',xMm:2200,zMm:0,yawDeg:90},C);
  assert.equal(copy.printers.find(e=>e.id==='rack-copy:p2').attachment.surfaceId,'upper');
  const rotated=G.transformGroup(copy,'rack-copy',{yawDeg:180},C);
  assert.deepEqual(rotated.printers.find(e=>e.id==='rack-copy:p2').attachment,copy.printers.find(e=>e.id==='rack-copy:p2').attachment);
  const short={...empty(),room:{...empty().room,wallHeightMm:1000}};
  rejects(()=>G.instantiateGroupTemplate(short,t,{id:'tall',xMm:0,zMm:0,yawDeg:0},C),'ROOM_HEIGHT_EXCEEDED');
});
test('bad membership, stale anchors, unknown machines, oversized sets and malformed library reject',()=>{
  const s=unit();rejects(()=>G.createGroup(s,{id:'bad',name:'Bad',memberIds:['left']},C),'GROUP_ROOT_REQUIRED');
  rejects(()=>G.createGroup(s,{id:'bad',name:'Bad',memberIds:['desk']},C),'GROUP_MEMBER_ASSIGNED');
  rejects(()=>G.renameGroup(s,'farm-1','\u0000bad',C),'GROUP_NAME');
  const changed=structuredClone(s);changed.groups[0].memberPoses[0].pose.xMm+=1;
  assert.ok(S.validateState(changed,C).errors.some(e=>e.code==='GROUP_POSE_MISMATCH'));
  const t=G.captureGroupTemplate(s,'farm-1',C),bad=structuredClone(t);bad.printers[0].machineId='missing';
  rejects(()=>G.instantiateGroupTemplate(s,bad,{id:'bad',xMm:0,zMm:0},C),'UNKNOWN_MACHINE');
  const library=G.parseGroupLibrary(JSON.stringify([{id:'saved-1',template:t}]),C);assert.equal(library.length,1);
  rejects(()=>G.parseGroupLibrary(JSON.stringify(Array.from({length:25},(_,i)=>({id:`set-${i}`,template:t}))),C),'GROUP_LIBRARY_LIMIT');
  rejects(()=>G.parseGroupLibrary('[{"id":"x","template":null}]',C),'GROUP_TEMPLATE');
  assert.equal(G.proposeGroupPlacement(s,{id:'bad',template:t,xMm:Infinity,zMm:0,yawDeg:0},C).valid,false);
  assert.deepEqual(G.ungroup(s,'farm-1',C).furniture,s.furniture);
  assert.equal(G.removeGroup(s,'farm-1',C).printers.length,0);
});
test('concave wall crossings and full turns are checked along the path',()=>{
  const room=S.createRoomPolygon({polygonMm:[[0,0],[6000,0],[6000,2000],[2000,2000],[2000,6000],[0,6000]]});
  let s=S.createDefaultLayout({room,furniture:[S.createDesk({id:'desk',widthMm:400,depthMm:400,pose:pose(1000,4000)})]},C);
  s=G.createGroup(s,{id:'g',name:'Cell',memberIds:['desk']},C);
  rejects(()=>G.transformGroup(s,'g',{xMm:4000,zMm:1000},C),'ROOM_OUT_OF_BOUNDS');
  const end=G.resolveGroupMove(s,{id:'g',x:4000,z:1000},C,{snapMm:0});
  assert.ok(end.boundaryLimited);assert.equal(S.validatePlacement(end.state,C).filter(e=>e.code==='ROOM_OUT_OF_BOUNDS').length,0);
  let narrow=S.createDefaultLayout({room:S.createRoomRect({widthMm:1600,depthMm:700}),furniture:[S.createDesk({id:'wide',widthMm:1400,depthMm:400})]},C);
  narrow=G.createGroup(narrow,{id:'g',name:'Wide',memberIds:['wide']},C);
  rejects(()=>G.transformGroup(narrow,'g',{yawDeg:360},C),'ROOM_OUT_OF_BOUNDS');
  const turn=G.resolveGroupRotation(narrow,{id:'g',yawDeg:360},C,{snapDeg:0});assert.ok(turn.boundaryLimited);assert.ok(turn.yawDeg<90);
});
test('group wall contact retains sliding and can reverse back into free space',()=>{
  let s=S.createDefaultLayout({room:S.createRoomRect({widthMm:3000,depthMm:3000}),furniture:[S.createDesk({id:'d',widthMm:1000,depthMm:600})]},C);
  s=G.createGroup(s,{id:'g',name:'Row',memberIds:['d']},C);
  const contact=G.resolveGroupMove(s,{id:'g',x:2000,z:0},C,{snapMm:0});assert.ok(contact.boundaryLimited);
  const slide=G.resolveGroupMove(contact.state,{id:'g',x:2200,z:500},C,{snapMm:0});assert.ok(slide.z>490);
  assert.equal(S.validatePlacement(slide.state,C).length,0);
  const reverse=G.resolveGroupMove(slide.state,{id:'g',x:0,z:0},C,{snapMm:0});assert.ok(reverse);assert.equal(reverse.x,0);assert.equal(reverse.z,0);
});
test('every registered machine can be grouped, copied, rotated and saved on its actual planning footprint',()=>{
  const raw=JSON.parse(fs.readFileSync(path.join(site,'layout/layout-catalog.json'),'utf8'));
  const rows=raw.machines.map(m=>({id:m.id,widthMm:m.dimensionsMm.width,depthMm:m.dimensionsMm.depth,heightMm:m.dimensionsMm.height,
    baseOffsetMm:m.baseOffsetMm??0,...(m.footprintMm?{footprintMm:m.footprintMm}:{})}));
  const actual=S.createCatalog(rows);const coverage=[];
  for(const m of rows){
    const source=S.createDefaultLayout({room:S.createRoomRect({widthMm:20000,depthMm:20000,wallHeightMm:20000}),
      furniture:[S.createDesk({id:'d',widthMm:Math.max(1200,m.widthMm+200),depthMm:Math.max(900,m.depthMm+200),pose:pose(-4000,0)})],
      printers:[{...printer('p','d'),machineId:m.id}]},actual);
    const g=G.createGroup(source,{id:'g',name:m.id,memberIds:['d']},actual);
    const template=G.captureGroupTemplate(g,'g',actual);
    const placed=G.proposeGroupPlacement(g,{id:'repeat',template,xMm:4000,zMm:0,yawDeg:37,snapMm:0},actual);
    assert.equal(placed.valid,true,`${m.id}: ${JSON.stringify(placed.issues)}`);
    const moved=G.transformGroup(placed.state,'repeat',{zMm:2000,yawDeg:127},actual);
    assert.equal(S.validatePlacement(moved,actual).length,0,m.id);
    assert.deepEqual(S.parseLayout(S.serializeLayout(moved,actual),actual),moved);
    coverage.push({machineId:m.id,status:'PASS',scope:'catalog footprint / parent-local group placement and saved state only; full CAD unchanged'});
  }
  assert.equal(coverage.length,raw.machines.length);
  console.log(JSON.stringify({scope:'registered planner machines',coverage}));
});
test('64-printer farm translation remains bounded and preserves all32 support parents',()=>{
  const desks=Array.from({length:32},(_,i)=>S.createDesk({id:`d${i}`,widthMm:900,depthMm:700,pose:pose((i%8-3.5)*1200,(Math.floor(i/8)-1.5)*1000)}));
  const printers=desks.flatMap(d=>[printer(`${d.id}-a`,d.id,-230),printer(`${d.id}-b`,d.id,230)]);
  let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:30000,depthMm:20000}),furniture:desks,printers},C);
  state=G.createGroup(state,{id:'farm',name:'Production farm',memberIds:desks.map(d=>d.id)},C);
  const original=state,start=performance.now();
  for(let i=1;i<=20;i++)state=G.resolveGroupMove(state,{id:'farm',x:i*10,z:i*10},C,{snapMm:0}).state;
  const elapsed=performance.now()-start;
  assert.deepEqual(state.printers,original.printers);
  assert.deepEqual(G.transformGroup(state,'farm',original.groups[0].pose,C),original);
  assert.equal(state.printers.length,64);
  console.log(JSON.stringify({scope:'64-printer static farm',translationCount:20,elapsedMs:elapsed,averageMs:elapsed/20}));
});
console.log(JSON.stringify({status:'PASS',scope:'farm group state, parent-local stamping and complete static room-path constraints',cases}));
