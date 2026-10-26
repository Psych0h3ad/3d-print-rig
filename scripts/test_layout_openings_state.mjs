// Independent room-opening schema, partition and state-transaction oracles.
// No printer model, architectural construction or native-solid fit claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as S from '../site/layout/layout-state.mjs';
import * as O from '../site/layout/layout-openings.mjs';
import {proposePlacement} from '../site/layout/layout-placement.mjs';
import {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard} from '../site/layout/layout-clipboard.mjs';
import {createGroup,captureGroupTemplate,proposeGroupPlacement} from '../site/layout/layout-groups.mjs';
import {pointInPolygon} from '../site/layout/layout-geometry.mjs';
const files=['layout-openings.mjs','layout-state.mjs','layout-app.mjs','layout-placement.mjs','layout-clipboard.mjs','layout-groups.mjs'].map(n=>new URL('../site/layout/'+n,import.meta.url));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),before=files.map(hash);
let checks=0;
const test=(name,run)=>{try{run();checks++;}catch(e){throw new Error(name,{cause:e});}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const error=(fn,code)=>assert.throws(fn,e=>e.code===code||e.errors?.some(v=>v.code===code));
const room=S.createRoomRect(),base=S.createDefaultLayout(),window={id:'window-1',type:'window',wallIndex:0,offsetMm:500,widthMm:1200,heightMm:1000,sillMm:900};
const door={id:'door-1',type:'door',wallIndex:1,offsetMm:600,widthMm:900,heightMm:2100,sillMm:0,hinge:'left',openAngleDeg:90};
const valid=openings=>S.createDefaultLayout({room:{...room,openings}});
test('legacy absent property stays absent and version1 roundtrip',()=>{
  assert.equal(Object.hasOwn(base.room,'openings'),false);
  assert.equal(Object.hasOwn(S.parseLayout(S.serializeLayout(base)).room,'openings'),false);
  assert.deepEqual(S.parseLayout(S.serializeLayout(valid([window,door]))),valid([window,door]));
});
test('strict schema rejects invalid entries, foreign keys and nonfinite values',()=>{
  for(const patch of [{type:'vent'},{id:'__proto__'},{widthMm:0},{widthMm:-1},{offsetMm:-1},{sillMm:-1},
    {wallIndex:.5},{wallIndex:4},{wallIndex:-1},{heightMm:3000},{offsetMm:3500},{widthMm:Infinity},{heightMm:NaN},{extra:true},
    {hinge:'left'},{openAngleDeg:90},{id:'bad id'},{widthMm:'100'},{widthMm:Number.MIN_VALUE},{heightMm:.1}])assert.equal(S.validateState({...base,room:{...room,openings:[{...window,...patch}]}}).ok,false);
  for(const patch of [{sillMm:1},{hinge:'both'},{openAngleDeg:-1},{openAngleDeg:121},{openAngleDeg:NaN}])assert.equal(S.validateState({...base,room:{...room,openings:[{...door,...patch}]}}).ok,false);
  for(const openings of [null,{},[null],Array(65).fill(window)])assert.equal(S.validateState({...base,room:{...room,openings}}).ok,false);
  error(()=>valid([window,{...window}]),'DUPLICATE_ENTITY_ID');
  error(()=>S.createDefaultLayout({room:{...room,openings:[window]},furniture:[S.createDesk({id:window.id})]}),'DUPLICATE_ENTITY_ID');
  error(()=>valid([window,{...window,id:'overlap',offsetMm:600}]),'OPENING_OVERLAP');
  assert.equal(S.validateState(valid([window,{...window,id:'touch',offsetMm:1700}])).ok,true);
  assert.equal(S.validateState(valid([{...window,sillMm:0,heightMm:900},{...window,id:'transom',sillMm:900}])).ok,true);
});
test('all wall partitions match independent area and occupancy oracles',()=>{
  for(const polygonMm of [room.polygonMm,[...room.polygonMm].reverse(),[[0,0],[4000,0],[4000,2000],[2000,2000],[2000,4000],[0,4000]]]){
    const r={polygonMm,wallHeightMm:2400};r.openings=polygonMm.map((_,wallIndex)=>({id:`w-${wallIndex}`,type:'window',wallIndex,offsetMm:200,widthMm:500,heightMm:800,sillMm:700}));
    assert.deepEqual(O.openingProblems(r),[]);
    polygonMm.forEach((a,index)=>{
      const b=polygonMm[(index+1)%polygonMm.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),panels=O.wallPanels(r,index);
      near(panels.reduce((n,p)=>n+p.widthMm*p.heightMm,0),length*2400-500*800);
      for(let x=37;x<length;x+=131)for(let y=31;y<2400;y+=137){
        const occupied=panels.filter(p=>x>p.offsetMm&&x<p.offsetMm+p.widthMm&&y>p.bottomMm&&y<p.bottomMm+p.heightMm).length;
        assert.equal(occupied,!(x>200&&x<700&&y>700&&y<1500)?1:0);
      }
      const f=O.wallFrame(r,index);near(f.lengthMm,length);near(Math.hypot(...f.inward),1);
      const mid=[(a[0]+b[0])/2+f.inward[0],(a[1]+b[1])/2+f.inward[1]];assert.equal(pointInPolygon(mid,polygonMm),1);
    });
  }
  const stacked={...room,openings:[{...window,heightMm:500,sillMm:0},{...window,id:'upper',sillMm:1000}]};
  near(O.wallPanels(stacked,0).reduce((n,p)=>n+p.widthMm*p.heightMm,0),4000*2400-1200*1500);
});
test('default creator selects free span, dimensions fit and caps are enforced',()=>{
  let r={...room,openings:[]};
  for(let i=0;i<3;i++){const o=O.newRoomOpening(r,{id:`new-${i}`,type:'window',wallIndex:0});r={...r,openings:[...r.openings,o]};assert.deepEqual(O.openingProblems(r),[]);}
  const full={...room,openings:[{...window,offsetMm:0,widthMm:4000}]};error(()=>O.newRoomOpening(full,{id:'blocked',type:'window',wallIndex:0}),'OPENING_NO_SPACE');
  const small=S.createRoomRect({widthMm:200,depthMm:200,wallHeightMm:100});assert.deepEqual(O.openingProblems({...small,openings:[O.newRoomOpening(small,{id:'small',type:'door',wallIndex:0})]}),[]);
  error(()=>O.newRoomOpening(room,{id:'bad',type:'door',wallIndex:-1}),'OPENING_WALL');
  const many=Array.from({length:64},(_,i)=>({...window,id:`many-${i}`,offsetMm:i*50,widthMm:40}));assert.deepEqual(O.openingProblems({...room,openings:many}),[]);
});
test('door hinges, inward swing, finite leaf and conservative sweep for all walls',()=>{
  for(const polygonMm of [room.polygonMm,[...room.polygonMm].reverse()])for(let wallIndex=0;wallIndex<4;wallIndex++)for(const hinge of ['left','right'])for(const openAngleDeg of [0,1,30,90,120]){
    const r={...room,polygonMm},o={...door,wallIndex,hinge,openAngleDeg},p=O.doorPlan(r,o),f=O.openingFrame(r,o);
    near(Math.hypot(p.tipMm[0]-p.hingeMm[0],p.tipMm[1]-p.hingeMm[1]),830);
    near((p.tipMm[0]-p.hingeMm[0])*f.inward[0]+(p.tipMm[1]-p.hingeMm[1])*f.inward[1],830*Math.sin(openAngleDeg*Math.PI/180));
    for(let a=0;a<=openAngleDeg;a+=.5){const angle=a*Math.PI/180,sign=hinge==='left'?1:-1;
      const axis=[f.along[0]*sign*Math.cos(angle)+f.inward[0]*Math.sin(angle),f.along[1]*sign*Math.cos(angle)+f.inward[1]*Math.sin(angle)];
      for(const distance of [0,415,830])for(const side of [-17.5,17.5])assert.ok(pointInPolygon([p.hingeMm[0]+axis[0]*distance-axis[1]*side,p.hingeMm[1]+axis[1]*distance+axis[0]*side],p.sweepPolygonMm)>=0);
    }
    assert.ok(p.leafPolygonMm.flat().every(Number.isFinite));
  }
});
test('state add edit remove reset and immutable undo redo snapshots',()=>{
  const snapshots=[base],step=a=>snapshots.push(S.applyAction(snapshots.at(-1),a));
  step({type:'ADD_ROOM_OPENING',opening:window});step({type:'ADD_ROOM_OPENING',opening:door});
  step({type:'UPDATE_ROOM_OPENING',id:window.id,patch:{widthMm:1000,sillMm:800}});
  step({type:'UPDATE_ROOM_OPENING',id:door.id,patch:{hinge:'right',openAngleDeg:45}});
  step({type:'REMOVE_ROOM_OPENING',id:window.id});
  for(const s of [...snapshots,...snapshots.toReversed()])assert.deepEqual(S.parseLayout(S.serializeLayout(s)),s);
  assert.equal(snapshots[2].room.openings[0].widthMm,1200);assert.equal(snapshots.at(-1).room.openings.length,1);
  const source=S.serializeLayout(snapshots[2]);
  error(()=>S.applyAction(snapshots[2],{type:'UPDATE_ROOM_OPENING',id:door.id,patch:{openAngleDeg:121}}),'OPENING_INVALID');
  error(()=>S.applyAction(snapshots[2],{type:'UPDATE_ROOM_OPENING',id:window.id,patch:{hinge:'left'}}),'UNKNOWN_FIELD');
  error(()=>S.applyAction(base,{type:'REMOVE_ROOM_OPENING',id:'missing'}),'OPENING_NOT_FOUND');
  assert.equal(S.serializeLayout(snapshots[2]),source);
});
test('room edits retain attachment and reject disappearing or too small walls',()=>{
  const s=valid([window,door]),rev={...room,polygonMm:[...room.polygonMm].reverse()},a=S.applyAction(s,{type:'SET_ROOM',room:rev});
  for(const o of s.room.openings){const n=a.room.openings.find(v=>v.id===o.id),old=O.openingFrame(s.room,o),next=O.openingFrame(a.room,n);assert.deepEqual(next.startMm,old.endMm);assert.deepEqual(next.endMm,old.startMm);
    if(o.type==='door'){assert.equal(n.hinge,'right');assert.deepEqual(O.doorPlan(s.room,o).hingeMm,O.doorPlan(a.room,n).hingeMm);}}
  assert.deepEqual(S.applyAction(a,{type:'SET_ROOM',room}).room.openings,s.room.openings);
  const cyclic={...room,polygonMm:[...room.polygonMm.slice(2),...room.polygonMm.slice(0,2)]};assert.equal(S.applyAction(s,{type:'SET_ROOM',room:cyclic}).room.openings[0].wallIndex,2);
  assert.equal(S.applyAction(s,{type:'SET_ROOM',room:S.createRoomRect({widthMm:5000})}).room.openings[0].offsetMm,500);
  error(()=>S.applyAction(s,{type:'SET_ROOM',room:S.createRoomRect({widthMm:1000})}),'OPENING_OUT_OF_BOUNDS');
  error(()=>S.applyAction(s,{type:'SET_ROOM',room:S.createRoomL()}),'OPENING_WALL_CHANGED');
});
test('door occupied swing warns with furniture IDs, independent of placement blockers',()=>{
  const d={...door,wallIndex:0,offsetMm:1500},f=S.createDesk({id:'blocking-desk',widthMm:400,depthMm:400,pose:{xMm:-200,zMm:-1200,yawDeg:0}});
  const state=S.createDefaultLayout({room:{...room,openings:[d]},furniture:[f]}),warnings=S.validatePlacement(state);
  const warning=warnings.find(w=>w.code==='DOOR_SWING_OBSTRUCTED');assert.ok(warning);assert.deepEqual(warning.entityIds,['blocking-desk']);assert.equal(warning.params.openingId,d.id);
  const clear=S.applyAction(state,{type:'UPDATE_FURNITURE',id:f.id,patch:{pose:{xMm:1000,zMm:1000,yawDeg:0}}});assert.equal(S.validatePlacement(clear).some(w=>w.code==='DOOR_SWING_OBSTRUCTED'),false);
  const empty=S.createDefaultLayout({room:state.room});
  assert.equal(proposePlacement(empty,{id:'new-desk',kind:'desk',copy:f,xMm:-200,zMm:-1200,yawDeg:0,snapMm:0}).valid,true);
  const copied=captureLayoutClipboard(state,[f.id]);assert.deepEqual(decodeLayoutClipboard(encodeLayoutClipboard(copied)),copied);
  const group=createGroup(state,{id:'unit',name:'Test',memberIds:[f.id]}),template=captureGroupTemplate(group,'unit');
  assert.equal(proposeGroupPlacement(empty,{id:'placed-unit',template,xMm:-200,zMm:-1200,yawDeg:0,snapMm:0}).valid,true);
});
test('cyclic reorder plus endpoint edits uses one consistent wall correspondence',()=>{
  const state=valid([window,door]),old=room.polygonMm,polygonMm=[old[2],old[3],[old[0][0]-100,old[0][1]],old[1]];
  const next=S.applyAction(state,{type:'SET_ROOM',room:{...room,polygonMm}});assert.equal(next.room.openings[0].wallIndex,2);assert.equal(next.room.openings[1].wallIndex,3);
  assert.deepEqual(O.openingFrame(next.room,next.room.openings[0]).startMm,[-1600,-1500]);
});
test('flush decimal openings reverse without negative rounding offsets',()=>{
  for(const widthMm of [900.1,900.2,1200.1]){
    const w={...window,offsetMm:4000-widthMm,widthMm},s=valid([w]);
    const next=S.applyAction(s,{type:'SET_ROOM',room:{...room,polygonMm:[...room.polygonMm].reverse()}});
    assert.equal(next.room.openings[0].offsetMm,0);
    near(S.applyAction(next,{type:'SET_ROOM',room}).room.openings[0].offsetMm,w.offsetMm);
  }
  const state=S.createDefaultLayout({room:{...room,openings:[{...window,id:'clipboard-set'}]},furniture:[S.createDesk({id:'desk',widthMm:400,depthMm:400})]});
  const copied=captureLayoutClipboard(state,['desk']);assert.deepEqual(decodeLayoutClipboard(encodeLayoutClipboard(copied)),copied);
});
test('door corner wall conflict is a visible advisory, with winding and hinge parity',()=>{
  const r={polygonMm:[[0,0],[4000,0],[4000,3000],[0,3000]],wallHeightMm:2400};
  const d={...door,wallIndex:0,offsetMm:0,openAngleDeg:120};
  assert.deepEqual(O.doorWallConflicts(r,d),[3]);
  const s=S.createDefaultLayout({room:{...r,openings:[d]}});assert.ok(S.validatePlacement(s).some(w=>w.code==='DOOR_SWING_WALL'&&w.params.walls==='4'));
  assert.deepEqual(O.doorWallConflicts(r,{...d,openAngleDeg:60}),[]);
  const reverse=S.applyAction(s,{type:'SET_ROOM',room:{...r,polygonMm:[...r.polygonMm].reverse()}});
  assert.equal(O.doorWallConflicts(reverse.room,reverse.room.openings[0]).length,1);
});
assert.deepEqual(files.map(hash),before,'Tests must not mutate source');
console.log(JSON.stringify({status:'PASS',cases:checks,scope:'Room planning schema, geometry and immutable state only; no printer/native-solid qualification.',sourceSHA256:Object.fromEntries(files.map((f,i)=>[f.pathname.split('/').at(-1),before[i]]))}));
