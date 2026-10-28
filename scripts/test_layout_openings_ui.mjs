// Real UI events and app transactions on small synthetic rooms; no model loads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=process.argv.indexOf('--site');
const site=arg<0?path.join(root,'site'):path.resolve(process.argv[arg+1]);
const appURL=pathToFileURL(path.join(site,'layout/layout-app.mjs')),app=fs.readFileSync(appURL,'utf8');
const binding=name=>{const m=app.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`));assert(m,`Missing ${name} binding`);return new URL(m[1],appURL);};
const S=await import(binding('layout-state.mjs')),O=await import(binding('layout-openings.mjs'));
const {createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator,supportedLanguages,hasMessage}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const inputs=['layout-ui.mjs','layout-i18n.mjs','layout.css','layout-state.mjs','layout-openings.mjs','layout-app.mjs'];
const hashes=()=>Object.fromEntries(inputs.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(site,'layout',p))).digest('hex')]));
const before=hashes(),results=[];
const section=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return app.slice(i,j);};
const engineFactory=new Function('initial','catalog','S','O','document','t',`
 const {applyAction,validatePlacement,serializeLayout}=S,{newRoomOpening}=O;
 const rows=catalog,groupLibrary=[],writes=[],openingStarts=[],updatePlacementBar=()=>{},view={setState(){},setPlacement(){},setOpeningSelection(){},cancelOpening(){activeOpeningTool=null;ui?.setOpeningTool?.(null);},beginOpening(kind,{motion,frameRoom}={}){openingStarts.push({kind,motion,frameRoom});activeOpeningTool={kind,...(kind==='door'?{motion:motion??'hinged'}:{})};ui.setOpeningTool(activeOpeningTool);}};
 let state=initial,selected=initial.printers[0]?.id??null,ui=null,buildTools=null,activeOpeningTool=null,busy=false,disposed=false,roomEditing=false,placement=null,lastPlacementTarget=null,operation=null,interactionGeneration=0;
 ${section('const past=','const t=')}
 const $=selector=>document.body.querySelector(selector),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('function cancelPlacement(){','function beginPlacement(spec){')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,sync,selectOpening,changeOpening,bind(value){ui=value;sync();},read:()=>({state,selected,openingStarts:[...openingStarts],past:[...past],future:[...future],writes:[...writes]})};`);
const catalog=[{id:'fixture-printer',label:'Fixture printer',widthMm:200,depthMm:200,heightMm:300}];
const windowOpening={id:'window-seed',type:'window',wallIndex:0,offsetMm:200.125,widthMm:800.375,heightMm:900.625,sillMm:1000.125};
const doorOpening={id:'door-seed',type:'door',wallIndex:1,offsetMm:600.125,widthMm:900.375,heightMm:2100.625,sillMm:0,hinge:'left',openAngleDeg:90};
const slidingDoorOpening={id:'door-seed',type:'door',wallIndex:1,offsetMm:600.125,widthMm:900.375,heightMm:2100.625,sillMm:0,motion:'sliding',slideDirection:'left',openPercent:0};
const ventOpening={id:'vent-seed',type:'vent',wallIndex:2,offsetMm:450.125,widthMm:300.375,heightMm:300.625,sillMm:1800.125};
function seed(openings=[windowOpening,doorOpening]){
 return S.createDefaultLayout({room:{...S.createRoomRect({widthMm:6000,depthMm:4000,wallHeightMm:2800}),...(openings===null?{}:{openings})},printers:[{id:'printer-1',machineId:'fixture-printer',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}}]},catalog);
}
function fixture(language='en',initial=seed()){
 const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);document.documentElement={lang:language};document.location={href:'https://example.test/layout/'};
 let t=createLayoutTranslator(language);const engine=engineFactory(initial,catalog,S,O,document,(...args)=>t(...args)),actions=[],pending=[];
 const ui=createLayoutUI({container,catalog,t,onAction:a=>{actions.push(structuredClone(a));const p=engine.act(a);pending.push(p);return p;}});engine.bind(ui);
 const find=q=>{const n=container.querySelector(q);assert(n,`Missing ${q}`);return n;};
 const command=key=>find(`[data-layout-command=${key}]`),field=prop=>find(`[data-layout-field=opening-${prop}]`),pick=id=>find(`[data-layout-opening-id=${id}]`).click();
 const feedback=()=>container.querySelectorAll('p').find(n=>n.className==='layout-feedback');
 find('#layout-tab-room').click();
  // Editing fixtures choose an opening explicitly; startup no longer invents a selection.
  if(initial.room.openings?.length)ui.setOpeningSelection(initial.room.openings[0].id);
 return {document,container,initial,engine,ui,actions,find,command,field,pick,feedback,get t(){return t;},locale(lang){document.documentElement.lang=lang;t=createLayoutTranslator(lang);ui.setLocale(t);},async settle(){await Promise.all(pending);await Promise.resolve();},dispose(){ui.dispose();}};
}
const opening=(state,id)=>state.room.openings.find(o=>o.id===id);
function enter(n){const e={type:'keydown',target:n,key:'Enter',preventDefault(){this.defaultPrevented=true;}};for(const fn of n.listeners.get('keydown')||[])fn(e);assert(e.defaultPrevented);}
function input(n,v){n.focus();n.value=String(v);n.dispatch('input');}
function finish(n,order){if(order==='enter')enter(n);if(order==='change-first'){n.dispatch('change');n.blur();}else{n.blur();n.dispatch('change');}}
async function test(name,run){try{await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
function noHistory(x,source){const r=x.engine.read();assert.equal(S.serializeLayout(r.state,catalog),source);assert.equal(r.past.length,0);assert.equal(r.writes.length,0);}
function chooseMotion(x,motion){const n=x.find('#layout-opening-motion');n.value=motion;n.dispatch('change');}
function assertMotion(x,motion){
 const o=opening(x.engine.read().state,'door-seed');assert.equal(o.motion??'hinged',motion);assert.equal(x.find('#layout-opening-motion').value,motion);assert.equal(o.sillMm,0);
 if(motion==='sliding'){
  assert.equal(Object.hasOwn(o,'hinge'),false);assert.equal(Object.hasOwn(o,'openAngleDeg'),false);assert.equal(x.container.querySelector('#layout-opening-hinge'),null);assert.equal(x.container.querySelector('[data-layout-field=opening-openAngleDeg]'),null);
  assert.equal(x.find('#layout-opening-slide-direction').value,o.slideDirection);assert.equal(x.field('openPercent').value,o.openPercent.toFixed(1));
 }else{
  assert.equal(Object.hasOwn(o,'slideDirection'),false);assert.equal(Object.hasOwn(o,'openPercent'),false);assert.equal(x.container.querySelector('#layout-opening-slide-direction'),null);assert.equal(x.container.querySelector('[data-layout-field=opening-openPercent]'),null);assert.equal(x.find('#layout-opening-hinge').value,o.hinge);assert.equal(x.field('openAngleDeg').value,o.openAngleDeg.toFixed(1));
 }
}

for(const language of supportedLanguages)await test(`${language}: optional schema, wall labels/coordinates, add selection and delete undo`,async()=>{
 const x=fixture(language,seed(null));
 try{
  assert.equal(x.find('#layout-opening-list').hidden,true);assert.equal(x.find('#layout-tab-room').getAttribute('aria-selected'),'true');
  const wall=x.find('#layout-opening-add-wall');assert.equal(wall.options.length,4);assert.equal(wall.options[0].textContent,x.t('layout.openings.wall',{index:1,length:'6000.0'}));
  wall.value='1';wall.dispatch('change');assert.equal(x.find('#layout-opening-add-wall-coordinates').textContent,x.t('layout.openings.wallCoordinates',{index:2,startX:'3000.0',startZ:'-2000.0',endX:'3000.0',endZ:'2000.0'}));
  x.command('layout.openings.addWindow').click();await x.settle();assert.deepEqual(x.actions[0],{type:'room-opening-add',kind:'window',wallIndex:1});
  let r=x.engine.read(),o=r.state.room.openings[0];assert.equal(o.type,'window');assert.equal(o.wallIndex,1);assert.equal(r.past.length,1);assert.equal(r.selected,null);assert.equal(x.field('widthMm').value,o.widthMm.toFixed(1));
  x.command('layout.openings.addDoor').click();await x.settle();r=x.engine.read();const door=r.state.room.openings.find(v=>v.type==='door');assert(door);assert.equal(r.past.length,2);assert.equal(x.find(`[data-layout-opening-id=${door.id}]`).getAttribute('aria-pressed'),'true');assert.equal(x.find('#layout-opening-hinge').value,'left');
  x.pick(o.id);assert.equal(x.find(`[data-layout-opening-id=${o.id}]`).getAttribute('aria-pressed'),'true');assert.equal(x.engine.read().selected,null);assert.equal(x.actions.length,2,'Opening selection must not emit object selection');
  x.command('layout.openings.remove').click();await x.settle();assert.deepEqual(x.actions.at(-1),{type:'REMOVE_ROOM_OPENING',id:o.id});assert.equal(x.engine.read().state.room.openings.length,1);
  await x.engine.act({type:'undo'});assert.equal(x.engine.read().state.room.openings.length,2);await x.engine.act({type:'redo'});assert.equal(x.engine.read().state.room.openings.length,1);assert.equal(x.find('#layout-tab-selection').getAttribute('aria-selected'),'true');
 }finally{x.dispose();}
});

const edits=[['window-seed','widthMm',850.125],['window-seed','heightMm',950.375],['window-seed','sillMm',1100.625],['window-seed','offsetMm',250.875],['door-seed','widthMm',950.125],['door-seed','heightMm',2050.375],['door-seed','offsetMm',550.625],['door-seed','openAngleDeg',120]];
for(const language of supportedLanguages)for(const [id,prop,value]of edits)for(const order of ['blur-first','change-first','enter'])await test(`${language}/${id}/${prop}/${order}: exact single transaction and roundtrip`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  x.pick(id);const n=x.field(prop);input(n,value);finish(n,order);await x.settle();const r=x.engine.read();assert.deepEqual(x.actions,[{type:'UPDATE_ROOM_OPENING',id,patch:{[prop]:value}}]);assert.equal(opening(r.state,id)[prop],value);assert.equal(r.past.length,1);assert.equal(r.writes.length,1);assert.equal(r.selected,'printer-1');
  assert.equal(x.field(prop),n,'Value edit should retain focused control');n.dispatch('change');n.blur();enter(n);await x.settle();assert.equal(x.actions.length,1);assert.equal(x.engine.read().past.length,1);
  const saved=S.serializeLayout(r.state,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: wall/hinge controls, full precision no-op and finite dimension floor`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  for(const [id,prop]of [['window-seed','widthMm'],['window-seed','sillMm'],['door-seed','offsetMm']]){x.pick(id);const n=x.field(prop);n.focus();enter(n);n.blur();n.dispatch('change');input(n,opening(x.initial,id)[prop]);finish(n,'blur-first');await x.settle();}noHistory(x,original);assert.deepEqual(x.actions,[]);
  x.pick('door-seed');const hinge=x.find('#layout-opening-hinge');hinge.value='right';hinge.dispatch('change');await x.settle();assert.deepEqual(x.actions.at(-1),{type:'UPDATE_ROOM_OPENING',id:'door-seed',patch:{hinge:'right'}});assert.equal(opening(x.engine.read().state,'door-seed').hinge,'right');
  const wall=x.find('#layout-opening-wall');wall.value='2';wall.dispatch('change');await x.settle();assert.deepEqual(x.actions.at(-1),{type:'UPDATE_ROOM_OPENING',id:'door-seed',patch:{wallIndex:2}});assert.equal(opening(x.engine.read().state,'door-seed').wallIndex,2);
  x.pick('window-seed');input(x.field('widthMm'),1.25);finish(x.field('widthMm'),'enter');await x.settle();assert.equal(opening(x.engine.read().state,'window-seed').widthMm,1.25,'Fractional millimetres retain precision above the renderable dimension floor');
  input(x.field('widthMm'),.25);finish(x.field('widthMm'),'enter');await x.settle();assert.equal(opening(x.engine.read().state,'window-seed').widthMm,1.25,'Sub1mm dimensions must not create collapsed opening meshes');
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const [id,prop,value,key]of [
 ['window-seed','widthMm',0,'layout.validNumber'],['window-seed','widthMm',9000,'layout.error.OPENING_OUT_OF_BOUNDS'],['door-seed','openAngleDeg',121,'layout.validNumber'],['window-seed','heightMm','','layout.validNumber']
])for(const order of ['blur-first','change-first','enter'])await test(`${language}/${id}/${prop}=${value}/${order}: rejection rolls back, error retained, no history`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  x.pick(id);const n=x.field(prop),display=n.value;input(n,value);finish(n,order);await x.settle();noHistory(x,original);assert.equal(n.value,display);const count=x.actions.length;assert.equal(x.feedback().hidden,false);assert.equal(x.feedback().textContent,x.t(key));
  n.dispatch('change');n.blur();enter(n);x.engine.sync();await x.settle();noHistory(x,original);assert.equal(x.actions.length,count);assert.equal(x.feedback().hidden,false);assert.equal(x.feedback().textContent,x.t(key));
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: room draft survives opening edits, tabs, locale and explicit room Apply`,async()=>{
 const x=fixture(language);try{
  x.find('#layout-tab-room').click();const width=x.find('[data-layout-field=room-width]');input(width,7000.375);width.blur();width.dispatch('change');assert.equal(x.actions.length,0);
  x.pick('window-seed');const n=x.field('offsetMm');input(n,250.875);finish(n,'blur-first');await x.settle();assert.equal(x.engine.read().past.length,1);assert.equal(width.value,'7000.4');
  x.find('#layout-tab-selection').click();x.find('#layout-tab-room').click();x.locale(language);assert.equal(x.find('[data-layout-field=room-width]').value,'7000.4');
  x.find('#layout-room-apply').click();await x.settle();const room=x.engine.read().state.room;assert.equal(room.polygonMm[1][0],3500.1875);assert.deepEqual(room.openings.map(o=>o.id),['window-seed','door-seed']);assert.equal(opening(x.engine.read().state,'window-seed').offsetMm,250.875);assert.equal(x.engine.read().past.length,2);
 }finally{x.dispose();}
});

await test('locale rebuild retains dirty opening input; later event commits only its original opening',async()=>{
 const x=fixture();try{
  const n=x.field('sillMm');input(n,1150.875);x.locale('ja');const next=x.field('sillMm');assert.notEqual(n,next);assert.equal(x.document.activeElement,next);assert.equal(next.value,'1150.875');finish(next,'blur-first');await x.settle();assert.equal(opening(x.engine.read().state,'window-seed').sillMm,1150.875);assert.equal(x.actions.length,1);
  x.pick('door-seed');n.dispatch('change');n.blur();await x.settle();assert.equal(x.actions.length,1);assert.equal(opening(x.engine.read().state,'door-seed').sillMm,0);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: no-space rejection, busy controls and 64-opening limit`,async()=>{
 const x=fixture(language,seed([{...windowOpening,offsetMm:0,widthMm:6000,heightMm:2800,sillMm:0}]));try{
  const original=S.serializeLayout(x.initial,catalog);x.command('layout.openings.addWindow').click();await x.settle();noHistory(x,original);assert.equal(x.feedback().textContent,x.t('layout.error.OPENING_NO_SPACE'));assert.equal(x.actions.length,1);
  x.ui.setStatus({busy:true});x.command('layout.openings.addDoor').click();x.command('layout.openings.addVent').click();x.command('layout.openings.vent').click();x.command('layout.openings.remove').click();assert.equal(x.actions.length,1);x.ui.setStatus({busy:false});
 }finally{x.dispose();}
 const many=Array.from({length:64},(_,i)=>({...windowOpening,id:`tiny-${i}`,offsetMm:i*2,widthMm:1,heightMm:1,sillMm:0})),y=fixture(language,seed(many));try{for(const key of ['addWindow','addDoor','addVent','vent']){assert.equal(y.command(`layout.openings.${key}`).disabled,true);y.command(`layout.openings.${key}`).click();}assert.equal(y.actions.length,0);}finally{y.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: three-wall outline labels and door warning stay readable`,()=>{
 const state=S.createDefaultLayout({room:S.createRoomPolygon({polygonMm:[[0,0],[3000,0],[3000,4000]],wallHeightMm:2800})},catalog),x=fixture(language,state);try{
  const options=x.find('#layout-opening-add-wall').options;assert.deepEqual(options.map(o=>o.textContent),[3000,4000,5000].map((length,i)=>x.t('layout.openings.wall',{index:i+1,length:length.toFixed(1)})));
  x.ui.update(state,null,[{code:'DOOR_SWING_OBSTRUCTED',params:{openingId:'door-safe',entityIds:[]}}]);assert(x.container.textContent.includes(x.t('layout.warning.DOOR_SWING_OBSTRUCTED')));assert.equal(x.container.querySelector('script'),null);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: legacy hinged, sliding, hinged, exact undo/redo and saved reload`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  x.pick('door-seed');assertMotion(x,'hinged');chooseMotion(x,'hinged');await x.settle();assert.deepEqual(x.actions,[]);noHistory(x,original);assert.equal(Object.hasOwn(opening(x.engine.read().state,'door-seed'),'motion'),false);
  const oldAngle=x.field('openAngleDeg'),oldHinge=x.find('#layout-opening-hinge');chooseMotion(x,'sliding');await x.settle();assertMotion(x,'sliding');assert.deepEqual(x.actions,[{type:'SET_ROOM_OPENING_MOTION',id:'door-seed',motion:'sliding'}]);assert.equal(x.engine.read().past.length,1);assert.equal(x.engine.read().writes.length,1);assert.equal(opening(x.engine.read().state,'door-seed').slideDirection,'left');assert.equal(opening(x.engine.read().state,'door-seed').openPercent,0);
  input(oldAngle,30);finish(oldAngle,'blur-first');oldHinge.value='right';oldHinge.dispatch('change');await x.settle();assert.equal(x.actions.length,1,'Detached hinged controls cannot edit sliding state');
  const savedSliding=S.serializeLayout(x.engine.read().state,catalog),loaded=fixture(language,S.parseLayout(savedSliding,catalog));try{loaded.pick('door-seed');assertMotion(loaded,'sliding');assert.equal(S.serializeLayout(loaded.engine.read().state,catalog),savedSliding);}finally{loaded.dispose();}
  const oldPercent=x.field('openPercent'),oldDirection=x.find('#layout-opening-slide-direction');chooseMotion(x,'hinged');await x.settle();assertMotion(x,'hinged');assert.equal(opening(x.engine.read().state,'door-seed').hinge,'left');assert.equal(opening(x.engine.read().state,'door-seed').openAngleDeg,90);assert.equal(x.engine.read().past.length,2);assert.equal(x.engine.read().writes.length,2);assert.deepEqual(x.actions.at(-1),{type:'SET_ROOM_OPENING_MOTION',id:'door-seed',motion:'hinged'});
  input(oldPercent,50);finish(oldPercent,'blur-first');oldDirection.value='right';oldDirection.dispatch('change');await x.settle();assert.equal(x.actions.length,2,'Detached sliding controls cannot edit hinged state');const savedHinged=S.serializeLayout(x.engine.read().state,catalog);
  await x.engine.act({type:'undo'});assertMotion(x,'sliding');assert.equal(S.serializeLayout(x.engine.read().state,catalog),savedSliding);await x.engine.act({type:'undo'});assertMotion(x,'hinged');assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);await x.engine.act({type:'redo'});assertMotion(x,'sliding');assert.equal(S.serializeLayout(x.engine.read().state,catalog),savedSliding);await x.engine.act({type:'redo'});assertMotion(x,'hinged');assert.equal(S.serializeLayout(x.engine.read().state,catalog),savedHinged);
  const loadedHinged=fixture(language,S.parseLayout(savedHinged,catalog));try{loadedHinged.pick('door-seed');assertMotion(loadedHinged,'hinged');assert.equal(opening(loadedHinged.engine.read().state,'door-seed').motion,'hinged');}finally{loadedHinged.dispose();}
  assert.equal(x.engine.read().selected,'printer-1');assert.equal(x.find('#layout-tab-selection').getAttribute('aria-selected'),'true');x.pick('window-seed');assert.equal(x.container.querySelector('#layout-opening-motion'),null);assert.equal(x.container.querySelector('[data-layout-field=opening-openPercent]'),null);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const value of [0,37.125,100])for(const order of ['blur-first','change-first','enter'])await test(`${language}/sliding/openPercent=${value}/${order}: exact numeric transaction or source no-op`,async()=>{
 const x=fixture(language,seed([windowOpening,{...slidingDoorOpening,openPercent:50}])),original=S.serializeLayout(x.initial,catalog);try{
  x.pick('door-seed');const n=x.field('openPercent');assert.equal(n.min,'0');assert.equal(n.max,'100');input(n,value);finish(n,order);await x.settle();assertMotion(x,'sliding');assert.deepEqual(x.actions,[{type:'UPDATE_ROOM_OPENING',id:'door-seed',patch:{openPercent:value}}]);assert.equal(x.engine.read().past.length,1);assert.equal(x.engine.read().writes.length,1);assert.equal(x.field('openPercent'),n);assert.equal(opening(x.engine.read().state,'door-seed').openPercent,value);
  n.dispatch('change');n.blur();enter(n);await x.settle();assert.equal(x.actions.length,1);const saved=S.serializeLayout(x.engine.read().state,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const invalid of [-1,101,''])await test(`${language}/sliding/openPercent=${invalid}: rejection retains localized error and no history`,async()=>{
 const x=fixture(language,seed([windowOpening,{...slidingDoorOpening,openPercent:37.125}])),original=S.serializeLayout(x.initial,catalog);try{
  x.pick('door-seed');const n=x.field('openPercent');input(n,invalid);finish(n,'enter');await x.settle();noHistory(x,original);assert.deepEqual(x.actions,[]);assert.equal(n.value,'37.1');assert.equal(x.feedback().textContent,x.t('layout.validNumber'));assert.equal(x.feedback().hidden,false);n.dispatch('change');n.blur();await x.settle();noHistory(x,original);assert.equal(x.feedback().hidden,false);assert.equal(x.feedback().textContent,x.t('layout.validNumber'));
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: sliding direction, dirty percent locale rebuild and room draft independence`,async()=>{
 const x=fixture(language,seed([windowOpening,{...slidingDoorOpening,openPercent:37.125}]));try{
  x.pick('door-seed');const original=S.serializeLayout(x.initial,catalog),percent=x.field('openPercent');percent.focus();enter(percent);percent.blur();percent.dispatch('change');input(percent,37.125);finish(percent,'blur-first');await x.settle();noHistory(x,original);assert.deepEqual(x.actions,[]);
  const direction=x.find('#layout-opening-slide-direction');assert.deepEqual(direction.options.map(o=>o.textContent),[x.t('layout.openings.slideLeft'),x.t('layout.openings.slideRight')]);direction.value='right';direction.dispatch('change');await x.settle();assert.deepEqual(x.actions.at(-1),{type:'UPDATE_ROOM_OPENING',id:'door-seed',patch:{slideDirection:'right'}});assertMotion(x,'sliding');
  const roomWidth=x.find('[data-layout-field=room-width]');input(roomWidth,7000.375);roomWidth.blur();roomWidth.dispatch('change');const n=x.field('openPercent');input(n,61.875);x.locale(language);const replacement=x.field('openPercent');assert.notEqual(replacement,n);assert.equal(x.document.activeElement,replacement);assert.equal(replacement.value,'61.875');finish(replacement,'blur-first');await x.settle();assert.equal(opening(x.engine.read().state,'door-seed').openPercent,61.875);assert.equal(x.find('[data-layout-field=room-width]').value,'7000.4');assert.equal(x.engine.read().past.length,2);
  const beforeActions=x.actions.length;x.ui.setStatus({busy:true});assert.equal(x.find('#layout-opening-motion').disabled,true);assert.equal(x.find('#layout-opening-slide-direction').disabled,true);chooseMotion(x,'hinged');direction.value='left';direction.dispatch('change');assert.equal(x.actions.length,beforeActions);x.ui.setStatus({busy:false});x.engine.sync();assertMotion(x,'sliding');
  x.ui.update(x.engine.read().state,'printer-1',[{code:'DOOR_SWING_WALL',params:{walls:'1, 2',wallIndices:[0,1]}}]);assert(x.container.textContent.includes(x.t('layout.warning.DOOR_SWING_WALL',{walls:'1, 2'})));assertMotion(x,'sliding');
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: app placement mode is contextual, leaves no history and exits on tab change or opening selection`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  x.command('layout.openings.sliding').click();await x.settle();assert.equal(x.feedback().hidden,true,'Placement start must not enter the app error handler');assert.deepEqual(x.actions.at(-1),{type:'room-opening-place',kind:'door',motion:'sliding'});assert.equal(x.find('[data-opening-tool="sliding"]').getAttribute('aria-pressed'),'true');assert.equal(x.find('#layout-opening-editor').hidden,true);assert.equal(x.find('#layout-opening-mode').textContent,x.t('layout.openings.placing',{type:x.t('layout.openings.sliding')}));noHistory(x,original);
  assert.equal(x.engine.read().openingStarts.at(-1).frameRoom,true);
  x.command('layout.openings.hinged').click();await x.settle();assert.equal(x.engine.read().openingStarts.at(-1).frameRoom,false);x.command('layout.openings.sliding').click();await x.settle();assert.equal(x.engine.read().openingStarts.at(-1).frameRoom,false);noHistory(x,original);
  x.find('#layout-tab-output').click();await x.settle();assert.deepEqual(x.actions.at(-1),{type:'room-opening-select'});assert.equal(x.find('#layout-opening-select-mode').getAttribute('aria-pressed'),'true');assert.equal(x.find('#layout-nav-output').hidden,false);noHistory(x,original);
  x.find('#layout-tab-room').click();x.command('layout.openings.window').click();await x.settle();x.engine.selectOpening('door-seed');assert.equal(x.find('#layout-opening-editor').hidden,false);assert.equal(x.find('#layout-opening-title').textContent,x.t('layout.openings.item',{type:x.t('layout.openings.door'),number:2,wall:2}));assert.equal(x.find('#layout-opening-select-mode').getAttribute('aria-pressed'),'true');assert.equal(x.engine.read().selected,null);noHistory(x,original);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: Room retains opening tools and inventory; opening properties use Selected`,()=>{
 const x=fixture(language);try{
  const panel=x.find('#layout-nav-room'),section=x.find('#layout-openings'),card=x.find('#layout-opening-editor'),manual=x.find('#layout-opening-add-wall').parentNode.parentNode;
  assert.equal(panel.children[1],section);assert.equal(panel.children[2].tagName,'DETAILS');assert(!panel.children[2].open);assert.equal(panel.children[3].tagName,'DETAILS');assert(!panel.children[3].open);assert.equal(manual.tagName,'DETAILS');assert(!manual.open);
  assert.equal(card.parentNode,x.find('#layout-nav-selection'));assert.equal(section.contains(card),false);assert.equal(section.contains(x.find('#layout-opening-list')),true);assert.equal(card.querySelectorAll('fieldset').length,1);
  const host=panel.parentNode;host.scrollTop=900;x.ui.setOpeningSelection('door-seed');assert.equal(host.scrollTop,0);assert.equal(card.querySelectorAll('fieldset').length,2);assert.equal(x.find('#layout-browser-body').hidden,true);assert.equal(x.find('#layout-nav-selection').hidden,false);assert.equal(panel.hidden,true);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const motion of ['hinged','sliding'])await test(`${language}/${motion}: compact selection keeps dimensions and motion before collapsed wall details`,()=>{
 const x=fixture(language,seed([windowOpening,motion==='sliding'?slidingDoorOpening:doorOpening])),original=S.serializeLayout(x.initial,catalog);try{
  x.pick('door-seed');const card=x.find('#layout-opening-editor'),groups=card.querySelectorAll('fieldset'),position=x.find('#layout-opening-position'),palette=x.find('#layout-opening-tool-options'),summary=palette.firstChild;
  assert.equal(position.tagName,'DETAILS');assert(!position.open);assert.equal(position.firstChild.textContent,x.t('layout.openings.position'));assert(position.contains(x.field('offsetMm')));assert(position.contains(x.find('#layout-opening-wall')));
  assert.equal(groups[0].firstChild.textContent,x.t('layout.openings.size'));assert.equal(groups[1].firstChild.textContent,x.t('layout.openings.motion'));assert([...card.children].indexOf(groups[0])<[...card.children].indexOf(groups[1]));assert([...card.children].indexOf(groups[1])<[...card.children].indexOf(position));assert.equal(position.contains(x.command('layout.openings.center')),false);
  const openingField=x.field(motion==='sliding'?'openPercent':'openAngleDeg');assert(groups[1].contains(openingField));assert.strictEqual(openingField.parentNode.parentNode.parentNode,x.find('#layout-opening-motion').parentNode.parentNode,'Motion type and opening amount share the primary row');
  assert.equal(palette.open,false);assert.equal(summary.hidden,false);assert.equal(summary.textContent,x.t('layout.openings.title'));assert.equal(palette.parentNode.dataset.compact,'true');assert(x.find('#layout-nav-room').firstChild.className.includes('layout-sr-only'));assert(x.find('#layout-openings-heading').className.includes('layout-sr-only'));
  palette.open=true;position.open=true;x.engine.sync();assert.equal(palette.open,true);assert.strictEqual(x.find('#layout-opening-position'),position);assert.equal(position.open,true);noHistory(x,original);
  x.command('layout.openings.window').click();assert.equal(palette.open,true);assert.equal(summary.hidden,true);assert.equal(palette.parentNode.dataset.compact,'false');assert.equal(card.hidden,true);noHistory(x,original);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const [id,preset]of [['window-seed','600x600'],['door-seed','800x2100']])await test(`${language}/${id}: size preset is one undoable exact edit; sill/placement retained`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  x.pick(id);const before=opening(x.initial,id),size=x.find('#layout-opening-size-preset');assert.equal(size.value,'custom');size.value=preset;size.dispatch('change');await x.settle();
  const [widthMm,heightMm]=preset.split('x').map(Number);assert.deepEqual(x.actions,[{type:'UPDATE_ROOM_OPENING',id,patch:{widthMm,heightMm}}]);const current=opening(x.engine.read().state,id);assert.deepEqual(current,{...before,widthMm,heightMm});assert.equal(x.engine.read().past.length,1);assert.strictEqual(x.find('#layout-opening-size-preset'),size);assert.equal(size.value,preset);
  size.dispatch('change');await x.settle();assert.equal(x.actions.length,1);const saved=S.serializeLayout(x.engine.read().state,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);assert.equal(size.value,'custom');await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);assert.equal(size.value,preset);
  x.ui.setStatus({busy:true});size.value='1600x2100';size.dispatch('change');assert.equal(x.actions.length,1);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: rejected size preset rolls back; centering retains exact other fields`,async()=>{
  const tight={...windowOpening,wallIndex:0,offsetMm:0,widthMm:800,heightMm:900,sillMm:1000},base=seed([tight]),initial=S.createDefaultLayout({...base,room:{...base.room,polygonMm:[[-500,-2000],[500,-2000],[500,2000],[-500,2000]]}},catalog);
 const x=fixture(language,initial),original=S.serializeLayout(initial,catalog);try{
  const size=x.find('#layout-opening-size-preset');size.value='1800x1200';size.dispatch('change');await x.settle();noHistory(x,original);assert.equal(size.value,'custom');assert.equal(x.feedback().textContent,x.t('layout.error.OPENING_OUT_OF_BOUNDS'));
  x.command('layout.openings.center').click();await x.settle();assert.deepEqual(opening(x.engine.read().state,tight.id),{...tight,offsetMm:100});assert.equal(x.engine.read().past.length,1);x.command('layout.openings.center').click();await x.settle();assert.equal(x.engine.read().past.length,1);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);
 }finally{x.dispose();}
});

function assertVent(x,id){
 const o=opening(x.engine.read().state,id);assert.equal(o.type,'vent');
 assert.deepEqual(Object.keys(o).sort(),['id','type','wallIndex','offsetMm','widthMm','heightMm','sillMm'].sort(),'Fan openings contain only common fields');
 assert.equal(x.find('#layout-opening-editor').hidden,false);assert.equal(x.find('#layout-nav-selection').hidden,false);
 for(const prop of ['widthMm','heightMm','sillMm','offsetMm'])assert.equal(x.field(prop).value,o[prop].toFixed(1));
 assert.equal(x.field('sillMm').parentNode.parentNode.firstChild.textContent,x.t('layout.openings.lowerEdgeHeight'));
 for(const selector of ['#layout-opening-motion','#layout-opening-hinge','#layout-opening-slide-direction','[data-layout-field=opening-openPercent]','[data-layout-field=opening-openAngleDeg]'])assert.equal(x.container.querySelector(selector),null);
 const title=x.t('layout.openings.item',{type:x.t('layout.openings.vent'),number:x.engine.read().state.room.openings.findIndex(v=>v.id===id)+1,wall:o.wallIndex+1});
 assert.equal(x.find('#layout-opening-title').textContent,title);
 const item=x.find(`[data-layout-opening-id=${id}]`);assert.equal(item.getAttribute('aria-label'),title);assert.equal(item.getAttribute('aria-pressed'),'true');
 assert.equal(item.querySelector('svg').getAttribute('aria-hidden'),'true');
 assert.equal(item.querySelector('path').getAttribute('d'),x.command('layout.openings.vent').querySelector('path').getAttribute('d'));
}

for(const language of supportedLanguages)await test(`${language}: fan tool starts placement without edits and retains its own active state`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  const tools=x.container.querySelectorAll('[data-opening-tool]');assert.deepEqual(tools.map(n=>n.dataset.openingTool),['window','hinged','sliding','vent']);
  for(const kind of ['vent','window','sliding','vent']){
   x.command(`layout.openings.${kind}`).click();await x.settle();const tool=x.find(`[data-opening-tool=${kind}]`);
   assert.equal(tool.getAttribute('aria-pressed'),'true');assert.equal(tools.filter(n=>n.getAttribute('aria-pressed')==='true').length,1);
   assert.equal(x.find('#layout-opening-select-mode').getAttribute('aria-pressed'),'false');assert.equal(x.find('#layout-opening-editor').hidden,true);
   assert.equal(x.find('#layout-opening-mode').textContent,x.t('layout.openings.placing',{type:x.t(`layout.openings.${kind}`)}));
  }
  assert.deepEqual(x.actions[0],{type:'room-opening-place',kind:'vent'});assert.equal(x.engine.read().openingStarts[0].frameRoom,true);
  assert(x.engine.read().openingStarts.slice(1).every(v=>v.frameRoom===false));noHistory(x,original);
  const tool=x.command('layout.openings.vent');assert.equal(tool.getAttribute('aria-label'),x.t('layout.openings.vent'));assert.equal(tool.querySelector('svg').getAttribute('aria-hidden'),'true');
  x.find('#layout-tab-output').click();await x.settle();assert.deepEqual(x.actions.at(-1),{type:'room-opening-select'});assert.equal(x.find('[data-opening-tool=vent]').getAttribute('aria-pressed'),'false');noHistory(x,original);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: manual fan add selects it, saves only common fields and supports delete/undo/reload`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog);try{
  const wall=x.find('#layout-opening-add-wall');wall.value='2';wall.dispatch('change');x.command('layout.openings.addVent').click();await x.settle();
  assert.deepEqual(x.actions,[{type:'room-opening-add',kind:'vent',wallIndex:2}]);const r=x.engine.read(),o=r.state.room.openings.at(-1);assertVent(x,o.id);
  assert.equal(o.wallIndex,2);assert.equal(o.widthMm,300);assert.equal(o.heightMm,300);assert.equal(o.sillMm,1800);assert.equal(r.past.length,1);assert.equal(r.writes.length,1);
  const saved=S.serializeLayout(r.state,catalog);assert.equal(r.writes[0],saved);const loaded=fixture(language,S.parseLayout(saved,catalog));try{loaded.pick(o.id);assertVent(loaded,o.id);noHistory(loaded,saved);}finally{loaded.dispose();}
  x.command('layout.openings.remove').click();await x.settle();assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);assert.equal(x.engine.read().writes.length,2);
  await x.engine.act({type:'undo'});x.pick(o.id);assertVent(x,o.id);assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);
  await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);assert.equal(x.find('#layout-opening-editor').hidden,true);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const [prop,v]of [['widthMm',350.125],['heightMm',400.375],['sillMm',1500.625],['offsetMm',500.875]])for(const order of ['enter','blur-first','change-first'])await test(`${language}/fan/${prop}/${order}: one exact UI edit, save/reload and undo/redo`,async()=>{
 const x=fixture(language,seed([windowOpening,doorOpening,ventOpening])),original=S.serializeLayout(x.initial,catalog);try{
  x.pick(ventOpening.id);const field=x.field(prop);input(field,v);finish(field,order);await x.settle();
  assert.deepEqual(x.actions,[{type:'UPDATE_ROOM_OPENING',id:ventOpening.id,patch:{[prop]:v}}]);const r=x.engine.read();assert.deepEqual(opening(r.state,ventOpening.id),{...ventOpening,[prop]:v});assert.equal(r.past.length,1);assert.equal(r.writes.length,1);assertVent(x,ventOpening.id);
  field.dispatch('change');field.blur();enter(field);await x.settle();assert.equal(x.actions.length,1);assert.equal(x.engine.read().writes.length,1);
  const saved=S.serializeLayout(r.state,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);assertVent(x,ventOpening.id);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: fan square presets, custom sizes, centering and wall reassignment keep height above floor`,async()=>{
 const x=fixture(language,seed([ventOpening]));try{
  const preset=x.find('#layout-opening-size-preset');assert.deepEqual(preset.options.map(n=>n.value),['custom','150x150','200x200','300x300']);
  for(const size of [150,200,300,150]){
   const history=x.engine.read().past.length;preset.value=`${size}x${size}`;preset.dispatch('change');await x.settle();assert.deepEqual(opening(x.engine.read().state,ventOpening.id),{...ventOpening,widthMm:size,heightMm:size});assert.equal(x.engine.read().past.length,history+1);assert.equal(preset.value,`${size}x${size}`);assertVent(x,ventOpening.id);
  }
  const history=x.engine.read().past.length;preset.dispatch('change');await x.settle();assert.equal(x.engine.read().past.length,history);
  const field=x.field('widthMm');input(field,175.125);finish(field,'enter');await x.settle();assert.equal(preset.value,'custom');
  const before=opening(x.engine.read().state,ventOpening.id);x.command('layout.openings.center').click();await x.settle();assert.deepEqual(opening(x.engine.read().state,ventOpening.id),{...before,offsetMm:(6000-before.widthMm)/2});
  const wall=x.find('#layout-opening-wall');wall.value='0';wall.dispatch('change');await x.settle();assert.equal(opening(x.engine.read().state,ventOpening.id).wallIndex,0);assertVent(x,ventOpening.id);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: fan/window/door/fan selection and locale rebuild discard obsolete controls`,async()=>{
 const x=fixture(language,seed([ventOpening,windowOpening,slidingDoorOpening]));try{
  const old=x.field('sillMm');input(old,1600.875);x.locale(language);const current=x.field('sillMm');assert.notEqual(current,old);assert.equal(current.value,'1600.875');assert.equal(x.document.activeElement,current);finish(current,'blur-first');await x.settle();assert.equal(opening(x.engine.read().state,ventOpening.id).sillMm,1600.875);
  x.pick(windowOpening.id);assert.equal(x.field('sillMm').parentNode.parentNode.firstChild.textContent,x.t('layout.openings.sill'));const windowSill=x.field('sillMm');
  x.pick(slidingDoorOpening.id);assertMotion(x,'sliding');const percent=x.field('openPercent');x.pick(ventOpening.id);assertVent(x,ventOpening.id);
  const actions=x.actions.length;for(const field of [old,windowSill,percent]){input(field,50);finish(field,'change-first');}await x.settle();assert.equal(x.actions.length,actions);assertVent(x,ventOpening.id);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const [prop,v,key]of [['widthMm',0,'layout.validNumber'],['heightMm',1200,'layout.error.OPENING_OUT_OF_BOUNDS'],['sillMm',-1,'layout.validNumber'],['sillMm',2700,'layout.error.OPENING_OUT_OF_BOUNDS'],['offsetMm',5900,'layout.error.OPENING_OUT_OF_BOUNDS']])await test(`${language}/fan/${prop}=${v}: rejected edits preserve saved plan and localized error`,async()=>{
 const x=fixture(language,seed([ventOpening])),original=S.serializeLayout(x.initial,catalog);try{
  const n=x.field(prop);input(n,v);finish(n,'enter');await x.settle();noHistory(x,original);assertVent(x,ventOpening.id);assert.equal(x.feedback().textContent,x.t(key));assert.equal(x.feedback().hidden,false);
 }finally{x.dispose();}
});

await test('fan scene add and wall-drag callbacks use actual app history and saving',async()=>{
 const x=fixture('en',seed(null)),original=S.serializeLayout(x.initial,catalog);try{
  const opening=O.newRoomOpening(x.initial.room,{id:'preview-fan',type:'vent',wallIndex:3});
  x.command('layout.openings.vent').click();await x.settle();noHistory(x,original);
  x.engine.changeOpening({type:'add',opening});const r=x.engine.read(),o=r.state.room.openings[0];assert.notEqual(o.id,opening.id);assertVent(x,o.id);assert.equal(r.writes.length,1);assert.equal(r.past.length,1);
  x.engine.changeOpening({type:'update',opening:{...o,offsetMm:o.offsetMm+175.125}});assertVent(x,o.id);assert.equal(x.engine.read().writes.length,2);assert.equal(x.engine.read().past.length,2);
  const saved=S.serializeLayout(x.engine.read().state,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),r.writes[0]);await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);
 }finally{x.dispose();}
});

for(const code of ['OPENING_INVALID','OPENING_COUNT','OPENING_WALL','OPENING_OUT_OF_BOUNDS','OPENING_OVERLAP','OPENING_NO_SPACE','OPENING_WALL_CHANGED','OPENING_NOT_FOUND'])for(const lang of supportedLanguages)assert(hasMessage('layout.error.'+code)&&createLayoutTranslator(lang)('layout.error.'+code).length>0);
assert.deepEqual(hashes(),before,'UI test input changed during run');
const report={status:results.every(r=>r.pass)?'PASS':'FAIL',cases:results.length,results,sourceSHA256:before,execArgv:process.execArgv,scope:'Production UI event listeners and actual app add/update/delete/commit/error/undo/redo with state/openings helpers. Tiny synthetic rooms, controlled DOM/storage/renderer ports; no browser, physical/native/model claim.'};
const output=process.argv.indexOf('--report');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:report.cases,failures:results.filter(r=>!r.pass)}));assert.equal(report.status,'PASS','Opening UI integration regressions');
