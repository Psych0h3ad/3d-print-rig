import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {pickPlanOpening} from '../site/layout/layout-opening-picking.mjs';
import {openingPlanPrimitives} from '../site/layout/layout-opening-renderer.mjs';
import {openingFrame,openingProblems,newRoomOpening} from '../site/layout/layout-openings.mjs';
import {createRoomRect,createDefaultLayout,applyAction} from '../site/layout/layout-state.mjs';

const win={id:'window',type:'window',wallIndex:0,offsetMm:400,widthMm:1200,heightMm:800,sillMm:800};
const fan={id:'fan',type:'vent',wallIndex:0,offsetMm:500,widthMm:300,heightMm:300,sillMm:1800};
const base=createRoomRect();let cases=0;
const renderer=fs.readFileSync(new URL('../site/layout/layout-renderer.mjs',import.meta.url),'utf8');
const start=renderer.indexOf('  function pickOpening(event){'),end=renderer.indexOf('\n  openingInteraction=',start);
assert(start>=0&&end>start);
const handler=new Function('isPlan','camera','current','screenPoint','THREE','MM','pickPlanOpening','openingPlanPrimitives',`return (${renderer.slice(start,end)});`);
for(const polygonMm of [base.polygonMm,[...base.polygonMm].reverse()])for(let wallIndex=0;wallIndex<4;wallIndex++)for(const zoom of [.2,1,4])for(const reversed of [false,true]){
  const openings=[{...win,wallIndex},{...fan,wallIndex}];if(reversed)openings.reverse();
  const room={...base,polygonMm,openings},paths=openingPlanPrimitives(room);assert.deepEqual(openingProblems(room),[]);
  const project=([x,z])=>[x*zoom+1000,z*zoom+1000],f=openingFrame(room,{...fan,wallIndex});
  const center=f.centerMm.map((v,i)=>v-f.inward[i]*25),badge=project(center);
  assert.equal(pickPlanOpening(room,badge,project,paths),fan.id,'Visible hub wins over the earlier wider window at every tested zoom/order');
  const blade=paths.find(p=>p.role==='vent-blade'),bladePoint=project(blade.pointsMm[2]);
  assert.equal(pickPlanOpening(room,bladePoint,project,paths),fan.id);
  const windowPoint=project(f.startMm.map((v,i)=>v+f.along[i]*900));
  assert.equal(pickPlanOpening(room,windowPoint,project,paths),win.id,'Window remains reachable outside the fan badge');
  let calls=0;
  const pick=handler(()=>true,{updateMatrixWorld(){}},{room},p=>project([p.x*1000,p.z*1000]),THREE,.001,(...args)=>{calls++;return pickPlanOpening(...args);},openingPlanPrimitives);
  assert.equal(pick({clientX:badge[0],clientY:badge[1]}),fan.id);assert.equal(calls,1,'Actual renderer pointer handler uses the tested picker');
  cases++;
}
assert.equal(pickPlanOpening(base,[0,0],p=>p,[]),null);

// Exercise the production manual-add case and shared selection callback.
const app=fs.readFileSync(new URL('../site/layout/layout-app.mjs',import.meta.url),'utf8');
const a=app.indexOf("      case 'room-opening-add':"),b=app.indexOf('\n      case ',a+1);
const s=app.indexOf('function selectOpening(openingId){'),e=app.indexOf('\nfunction changeOpening(',s);
assert(a>=0&&b>a&&s>=0&&e>s);
const manual=new Function('deps',`
 let state=deps.initial,busy=false,roomEditing=false;const catalog=[],selected=[];
 const view={cancelOpening(){},setOpeningSelection:id=>selected.push(['view',id])},ui={setOpeningSelection:id=>selected.push(['ui',id])};
 const select=id=>selected.push(['object',id]),id=kind=>kind+'-manual',newRoomOpening=deps.newRoomOpening,applyAction=deps.applyAction;
 const commit=(next,options)=>{state=next;selected.push(['commit',options.selection]);};
 ${app.slice(s,e)}
 return {run(action){switch(action.type){${app.slice(a,b)}}},get:()=>state,selected};
`);
const fixture=manual({initial:createDefaultLayout(),newRoomOpening,applyAction});
fixture.run({type:'room-opening-add',kind:'vent',wallIndex:0});
assert.equal(fixture.get().room.openings[0].id,'vent-manual');
assert.deepEqual(fixture.selected,[['commit',null],['object',null],['ui','vent-manual'],['view','vent-manual']]);
const saved=fixture.get();fixture.selected.length=0;
assert.throws(()=>fixture.run({type:'room-opening-add',kind:'vent',wallIndex:-1}));
assert.equal(fixture.get(),saved);assert.deepEqual(fixture.selected,[]);
console.log(JSON.stringify({ok:true,cases:cases+3,scope:'Actual plan pointer/manual-add consumers, both wall windings,4walls,3zooms,stacked window/vent order; no native machine or airflow qualification.'}));
