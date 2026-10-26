import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const appURL=new URL('../site/layout/layout-app.mjs',import.meta.url),source=fs.readFileSync(appURL,'utf8');
const binding=name=>new URL(source.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`))[1],appURL);
const S=await import(binding('layout-state.mjs')),G=await import(binding('layout-groups.mjs')),{createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator}=await import(new URL('../site/layout/layout-i18n.mjs',import.meta.url));
const {polygonContains,rectangle,transformPolygon}=await import(new URL('../site/layout/layout-geometry.mjs',import.meta.url));
const C=[{id:'fixture',label:'Test printer',widthMm:200,depthMm:180,heightMm:300},{id:'feet-supported',label:'Feet support fixture',widthMm:300,depthMm:120,heightMm:300,supportFootprintMm:rectangle(80,60)}];
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)+a.length));
const factory=new Function('initial','catalog','S','G','document','t',`
 const {applyAction,validatePlacement,serializeLayout,worldTransform,resolveWorldRotation,resolveWorldMove,resolveSupportedPrinterRotation}=S;
 const {transformGroup,renameGroup,resolveGroupRotation,resolveGroupMove}=G;
 const past=[],future=[],writes=[],view={setState(){}};
 let state=initial,selected=null,ui=null,busy=false,disposed=false,roomEditing=false,placement=null,operation=null,interactionGeneration=0;
 const $=s=>document.body.querySelector(s),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('let pendingRotation=null,discreteRotation=null;','async function render(')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,select,bind(u){ui=u;sync();},read:()=>({state,past,writes})};`);
function fixture(state,id){
 const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);
 const engine=factory(state,C,S,G,document,createLayoutTranslator('en')),pending=[];
 const ui=createLayoutUI({container,catalog:C,t:createLayoutTranslator('en'),onAction:a=>{pending.push(engine.act(a));}});engine.bind(ui);engine.select(id);
 return {engine,ui,container,async edit(yaw){const n=container.querySelector('[data-layout-field="yawDeg"]');assert(n);n.focus();n.value=String(yaw);n.dispatch('input');for(const fn of n.listeners.get('keydown')??[])fn({key:'Enter',target:n,preventDefault(){}});await Promise.all(pending);},dispose(){ui.dispose();}};
}
const printer=(parentId,xMm,zMm)=>({id:'p',machineId:'fixture',configurationId:'saved:preserved',attachment:{parentId,surfaceId:parentId?'top':'floor',xMm,zMm,yawDeg:0}});
const rect=S.createRoomPolygon({polygonMm:[[0,0],[4000,0],[4000,3000],[0,3000]]}),concave=S.createRoomPolygon({polygonMm:[[0,0],[4000,0],[4000,1200],[1800,1200],[1800,3000],[0,3000]]});
function seed(room=rect,yaw=0){return S.createDefaultLayout({room,furniture:[S.createDesk({id:'bench',widthMm:600,depthMm:400,heightMm:750,pose:{xMm:yaw?1500:320,zMm:yaw?750:220,yawDeg:yaw}})],printers:[printer('bench',200,-110)]},C);}
const results=[];
async function test(name,fn){await fn();results.push(name);}
function inside(state){assert.deepEqual(S.validatePlacement(state,C),[]);const derived=S.deriveScene(state,C);for(const p of derived.printers){assert(p.positionM.y>=0);assert(polygonContains(state.room.polygonMm,p.worldEnvelopeMm));}for(const p of state.printers){const table=state.furniture.find(f=>f.id===p.attachment.parentId);if(table){const m=C.find(m=>m.id===p.machineId);assert(polygonContains(rectangle(table.widthMm,table.depthMm),transformPolygon(m.supportFootprintMm??rectangle(m.widthMm,m.depthMm),p.attachment)),'Supported footprint crossed tabletop boundary');}}}
async function history(x,original){const end=S.serializeLayout(x.engine.read().state,C);assert.equal(S.serializeLayout(S.parseLayout(end,C),C),end);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,C),S.serializeLayout(original,C));await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,C),end);}
for(const [name,room]of [['rectangle',rect],['concave',concave]]){
 await test(name+': numeric tabletop edge turn fits nearest support position, one edit, exact save/undo/redo',async()=>{
  const initial=seed(room),x=fixture(initial,'p');try{
   assert.throws(()=>S.applyAction(initial,{type:'UPDATE_PRINTER',id:'p',patch:{attachment:{yawDeg:90}}},C));
   await x.edit(90);const {state,past,writes}=x.engine.read(),p=state.printers[0];assert.equal(p.attachment.yawDeg,90);assert.equal(p.attachment.zMm,-100);assert.equal(p.attachment.xMm,200);assert.equal(p.attachment.parentId,'bench');assert.equal(p.attachment.surfaceId,'top');assert.equal(p.configurationId,'saved:preserved');assert.deepEqual(state.furniture,initial.furniture);assert.equal(past.length,1);assert.equal(writes.length,1);inside(state);await history(x,initial);
  }finally{x.dispose();}
 });
 await test(name+': standalone floor printer near wall uses same safe numeric fitter',async()=>{
  const initial=S.createDefaultLayout({room,printers:[printer(null,100,90)]},C),x=fixture(initial,'p');try{await x.edit(90);const state=x.engine.read().state;assert.equal(state.printers[0].attachment.yawDeg,90);assert.equal(state.printers[0].attachment.parentId,null);assert.equal(state.printers[0].attachment.zMm,100);inside(state);await history(x,initial);}finally{x.dispose();}
 });
 for(const grouped of [false,true])await test(name+': '+(grouped?'group':'furniture')+' rotation keeps attached printer local pose and support',async()=>{
  const base=seed(room),initial=grouped?G.createGroup(base,{id:'cell',name:'Cell',memberIds:['bench']},C):base,x=fixture(initial,grouped?'cell':'bench');try{await x.edit(90);const state=x.engine.read().state;assert.equal(grouped?state.groups[0].pose.yawDeg:state.furniture[0].pose.yawDeg,90);assert.deepEqual(state.printers[0].attachment,initial.printers[0].attachment);inside(state);assert.equal(x.engine.read().past.length,1);await history(x,initial);}finally{x.dispose();}
 });
}
await test('rotated tabletop retains exact fractional local angle instead of roundtrip drift',async()=>{const initial=seed(rect,37.1),x=fixture(initial,'p');try{await x.edit(90.125);const state=x.engine.read().state;assert.equal(state.printers[0].attachment.yawDeg,90.125);assert.deepEqual(state.furniture,initial.furniture);inside(state);}finally{x.dispose();}});
await test('repeat 90 degree buttons and reverse remain supported and keep history atomic',async()=>{const initial=seed(),x=fixture(initial,'p');try{for(let i=1;i<=4;i++){await x.engine.act({type:'rotate-world',id:'p',deltaDeg:90});assert.equal(x.engine.read().state.printers[0].attachment.yawDeg,i*90);inside(x.engine.read().state);}for(let i=3;i>=0;i--){await x.engine.act({type:'rotate-world',id:'p',deltaDeg:-90});assert.equal(x.engine.read().state.printers[0].attachment.yawDeg,i*90);inside(x.engine.read().state);}assert.equal(x.engine.read().past.length,8);assert.deepEqual(x.engine.read().state,initial);}finally{x.dispose();}});
await test('infeasible tabletop turn retains a valid bounded angle, never the invalid requested pose',async()=>{const initial=S.createDefaultLayout({room:rect,furniture:[S.createDesk({id:'bench',widthMm:210,depthMm:190,heightMm:750,pose:{xMm:400,zMm:400,yawDeg:0}})],printers:[printer('bench',0,0)]},C),x=fixture(initial,'p');try{await x.edit(90);const state=x.engine.read().state;assert(state.printers[0].attachment.yawDeg<90);assert.equal(state.printers[0].attachment.parentId,'bench');inside(state);}finally{x.dispose();}});
for(const yaw of [90,180])await test('feet support permits body overhang at '+yaw+' degrees while full body remains inside room',async()=>{
 const initial=S.createDefaultLayout({room:rect,furniture:[S.createDesk({id:'bench',widthMm:160,depthMm:300,heightMm:750,pose:{xMm:180,zMm:150,yawDeg:0}})],printers:[{...printer('bench',-20,-60),machineId:'feet-supported'}]},C);
 assert(!polygonContains(rectangle(160,300),transformPolygon(rectangle(300,120),initial.printers[0].attachment)),'Fixture must exercise allowed bed/body overhang');
 inside(initial);const x=fixture(initial,'p');try{await x.edit(yaw);const state=x.engine.read().state;assert.equal(state.printers[0].attachment.yawDeg,yaw);assert.equal(state.printers[0].attachment.parentId,'bench');assert.equal(state.printers[0].attachment.surfaceId,'top');assert.deepEqual(state.furniture,initial.furniture);inside(state);if(yaw===90){assert(Math.abs(state.printers[0].attachment.zMm)<1e-10);assert.equal(state.printers[0].attachment.xMm,-20);}else assert(!polygonContains(rectangle(160,300),transformPolygon(rectangle(300,120),state.printers[0].attachment)));await history(x,initial);}finally{x.dispose();}
});
console.log(JSON.stringify({status:'PASS',cases:results.length,results,scope:'Actual app/UI numerical angle events and existing continuous planning constraints, tiny synthetic rooms. No CAD/models/native or physical fit claim.'}));
