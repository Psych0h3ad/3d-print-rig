// Architectural placement transactions; no airflow or machine-fit claims.
import assert from 'node:assert/strict';
import {createDefaultLayout,createRoomRect,applyAction,parseLayout,serializeLayout,validateState} from '../site/layout/layout-state.mjs';
import {newRoomOpening,openingProblems,wallPanels,wallFrame} from '../site/layout/layout-openings.mjs';
import {createOpeningInteraction,openingAt} from '../site/layout/layout-opening-interaction.mjs';

let checks=0;
const test=(name,run)=>{try{run();checks++;}catch(error){throw new Error(name,{cause:error});}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const room=createRoomRect(),catalog=[];
const vent={id:'vent-1',type:'vent',wallIndex:0,offsetMm:500,widthMm:300,heightMm:300,sillMm:1800};
const window={id:'window-1',type:'window',wallIndex:0,offsetMm:400,widthMm:1200,heightMm:800,sillMm:800};

test('vent dimensions persist independently of existing windows and doors',()=>{
  const base=createDefaultLayout({room:{...room,openings:[window]}}),saved=serializeLayout(base,catalog);
  const placed=applyAction(base,{type:'ADD_ROOM_OPENING',opening:vent},catalog);
  const resized=applyAction(placed,{type:'UPDATE_ROOM_OPENING',id:vent.id,patch:{widthMm:450,heightMm:250,sillMm:1900,offsetMm:850}},catalog);
  assert.deepEqual(resized.room.openings[1],{...vent,widthMm:450,heightMm:250,sillMm:1900,offsetMm:850});
  assert.deepEqual(resized.room.openings[0],window);
  assert.deepEqual(parseLayout(serializeLayout(resized,catalog),catalog),resized);
  assert.equal(serializeLayout(base,catalog),saved);
  assert.deepEqual(applyAction(resized,{type:'REMOVE_ROOM_OPENING',id:vent.id},catalog),base);
});

test('vent bounds, overlapping openings and foreign motion fields are rejected',()=>{
  const state=createDefaultLayout({room:{...room,openings:[window,vent]}});
  for(const patch of [{heightMm:601},{offsetMm:3900},{sillMm:-1},{widthMm:NaN},{heightMm:Infinity},{hinge:'left'},{motion:'sliding'},{openPercent:10}]){
    assert.throws(()=>applyAction(state,{type:'UPDATE_ROOM_OPENING',id:vent.id,patch},catalog));
  }
  const overlap={...vent,sillMm:1000};
  assert.ok(openingProblems({...room,openings:[window,overlap]}).some(e=>e.code==='OPENING_OVERLAP'));
  assert.equal(validateState(state,catalog).ok,true);
  for(const patch of [{type:'fan-model'},{openAngleDeg:0},{motion:'hinged'}])assert.equal(validateState({...state,room:{...room,openings:[{...vent,...patch}]}},catalog).ok,false);
});

test('wall cuts retain independent area for all wall directions and stacked openings',()=>{
  for(const polygonMm of [room.polygonMm,[...room.polygonMm].reverse(),[[0,0],[4000,0],[4000,2000],[2000,2000],[2000,4000],[0,4000]]]){
    for(let wallIndex=0;wallIndex<polygonMm.length;wallIndex++){
      const r={...room,polygonMm,openings:[{...vent,wallIndex},{...window,wallIndex}]};
      assert.deepEqual(openingProblems(r),[]);
      const frame=wallFrame(r,wallIndex),area=wallPanels(r,wallIndex).reduce((s,p)=>s+p.widthMm*p.heightMm,0);
      near(area,frame.lengthMm*r.wallHeightMm-300*300-1200*800);
    }
  }
});

test('creator places high on each wall, short rooms stay finite and neighbouring vents clamp drags',()=>{
  for(let wallIndex=0;wallIndex<4;wallIndex++){
    const o=newRoomOpening(room,{id:`fan-${wallIndex}`,type:'vent',wallIndex});
    assert.equal(o.widthMm,300);assert.equal(o.heightMm,300);assert.equal(o.sillMm,1800);
    assert.deepEqual(openingProblems({...room,openings:[o]}),[]);assert.equal(Object.hasOwn(o,'hinge'),false);
  }
  const short=createRoomRect({widthMm:200,depthMm:200,wallHeightMm:100});
  const tiny=newRoomOpening(short,{id:'small',type:'vent',wallIndex:0});
  assert.deepEqual(openingProblems({...short,openings:[tiny]}),[]);assert.equal(tiny.sillMm,0);
  const other={...vent,id:'neighbour',offsetMm:1000};
  const r={...room,openings:[vent,other,window]};
  assert.equal(openingAt(r,vent,3000,{drag:true}).offsetMm,700);
  assert.equal(openingAt(r,vent,-200,{drag:true}).offsetMm,0);
  assert.equal(openingAt(r,vent,600,{drag:true}).offsetMm,600);
});

test('room reversal keeps vent on its original physical wall without door fields',()=>{
  const base=createDefaultLayout({room:{...room,openings:[vent]}});
  const reversed=applyAction(base,{type:'SET_ROOM',room:{polygonMm:[...room.polygonMm].reverse(),wallHeightMm:room.wallHeightMm}},catalog);
  const o=reversed.room.openings[0],old=wallFrame(room,vent.wallIndex),next=wallFrame(reversed.room,o.wallIndex);
  const oldCenter=old.startMm.map((v,i)=>v+old.along[i]*(vent.offsetMm+vent.widthMm/2));
  const newCenter=next.startMm.map((v,i)=>v+next.along[i]*(o.offsetMm+o.widthMm/2));
  oldCenter.forEach((v,i)=>near(v,newCenter[i]));assert.equal(o.type,'vent');assert.equal(Object.hasOwn(o,'hinge'),false);
});

test('wall-click placement, reverse drag and cancellation commit once and roundtrip',()=>{
  let state=createDefaultLayout(),shown=null,picked=null,selection=null;const past=[],future=[];
  const c=createOpeningInteraction({room:()=>state.room,locate:e=>e.off?null:{wallIndex:0,alongMm:e.at},pick:()=>picked,
    preview:value=>shown=value,select:id=>selection=id,commit:({type,opening})=>{
      past.push(state);future.length=0;state=applyAction(state,type==='add'?{type:'ADD_ROOM_OPENING',opening:{...opening,id:'placed-vent'}}:{type:'UPDATE_ROOM_OPENING',id:opening.id,patch:{offsetMm:opening.offsetMm}},catalog);
    }});
  const e=at=>({button:0,isPrimary:true,pointerId:1,clientX:at,clientY:0,at});
  c.begin('vent');assert.deepEqual(c.tool,{kind:'vent'});c.move(e(1200));assert.equal(shown.opening.type,'vent');assert.equal(past.length,0);
  c.down(e(1200));c.up(e(1200));assert.equal(past.length,1);assert.equal(c.tool,null);assert.equal(state.room.openings[0].offsetMm,1050);
  picked='placed-vent';c.down(e(1100));assert.equal(selection,picked);c.move(e(1600));c.move(e(800));c.up(e(800));
  assert.equal(state.room.openings[0].offsetMm,750);assert.equal(past.length,2);
  const saved=serializeLayout(state,catalog);assert.equal(serializeLayout(parseLayout(saved,catalog),catalog),saved);
  future.push(state);state=past.pop();assert.equal(state.room.openings[0].offsetMm,1050);state=future.pop();assert.equal(serializeLayout(state,catalog),saved);
  c.begin('vent');c.down(e(2600));c.cancel();assert.equal(c.up(e(2600)),false);assert.equal(serializeLayout(state,catalog),saved);
});

console.log(JSON.stringify({ok:true,checks,scope:'Vent room schema, wall partitions, saved state and actual opening interaction transactions; no airflow or native machine fit.'}));
