import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openingAt,createOpeningInteraction} from '../site/layout/layout-opening-interaction.mjs';
import {createDefaultLayout,applyAction,serializeLayout,parseLayout} from '../site/layout/layout-state.mjs';
import {openingProblems,withDoorMotion} from '../site/layout/layout-openings.mjs?v=8fab3154ec519f37f666';
import {createLayoutUI} from '../site/layout/layout-ui.mjs';
import {createLayoutTranslator,supportedLanguages} from '../site/layout/layout-i18n.mjs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const catalog=[],results=[];
function test(name,run){run();results.push(name);}
const room={polygonMm:[[0,0],[4000,0],[4000,3000],[2000,3000],[2000,2000],[0,2000]],wallHeightMm:2500,openings:[]};
const win={id:'window',type:'window',wallIndex:0,offsetMm:100,widthMm:1000,heightMm:1000,sillMm:900};
const obstacle={...win,id:'obstacle',offsetMm:1800,widthMm:900};
test('corners, occupied spans, reverse drag and vertical separation',()=>{
 const r={...room,openings:[win,obstacle]};
 assert.equal(openingAt(r,win,-100,{drag:true}).offsetMm,0);
 assert.equal(openingAt(r,win,3000,{drag:true}).offsetMm,800);
 assert.equal(openingAt(r,win,700,{drag:true}).offsetMm,700);
 assert.equal(openingAt(r,win,3000).offsetMm,3000);
 assert.equal(openingAt({...r,openings:[{...obstacle,sillMm:0,heightMm:500}]},win,2000,{drag:true}).offsetMm,2000);
 assert.equal(openingAt(r,win,NaN),null);
});
function fixture(initial=room){
 let state={...createDefaultLayout(),room:structuredClone(initial)},selected=null,shown=null,picked=null;
 const past=[],future=[],writes=[],toolChanges=[];
 const c=createOpeningInteraction({room:()=>state.room,locate:(e,locked)=>e.off?null:{wallIndex:locked??e.wall??0,alongMm:e.at},pick:()=>picked,
 preview:value=>shown=value,select:id=>selected=id,changed:()=>toolChanges.push(c.tool),commit:({type,opening})=>{
  past.push(state);future.length=0;const o={...opening,id:type==='add'?'added-'+past.length:opening.id};
  state=applyAction(state,type==='add'?{type:'ADD_ROOM_OPENING',opening:o}:{type:'UPDATE_ROOM_OPENING',id:o.id,patch:{offsetMm:o.offsetMm}},catalog);writes.push(serializeLayout(state,catalog));
 }});
 const e=(at,extra={})=>({at,button:0,pointerId:1,clientX:at/10,clientY:0,...extra});
 return {c,e,past,future,writes,toolChanges,get state(){return state;},get shown(){return shown;},get selected(){return selected;},pick:id=>picked=id,
 undo(){future.push(state);state=past.pop();c.refresh();},redo(){past.push(state);state=future.pop();c.refresh();}};
}
for(const kind of ['window','door'])test(kind+': preview/click, nonrectangular wall, undo/redo and roundtrip',()=>{
 const f=fixture(),original=serializeLayout(f.state,catalog);f.c.begin(kind);f.c.move(f.e(600,{wall:4}));assert(f.shown.valid);assert.equal(f.past.length,0);
 f.c.down(f.e(600,{wall:4}));f.c.up(f.e(600,{wall:4}));assert.equal(f.past.length,1);assert.equal(f.writes.length,1);assert.equal(f.state.room.openings[0].wallIndex,4);assert.equal(f.c.active,false);assert.deepEqual(openingProblems(f.state.room),[]);
 const saved=serializeLayout(f.state,catalog);assert.equal(serializeLayout(parseLayout(saved,catalog),catalog),saved);f.undo();assert.equal(serializeLayout(f.state,catalog),original);f.redo();assert.equal(serializeLayout(f.state,catalog),saved);
});
test('Window / Hinged / Sliding tools switch A-B-A without history and clear mode on cancellation or placement',()=>{
 const f=fixture(),original=serializeLayout(f.state,catalog);
 for(const motion of ['hinged','sliding','hinged','sliding']){
  f.c.begin('door',{motion});assert.deepEqual(f.c.tool,{kind:'door',motion});assert.deepEqual(f.toolChanges.at(-1),f.c.tool);
  f.c.move(f.e(1600));assert.equal(f.shown.opening.motion??'hinged',motion);assert.equal(f.past.length,0);
 }
 f.c.cancel();assert.equal(f.c.tool,null);assert.equal(f.toolChanges.at(-1),null);assert.equal(serializeLayout(f.state,catalog),original);
 f.c.begin('window');assert.deepEqual(f.c.tool,{kind:'window'});f.c.cancel();
 f.c.begin('door',{motion:'sliding'});f.c.down(f.e(1600));f.c.up(f.e(1600));
 const o=f.state.room.openings[0];assert.equal(o.motion,'sliding');assert.equal(o.slideDirection,'left');assert.equal(Object.hasOwn(o,'hinge'),false);assert.equal(Object.hasOwn(o,'openAngleDeg'),false);assert.equal(f.past.length,1);assert.equal(f.c.tool,null);assert.equal(f.toolChanges.at(-1),null);
 const saved=serializeLayout(f.state,catalog);assert.equal(serializeLayout(parseLayout(saved,catalog),catalog),saved);f.undo();assert.equal(serializeLayout(f.state,catalog),original);f.redo();assert.equal(serializeLayout(f.state,catalog),saved);
});
for(const motion of ['window','hinged','sliding'])test(motion+': select/drag, neighbour clamps, one transaction, grab anchor preserved',()=>{
 let o=motion==='window'?win:{id:'door',type:'door',wallIndex:0,offsetMm:100,widthMm:1000,heightMm:2100,sillMm:0,hinge:'right',openAngleDeg:45};if(motion==='sliding')o=withDoorMotion(o,'sliding');
 const f=fixture({...room,openings:[o,obstacle]});f.pick(o.id);f.c.down(f.e(200));assert.equal(f.selected,o.id);f.c.move(f.e(3500));assert.equal(f.shown.opening.offsetMm,800);assert.equal(f.past.length,0);
 f.c.move(f.e(600));assert.equal(f.shown.opening.offsetMm,500);f.c.up(f.e(600));assert.equal(f.past.length,1);assert.equal(f.state.room.openings[0].offsetMm,500);assert.deepEqual({...f.state.room.openings[0],offsetMm:100},o);
 const saved=serializeLayout(f.state,catalog);assert.equal(serializeLayout(parseLayout(saved,catalog),catalog),saved);f.undo();assert.equal(f.state.room.openings[0].offsetMm,100);f.redo();assert.equal(serializeLayout(f.state,catalog),saved);
});
test('Escape, pointer loss and cancelled click leave history untouched',()=>{
 const f=fixture({...room,openings:[win]});f.c.begin('window');f.c.down(f.e(1000));assert(f.c.cancel());assert.equal(f.c.up(f.e(1000)),false);assert.equal(f.shown,null);assert.equal(f.past.length,0);
 f.pick(win.id);f.c.down(f.e(200));f.c.move(f.e(500));f.c.cancel();assert.equal(f.state.room.openings[0].offsetMm,100);assert.equal(f.past.length,0);
 f.c.begin('window');f.c.down(f.e(1000));f.c.up(f.e(1600));assert.equal(f.past.length,0);assert(f.c.active);f.c.cancel();
});
test('full wall red, off-wall hidden, max count blocked and wrong pointer ignored',()=>{
 const full={...win,widthMm:4000,offsetMm:0};const f=fixture({...room,openings:[full]});f.c.begin('window');f.c.move(f.e(1000));assert.equal(f.shown.valid,false);f.c.down(f.e(1000));f.c.up(f.e(1000));assert.equal(f.past.length,0);f.c.move(f.e(1000,{off:true}));assert.equal(f.shown,null);
 const g=fixture({...room,openings:Array.from({length:64},(_,i)=>({...win,id:'w'+i,wallIndex:1,widthMm:1,offsetMm:i*2}))});g.c.begin('window');g.c.down(g.e(1000));assert.equal(g.c.up(g.e(1000,{pointerId:2})),false);assert(g.c.dragging);g.c.up(g.e(1000));assert.equal(g.past.length,0);
});
for(const kind of ['window','door'])test(kind+': short imported wall and tiny wall height block hover/click without throwing',()=>{
 for(const r of [{...room,polygonMm:[[0,0],[50,0],[50,3000],[0,3000]]},{...room,wallHeightMm:.5}]){
  const f=fixture(r);f.c.begin(kind);assert.doesNotThrow(()=>f.c.move(f.e(25)));assert.equal(f.shown.valid,false);assert(Number.isFinite(f.shown.opening.widthMm));
  assert.doesNotThrow(()=>{f.c.down(f.e(25));f.c.up(f.e(25));});assert.equal(f.past.length,0);assert.equal(f.writes.length,0);assert(f.c.active);f.c.cancel();assert.equal(f.shown,null);
 }
});
for(const language of supportedLanguages)test(language+': direct tool actions and scene/list selection share editor',()=>{
 const document=new TestDocument(),container=document.createElement('aside'),actions=[],selections=[];document.body.append(container);
 const t=createLayoutTranslator(language),ui=createLayoutUI({container,t,catalog:[],onAction:a=>actions.push(a),onOpeningSelect:id=>selections.push(id)});
 ui.update({...createDefaultLayout(),room:{...room,openings:[win,obstacle]}});
 for(const [key,kind,motion]of [['window','window',null],['hinged','door','hinged'],['sliding','door','sliding']]){const b=container.querySelector(`[data-layout-command="layout.openings.${key}"]`);assert(b.querySelector('svg'));b.click();assert.deepEqual(actions.pop(),{type:'room-opening-place',kind,...(motion?{motion}:{})});}
 const mode=container.querySelector('#layout-opening-mode'),card=container.querySelector('#layout-opening-editor'),host=container.querySelector('#layout-nav-room').parentNode;
 host.scrollTop=600;ui.setOpeningTool({kind:'door',motion:'sliding'});assert.equal(host.scrollTop,0);assert.equal(card.hidden,true);assert.equal(mode.textContent,t('layout.openings.placing',{type:t('layout.openings.sliding')}));assert.equal(container.querySelector('[data-opening-tool="sliding"]').getAttribute('aria-pressed'),'true');assert.equal(container.querySelector('#layout-opening-select-mode').getAttribute('aria-pressed'),'false');assert.equal(ui.openingPlacementContainer.parentNode,host);assert.equal(ui.openingPlacementContainer.hidden,false);assert.equal(container.querySelector('#layout-nav-room').hidden,true,'Placement setup replaces unrelated room settings');
 for(const locale of supportedLanguages){ui.setLocale(createLayoutTranslator(locale));assert.equal(container.querySelector('[data-opening-tool="sliding"]').getAttribute('aria-pressed'),'true');assert.equal(mode.textContent,createLayoutTranslator(locale)('layout.openings.placing',{type:createLayoutTranslator(locale)('layout.openings.sliding')}));}
 ui.setLocale(t);ui.setOpeningTool(null);assert.equal(card.hidden,true,'Cancelling must not revive an unrelated inspector');assert.equal(mode.textContent,t('layout.openings.selectHelp'));assert.equal(container.querySelector('#layout-opening-select-mode').getAttribute('aria-pressed'),'true');assert.equal(ui.openingPlacementContainer.hidden,true);assert.equal(container.querySelector('#layout-nav-room').hidden,false);
 container.querySelector('#layout-opening-select-mode').click();assert.deepEqual(actions.pop(),{type:'room-opening-select'});
 ui.setOpeningSelection(obstacle.id);assert.equal(container.querySelector(`[data-layout-opening-id="${obstacle.id}"]`).getAttribute('aria-pressed'),'true');assert.equal(container.querySelector('[data-layout-field="opening-offsetMm"]').value,'1800.0');
 assert.equal(card.hidden,false);ui.clearOpeningSelection();assert.equal(card.hidden,true);ui.update({...createDefaultLayout(),room:{...room,openings:[win,obstacle]}});assert.equal(card.hidden,true,'State mirrors keep an explicitly cleared opening selection cleared');
 container.querySelector(`[data-layout-opening-id="${win.id}"]`).click();assert.deepEqual(selections,[win.id]);assert(t('layout.openings.placeHelp').includes(language==='en'?'Esc':language==='ru'?'Esc':'Esc'));
 ui.setStatus({busy:true});container.querySelector('[data-layout-command="layout.openings.window"]').click();assert.deepEqual(actions,[]);ui.dispose();
});
test('renderer keeps opening selection during orbit, inactive pointers and export',()=>{
 const source=fs.readFileSync(new URL('../site/layout/layout-renderer.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  function down(event){'),end=source.indexOf('\n  function move(event){',start);
 const create=new Function('openingEvent','setOpeningSelection','disposed','exporting','return ('+source.slice(start,end)+');');
 for(const [button,isPrimary,disposed,exporting]of [[2,true,false,false],[1,true,false,false],[0,false,false,false],[0,true,true,false],[0,true,false,true]]){
  const selections=[],down=create(()=>false,id=>selections.push(id),disposed,exporting);down({button,isPrimary});assert.deepEqual(selections,[]);
 }
});
console.log(JSON.stringify({status:'PASS',cases:results.length,results,scope:'Production event controller and UI listeners; tiny synthetic rooms, no model/native qualification.'}));
