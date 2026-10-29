import assert from 'node:assert/strict';
import {resizeOpeningAt,createOpeningInteraction} from '../site/layout/layout-opening-interaction.mjs';
import {createOpeningHandles} from '../site/layout/layout-opening-handles.mjs';
import {createLayoutUI} from '../site/layout/layout-ui.mjs';
import {createDefaultLayout,applyAction,serializeLayout,parseLayout} from '../site/layout/layout-state.mjs';
import {openingProblems,withDoorMotion} from '../site/layout/layout-openings.mjs';
import {createLayoutTranslator,supportedLanguages} from '../site/layout/layout-i18n.mjs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const catalog=[],cases=[];
const run=(name,fn)=>{fn();cases.push(name);};
const room={polygonMm:[[0,0],[4000,0],[4000,3000],[2000,3000],[2000,2000],[0,2000]],wallHeightMm:3000,openings:[]};
const window={id:'w',type:'window',wallIndex:0,offsetMm:200,widthMm:1000,heightMm:1000,sillMm:900};
const before={...window,id:'before',offsetMm:0,widthMm:100},after={...window,id:'after',offsetMm:1800,widthMm:500};
for(const type of ['window','hinged','sliding','vent'])run(type+': both ends, corners, neighbour contacts and unchanged opposite jamb',()=>{
 let opening=type==='window'?window:type==='vent'?{...window,type:'vent'}:{...window,type:'door',heightMm:2100,sillMm:0,hinge:'left',openAngleDeg:45};if(type==='sliding')opening=withDoorMotion(opening,'sliding');
 const r={...room,openings:[before,opening,after]},frozen=JSON.stringify(r);
 for(const target of [-1e6,50,200,700,1199,4000,1e6]){
  const start=resizeOpeningAt(r,opening,'start',target),end=resizeOpeningAt(r,opening,'end',target);
  assert.equal(start.offsetMm+start.widthMm,1200);assert(start.offsetMm>=100&&start.widthMm>=1);
  assert.equal(end.offsetMm,200);assert(end.offsetMm+end.widthMm<=1800&&end.widthMm>=1);
  for(const next of [start,end])assert.deepEqual(openingProblems({...r,openings:r.openings.map(o=>o.id===opening.id?next:o)}),[]);
 }
 assert.equal(JSON.stringify(r),frozen);
});
run('stacked openings, different walls, fractional contacts and invalid coordinates',()=>{
 const r={...room,openings:[window,{...after,sillMm:2100,heightMm:500},{...before,wallIndex:1}]};
 assert.equal(resizeOpeningAt(r,window,'end',5000).widthMm,3800);
 const a={...after,offsetMm:1800.5};assert.equal(resizeOpeningAt({...room,openings:[window,a]},window,'end',5000).widthMm,1600.5);
 assert.equal(resizeOpeningAt(room,window,'end',NaN),null);assert.equal(resizeOpeningAt(room,window,'start',Infinity),null);assert.equal(resizeOpeningAt(room,window,'other',10),null);
 assert.equal(resizeOpeningAt({...room,openings:[window,{...after,offsetMm:500}]},window,'end',1500),null);
});
function fixture(patch={}){
 let state={...createDefaultLayout(),room:structuredClone({...room,openings:[{...window,...patch},before,after]})},shown,picked=window.id;
 const past=[],future=[],writes=[];
 const controller=createOpeningInteraction({room:()=>state.room,locate:e=>e.off?null:{wallIndex:0,alongMm:e.at},pick:()=>picked,pickResize:e=>e.edge??null,preview:v=>shown=v,select:()=>{},commit:({type,opening})=>{
  assert.equal(type,'resize');past.push(state);state=applyAction(state,{type:'UPDATE_ROOM_OPENING',id:opening.id,patch:{offsetMm:opening.offsetMm,widthMm:opening.widthMm}},catalog);future.length=0;writes.push(serializeLayout(state,catalog));
 }});controller.selection(window.id);
 const event=(at,extra={})=>({at,clientX:at/10,clientY:0,button:0,pointerId:1,...extra});
 return {controller,event,past,writes,get state(){return state;},get shown(){return shown;},replace(){state=structuredClone(state);controller.refresh();},undo(){future.push(state);state=past.pop();controller.refresh();},redo(){past.push(state);state=future.pop();controller.refresh();}};
}
for(const edge of ['start','end'])run(edge+': rapid/reversed drag, one undo transaction and JSON roundtrip',()=>{
 const f=fixture(),initial=serializeLayout(f.state,catalog);assert(f.controller.down(f.event(edge==='start'?200:1200,{edge})));
 for(const target of [-500,5000,400,1750,800]){assert(f.controller.move(f.event(target)));assert.equal(f.writes.length,0);assert(f.shown.valid);}
 f.controller.up(f.event(800));assert.equal(f.writes.length,1);assert.equal(f.past.length,1);assert.equal(f.shown,null);
 const saved=serializeLayout(f.state,catalog);assert.equal(serializeLayout(parseLayout(saved,catalog),catalog),saved);
 assert.equal(f.state.room.openings[0].widthMm,edge==='start'?400:600);f.undo();assert.equal(serializeLayout(f.state,catalog),initial);f.redo();assert.equal(serializeLayout(f.state,catalog),saved);
});
run('cancellation, wrong pointer, state replacement and keyboard transactions',()=>{
 const f=fixture(),initial=serializeLayout(f.state,catalog);f.controller.down(f.event(1200,{edge:'end'}));f.controller.move(f.event(1600));assert.equal(f.controller.up(f.event(1600,{pointerId:2})),false);f.controller.cancel();assert.equal(f.controller.up(f.event(1600)),false);assert.equal(serializeLayout(f.state,catalog),initial);assert.equal(f.writes.length,0);
 f.controller.down(f.event(1200,{edge:'end'}));f.controller.move(f.event(1600));f.replace();assert.equal(f.controller.dragging,false);assert.equal(f.controller.up(f.event(1600)),false);assert.equal(f.writes.length,0);
 assert(f.controller.resizeBy('end',100));assert.equal(f.state.room.openings[0].widthMm,1100);assert(f.controller.resizeBy('end',-100));assert.equal(serializeLayout(f.state,catalog),initial);assert.equal(f.writes.length,2);
 assert.equal(f.controller.resizeBy('other',10),false);f.controller.begin('window');assert.equal(f.controller.resizeBy('end',10),false);f.controller.cancel();
});
run('resize grab offset prevents jumps on click and tracks the jamb after an off-centre grab',()=>{
 const f=fixture(),initial=serializeLayout(f.state,catalog);f.controller.down(f.event(1250,{edge:'end'}));f.controller.up(f.event(1250));assert.equal(f.writes.length,0);assert.equal(serializeLayout(f.state,catalog),initial);
 f.controller.down(f.event(1250,{edge:'end'}));f.controller.move(f.event(1650));assert.equal(f.shown.opening.widthMm,1400);f.controller.up(f.event(1650));assert.equal(f.state.room.openings[0].widthMm,1400);
});
run('fractional authored endpoints survive clicks and exact relative keyboard steps',()=>{
 const f=fixture({offsetMm:200.125,widthMm:1000.25}),end=1200.375;
 f.controller.down(f.event(end+25,{edge:'end'}));f.controller.up(f.event(end+25));assert.equal(f.writes.length,0);
 assert.equal(f.state.room.openings[0].widthMm,1000.25);f.controller.resizeBy('end',100);assert.equal(f.state.room.openings[0].widthMm,1100.25);
 f.controller.resizeBy('start',10);assert.equal(f.state.room.openings[0].offsetMm,210.125);assert.equal(f.state.room.openings[0].widthMm,1090.25);assert.equal(f.state.room.openings[0].offsetMm+f.state.room.openings[0].widthMm,end+100);
});
for(const edge of ['start','end'])run(edge+': decimal no-op preserves exact width and existing redo history',()=>{
 const f=fixture({offsetMm:200.1,widthMm:1000.2}),original=serializeLayout(f.state,catalog),at=edge==='start'?200.1:1200.3;
 f.controller.resizeBy('end',100);f.undo();assert.equal(serializeLayout(f.state,catalog),original);
 const writes=f.writes.length;f.controller.down(f.event(at,{edge}));f.controller.up(f.event(at));assert.equal(f.writes.length,writes);assert.equal(serializeLayout(f.state,catalog),original);
 f.redo();assert.equal(f.state.room.openings[0].widthMm,1100.2);
});
for(const language of supportedLanguages)run(language+': actual handle listeners, hit targets, labels and teardown',()=>{
 const doc=new TestDocument(),make=doc.createElement.bind(doc);doc.createElement=tag=>{const n=make(tag);n.style={};n.getBoundingClientRect=()=>({left:Number.parseFloat(n.style.left)-14,right:Number.parseFloat(n.style.left)+14,top:Number.parseFloat(n.style.top)-14,bottom:Number.parseFloat(n.style.top)+14});return n;};
 const container=doc.createElement('div');doc.body.append(container);const commands=[],downs=[],t=createLayoutTranslator(language),ui=createOpeningHandles({container,t,onDown:e=>downs.push(e),onResizeKey:(edge,delta)=>{commands.push([edge,delta]);return true;}});
 ui.update({visible:true,start:[100,100],end:[240,100],widthMm:1400});const buttons=container.querySelectorAll('button'),root=container.firstChild;assert.equal(root.hidden,false);assert.equal(buttons.length,2);assert.equal(buttons[0].getAttribute('aria-label'),t('layout.openings.resizeStart'));assert.equal(ui.hit({clientX:100,clientY:100}),'start');assert.equal(ui.hit({clientX:240,clientY:100}),'end');assert.equal(ui.hit({clientX:400,clientY:100}),null);
 let stopped=0;for(const fn of buttons[0].listeners.get('keydown'))fn({key:'ArrowRight',shiftKey:true,preventDefault(){stopped++;},stopPropagation(){stopped++;}});assert.deepEqual(commands,[['start',100]]);assert.equal(stopped,2);
 for(const fn of buttons[1].listeners.get('pointerdown'))fn({pointerId:3});assert.equal(downs.length,1);
 ui.hide();assert.equal(ui.hit({clientX:100,clientY:100}),null);ui.update({visible:true,start:[NaN,0],end:[240,100],widthMm:1400});assert(root.hidden);ui.dispose();ui.dispose();assert.equal(container.children.length,0);assert.equal(buttons[0].listeners.get('keydown').size,0);ui.update({visible:true,start:[0,0],end:[100,0],widthMm:1});assert.equal(container.children.length,0);
});
run('explicit search/catalog navigation reveals hidden settings; ordinary scene selection does not',()=>{
 const document=new TestDocument(),container=document.createElement('aside');document.body.append(container);let reveals=0;
 const state={...createDefaultLayout(),room:{...room,openings:[window]}},initial=serializeLayout(state,catalog);
 const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction(){},onReveal(){reveals++;container.hidden=false;}});
 ui.update(state);ui.setOpeningSelection(window.id);assert.equal(reveals,0);
 container.hidden=true;assert(ui.focusObjectSearch());assert.equal(reveals,1);assert.equal(container.hidden,false);assert.equal(document.activeElement.tagName,'INPUT');
 container.hidden=true;assert(ui.openPrinterCatalog());assert.equal(reveals,2);assert.equal(container.hidden,false);assert.equal(document.activeElement.tagName,'INPUT');
 assert.equal(serializeLayout(state,catalog),initial);ui.dispose();
});
console.log(JSON.stringify({passed:true,cases:cases.length,tests:cases,scope:'Production opening resize constraints/controller/DOM with synthetic rooms; outside-dimension planning only, no mechanical or all-browser certificate.'}));
