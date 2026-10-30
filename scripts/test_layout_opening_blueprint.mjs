import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOpeningInteraction,defaultOpeningDraft} from '../site/layout/layout-opening-interaction.mjs';
import {createOpeningBlueprint} from '../site/layout/layout-opening-blueprint.mjs';
import {createDefaultLayout,applyAction,serializeLayout,parseLayout} from '../site/layout/layout-state.mjs';
import {createLayoutTranslator,supportedLanguages} from '../site/layout/layout-i18n.mjs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const room={polygonMm:[[0,0],[6000,0],[6000,4000],[0,4000]],wallHeightMm:2400,openings:[]},results=[];
const app=fs.readFileSync(new URL('../site/layout/layout-app.mjs',import.meta.url),'utf8');
const start=app.indexOf('function changeOpening('),end=app.indexOf('async function ensureEquipmentPreview(',start);
assert(start>=0&&end>start);
const makeApp=new Function('S','room',`
let state=S.createDefaultLayout({room}),busy=false,roomEditing=false,catalog=[],n=0,cancel=()=>{};
const applyAction=S.applyAction;
const past=[],selections=[],errors=[],id=kind=>kind+'-'+ ++n;
const commit=next=>{past.push(state);state=next;},selectOpening=value=>{selections.push(value);cancel();},message=(...v)=>errors.push(v),humanError=e=>e.message;
${app.slice(start,end)}
return {changeOpening,get state(){return state},past,selections,errors,setCancel(fn){cancel=fn}};`);
function fixture(){
  const a=makeApp({createDefaultLayout,applyAction},room);let shown=null;
  const c=createOpeningInteraction({room:()=>a.state.room,locate:e=>e.off?null:{wallIndex:e.wall??0,alongMm:e.at},pick:()=>null,preview:v=>shown=v,select(){},commit:a.changeOpening});
  a.setCancel(()=>c.cancel());
  return {a,c,get shown(){return shown},event:(at,extra={})=>({at,button:0,pointerId:1,clientX:at/10,clientY:0,...extra})};
}
function test(name,run){run();results.push(name);}
for(const [kind,motion]of [['window',null],['door','hinged'],['door','sliding'],['vent',null]]){
  test(`${kind}/${motion}: exact dimensions, repeated actual app commits, undo-state and save/load`,()=>{
    const f=fixture(),draft={widthMm:500,heightMm:600,sillMm:kind==='door'?0:800};
    f.c.begin(kind,{motion,draft,repeat:true});const original=serializeLayout(f.a.state);
    f.c.move(f.event(700));assert.deepEqual(['widthMm','heightMm','sillMm'].map(k=>f.shown.opening[k]),[500,600,draft.sillMm]);assert.equal(serializeLayout(f.a.state),original);
    for(const at of [700,1900]){f.c.down(f.event(at));f.c.up(f.event(at));assert(f.c.active);}
    assert.deepEqual(f.a.errors,[]);assert.equal(f.a.past.length,2);assert.equal(f.a.selections.length,0);assert.equal(f.a.state.room.openings.length,2);
    assert.deepEqual(parseLayout(serializeLayout(f.a.state)).room.openings,f.a.state.room.openings);assert.equal(f.a.past[0].room.openings.length,0);assert.equal(f.a.past[1].room.openings.length,1);
    f.c.configure({draft,repeat:false});f.c.down(f.event(3000));f.c.up(f.event(3000));assert.equal(f.c.active,false);assert.equal(f.a.selections.length,1);assert.equal(f.a.past.length,3);
  });
}
test('Shift repeats one click; cancel and invalid drafts never commit stale dimensions',()=>{
  const f=fixture(),draft=defaultOpeningDraft(room,'window');f.c.begin('window',{draft});f.c.down(f.event(800));f.c.up(f.event(800,{shiftKey:true}));assert(f.c.active);assert.equal(f.a.past.length,1);
  for(const widthMm of [NaN,Infinity,0,-1,100001,undefined]){
    assert.equal(f.c.configure({draft:{...draft,widthMm}}),false);f.c.down(f.event(2800));f.c.up(f.event(2800));assert.equal(f.a.past.length,1);assert.equal(f.shown,null);
  }
  f.c.configure({draft:{...draft,widthMm:500},repeat:true});f.c.move(f.event(2800));assert(f.shown.valid);f.c.cancel();assert.equal(f.c.up(f.event(2800)),false);assert.equal(f.a.past.length,1);
});
test('Exact requested dimensions reject too-small walls, excessive height and occupied spans',()=>{
  const f=fixture();for(const draft of [{widthMm:7000,heightMm:500,sillMm:0},{widthMm:500,heightMm:2000,sillMm:500}]){
    f.c.begin('window',{draft});f.c.down(f.event(800));assert.equal(f.shown.valid,false);f.c.up(f.event(800));assert.equal(f.a.past.length,0);
  }
  f.c.begin('window',{draft:{widthMm:4000,heightMm:1000,sillMm:800},repeat:true});f.c.down(f.event(3000));f.c.up(f.event(3000));assert.equal(f.a.past.length,1);
  f.c.down(f.event(3000));assert.equal(f.shown.valid,false);f.c.up(f.event(3000));assert.equal(f.a.past.length,1);
});
for(const lang of supportedLanguages)test(lang+': actual blueprint DOM, preset, invalid draft, locale and disposal',()=>{
  const doc=new TestDocument(),container=doc.createElement('div'),actions=[],t=createLayoutTranslator(lang);
  const ui=createOpeningBlueprint({container,t,onAction:a=>actions.push(a)}),tool={kind:'window'},draft=defaultOpeningDraft(room,'window');
  ui.setState({tool,draft,repeat:false,valid:true});assert.equal(container.hidden,false);assert(!container.textContent.includes('layout.openings.'));
  const preset=container.querySelector('#layout-opening-blueprint-preset');preset.value='600x600';preset.dispatch('change');assert.deepEqual(actions.at(-1).draft,{widthMm:600,heightMm:600,sillMm:900});
  const width=container.querySelector('#layout-opening-blueprint-widthMm');width.value='';width.dispatch('input');assert(Number.isNaN(actions.at(-1).draft.widthMm));
  doc.activeElement=width;ui.setState({tool,draft:{...draft,widthMm:NaN},valid:false});assert.equal(width.value,'');assert.equal(container.querySelector('#layout-opening-blueprint-error').hidden,false);
  ui.setState({tool:{kind:'door',motion:'sliding'},draft:{widthMm:900,heightMm:2100,sillMm:0},repeat:true,valid:true});
  assert.equal(container.querySelector('#layout-opening-blueprint-sillMm').parentNode.parentNode.hidden,true);
  const keep=container.querySelector('#layout-opening-blueprint-repeat');assert(keep.checked);keep.checked=false;keep.dispatch('change');assert.equal(actions.at(-1).draft.sillMm,0);
  container.querySelector('#layout-opening-blueprint-cancel').dispatch('click');assert.equal(actions.at(-1).type,'room-opening-select');
  ui.setLocale(createLayoutTranslator(lang));ui.setState(null);assert(container.hidden);ui.dispose();assert.equal(container.children.length,0);
});
console.log(JSON.stringify({passed:true,cases:results.length,results,scope:'Production opening interaction, actual app changeOpening and DOM controls with real schema roundtrip; no model/native or continuous clearance qualification.'}));
