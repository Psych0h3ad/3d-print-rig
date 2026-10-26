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
 const rows=catalog,groupLibrary=[],writes=[],view={setState(){}};
 let state=initial,selected=initial.printers[0]?.id??null,ui=null,busy=false,disposed=false,roomEditing=false,placement=null,operation=null,interactionGeneration=0;
 ${section('const past=','const t=')}
 const $=selector=>document.body.querySelector(selector),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,sync,bind(value){ui=value;sync();},read:()=>({state,selected,past:[...past],future:[...future],writes:[...writes]})};`);
const catalog=[{id:'fixture-printer',label:'Fixture printer',widthMm:200,depthMm:200,heightMm:300}];
const windowOpening={id:'window-seed',type:'window',wallIndex:0,offsetMm:200.125,widthMm:800.375,heightMm:900.625,sillMm:1000.125};
const doorOpening={id:'door-seed',type:'door',wallIndex:1,offsetMm:600.125,widthMm:900.375,heightMm:2100.625,sillMm:0,hinge:'left',openAngleDeg:90};
const slidingDoorOpening={id:'door-seed',type:'door',wallIndex:1,offsetMm:600.125,widthMm:900.375,heightMm:2100.625,sillMm:0,motion:'sliding',slideDirection:'left',openPercent:0};
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
  let r=x.engine.read(),o=r.state.room.openings[0];assert.equal(o.type,'window');assert.equal(o.wallIndex,1);assert.equal(r.past.length,1);assert.equal(r.selected,'printer-1');assert.equal(x.field('widthMm').value,o.widthMm.toFixed(1));
  x.command('layout.openings.addDoor').click();await x.settle();r=x.engine.read();const door=r.state.room.openings.find(v=>v.type==='door');assert(door);assert.equal(r.past.length,2);assert.equal(x.find(`[data-layout-opening-id=${door.id}]`).getAttribute('aria-pressed'),'true');assert.equal(x.find('#layout-opening-hinge').value,'left');
  x.pick(o.id);assert.equal(x.find(`[data-layout-opening-id=${o.id}]`).getAttribute('aria-pressed'),'true');assert.equal(x.engine.read().selected,'printer-1');assert.equal(x.actions.length,2,'Opening selection must not emit object selection');
  x.command('layout.openings.remove').click();await x.settle();assert.deepEqual(x.actions.at(-1),{type:'REMOVE_ROOM_OPENING',id:o.id});assert.equal(x.engine.read().state.room.openings.length,1);
  await x.engine.act({type:'undo'});assert.equal(x.engine.read().state.room.openings.length,2);await x.engine.act({type:'redo'});assert.equal(x.engine.read().state.room.openings.length,1);assert.equal(x.find('#layout-tab-room').getAttribute('aria-selected'),'true');
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
  const width=x.find('[data-layout-field=room-width]');input(width,7000.375);width.blur();width.dispatch('change');assert.equal(x.actions.length,0);
  const n=x.field('offsetMm');input(n,250.875);finish(n,'blur-first');await x.settle();assert.equal(x.engine.read().past.length,1);assert.equal(width.value,'7000.4');
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
  x.ui.setStatus({busy:true});x.command('layout.openings.addDoor').click();x.command('layout.openings.remove').click();assert.equal(x.actions.length,1);x.ui.setStatus({busy:false});
 }finally{x.dispose();}
 const many=Array.from({length:64},(_,i)=>({...windowOpening,id:`tiny-${i}`,offsetMm:i*2,widthMm:1,heightMm:1,sillMm:0})),y=fixture(language,seed(many));try{assert.equal(y.command('layout.openings.addWindow').disabled,true);assert.equal(y.command('layout.openings.addDoor').disabled,true);y.command('layout.openings.addDoor').click();assert.equal(y.actions.length,0);}finally{y.dispose();}
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
  assert.equal(x.engine.read().selected,'printer-1');assert.equal(x.find('#layout-tab-room').getAttribute('aria-selected'),'true');x.pick('window-seed');assert.equal(x.container.querySelector('#layout-opening-motion'),null);assert.equal(x.container.querySelector('[data-layout-field=opening-openPercent]'),null);
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

for(const code of ['OPENING_INVALID','OPENING_COUNT','OPENING_WALL','OPENING_OUT_OF_BOUNDS','OPENING_OVERLAP','OPENING_NO_SPACE','OPENING_WALL_CHANGED','OPENING_NOT_FOUND'])for(const lang of supportedLanguages)assert(hasMessage('layout.error.'+code)&&createLayoutTranslator(lang)('layout.error.'+code).length>0);
assert.deepEqual(hashes(),before,'UI test input changed during run');
const report={status:results.every(r=>r.pass)?'PASS':'FAIL',cases:results.length,results,sourceSHA256:before,execArgv:process.execArgv,scope:'Production UI event listeners and actual app add/update/delete/commit/error/undo/redo with state/openings helpers. Tiny synthetic rooms, controlled DOM/storage/renderer ports; no browser, physical/native/model claim.'};
const output=process.argv.indexOf('--report');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:report.cases,failures:results.filter(r=>!r.pass)}));assert.equal(report.status,'PASS','Opening UI integration regressions');
