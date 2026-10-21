import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const root=dirname(fileURLToPath(import.meta.url)),results=[];
const option=process.argv.indexOf('--site'),site=option>=0?resolve(process.argv[option+1]):resolve(root,'../site');
const {createLayoutUI}=await import(pathToFileURL(resolve(site,'layout/layout-ui.mjs')));
const {createDefaultLayout,createDesk,createShelf,createRoomL,createRoomRect,createRoomPolygon,applyAction,validatePlacement}=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const {createLayoutTranslator}=await import(pathToFileURL(resolve(site,'layout/layout-i18n.mjs')));
const doc=new TestDocument(),container=doc.createElement('aside');doc.body.append(container);doc.location={href:'https://example.test/rig/layout/index.html'};doc.documentElement={lang:'en'};
const catalog=[{id:'approved-1',label:'Exact approved printer',widthMm:543.700000000003,depthMm:681.900000000001,heightMm:593.0000000000001,fullScene:{page:'./community.html',machineId:'approved-1'}}];
let state=createDefaultLayout(),selection=null,actions=[],ui;
const mirror=()=>ui.update(state,selection,validatePlacement(state,catalog));
ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:action=>{
  actions.push(action);
  if(['UPDATE_FURNITURE','UPDATE_PRINTER','SET_ATTACHMENT','SET_ROOM'].includes(action.type)){state=applyAction(state,action,catalog);mirror();}
  if(action.type==='select'){selection=action.id;mirror();}
}});
const test=(name,fn)=>{try{fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}};
const field=name=>container.querySelector(`[data-layout-field=${name}]`);
const command=name=>container.querySelector(`[data-layout-command=${name}]`);
const change=(n,v)=>{n.value=String(v);n.dispatch('input');n.dispatch('change');};
const placeFixtureFurniture=(xMm,zMm)=>{for(const f of state.furniture)state=applyAction(state,{type:'UPDATE_FURNITURE',id:f.id,patch:{pose:{xMm,zMm}}},catalog);mirror();assert.equal(validatePlacement(state,catalog).filter(i=>i.code==='ROOM_OUT_OF_BOUNDS'||i.code==='SURFACE_OVERHANG').length,0);};
test('empty state and no initial render request',()=>{mirror();assert.equal(actions.length,0);assert.equal(container.querySelector('#layout-render').disabled,true);assert.match(container.textContent,/Select/);});
test('explicit add command without fetching geometry',()=>{command('layout.addDesk').click();assert.deepEqual(actions.at(-1),{type:'add',kind:'desk'});});
state=applyAction(state,{type:'ADD_FURNITURE',furniture:createDesk({id:'desk-1',depthMm:900})},catalog);
state=applyAction(state,{type:'ADD_FURNITURE',furniture:createShelf({id:'shelf-1'})},catalog);
state=applyAction(state,{type:'ADD_PRINTER',printer:{id:'printer-1',machineId:'approved-1',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}}},catalog);
test('selection follows actual list and one selected ID',()=>{mirror();container.querySelector('[data-layout-entity=desk-1]').click();assert.equal(selection,'desk-1');assert.equal(container.querySelectorAll('[aria-pressed=true]').length,1);});
test('furniture numeric width and signed pose delegate exact reducer action',()=>{change(field('widthMm'),1432.75);assert.equal(state.furniture[0].widthMm,1432.75);change(field('xMm'),-155.125);assert.equal(state.furniture[0].pose.xMm,-155.125);});
test('empty and nonfinite numeric fields never dispatch; blur restores short display without state rounding',()=>{const count=actions.length;change(field('widthMm'),'');change(field('widthMm'),'Infinity');assert.equal(actions.length,count);assert.equal(field('widthMm').getAttribute('aria-invalid'),'true');field('widthMm').blur();assert.equal(field('widthMm').value,'1432.8');assert.equal(state.furniture[0].widthMm,1432.75);});
test('room resize preserves center and finite rectangular state',()=>{change(field('room-width'),5000);assert.deepEqual(state.room.polygonMm,[[-2500,-1500],[2500,-1500],[2500,1500],[-2500,1500]]);});
test('printer attachment change is explicit local surface origin',()=>{selection='printer-1';mirror();const s=container.querySelector('#layout-support');s.value=JSON.stringify(['desk-1','top']);s.dispatch('change');assert.deepEqual(state.printers[0].attachment,{parentId:'desk-1',surfaceId:'top',xMm:0,zMm:0,yawDeg:0});change(field('xMm'),-47.8);assert.equal(state.printers[0].attachment.xMm,-47.8);});
test('rotate, reverse and reset external state preserve exact fields',()=>{const before=state;command('layout.rotateRight').click();assert.equal(state.printers[0].attachment.yawDeg,90);command('layout.rotateLeft').click();assert.equal(state.printers[0].attachment.yawDeg,0);state=before;mirror();assert.equal(Number(field('xMm').value),-47.8);});
test('occupied furniture removal is disabled until explicit floor-detach choice',()=>{selection='desk-1';mirror();assert.equal(command('layout.delete').disabled,true);const c=container.querySelector('#layout-detach');c.checked=true;c.dispatch('change');command('layout.delete').click();assert.deepEqual(actions.at(-1),{type:'delete',id:'desk-1',detachChildren:true});});
test('shelf board height delegates full stable level IDs',()=>{selection='shelf-1';mirror();const l=state.furniture[1].levels[1];change(field(`board-${l.id}`),650);assert.equal(state.furniture[1].levels[1].topMm,650);assert.deepEqual(state.furniture[1].levels.map(l=>l.id),['level-1','level-2','level-3','level-4']);});
test('unknown catalog search never creates guessed machine',()=>{const s=container.querySelector('input[type=search]')||container.querySelectorAll('input').find(n=>n.type==='search');s.value='<unknown>';s.dispatch('input');assert.equal(command('layout.addPrinter').disabled,true);s.value='';s.dispatch('input');assert.equal(command('layout.addPrinter').disabled,false);});
test('busy render cancels but never dispatches disabled mutations',()=>{ui.setStatus({busy:true,canUndo:true,renderProgress:{loaded:1,total:4,phase:'internal_decode_id',message:'Loading real models'}});const count=actions.length;command('layout.addDesk').click();assert.equal(actions.length,count);assert.equal(Number(container.querySelector('progress').value),1);command('cancel').click();assert.deepEqual(actions.at(-1),{type:'cancel'});assert.ok(container.textContent.includes('Loading real models'));assert.ok(!container.textContent.includes('internal_decode_id'));ui.setStatus({busy:false});});
test('explicit full render emits exactly render command from a contained placement',()=>{state=applyAction(state,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{depthMm:800}},catalog);mirror();assert.equal(validatePlacement(state,catalog).filter(issue=>issue.code==='ROOM_OUT_OF_BOUNDS'||issue.code==='SURFACE_OVERHANG').length,0);container.querySelector('#layout-render').click();assert.deepEqual(actions.at(-1),{type:'render'});});
test('actual five-language central engine accepts all UI keys and warnings',()=>{for(const language of ['en','ja','es','ko','ru']){doc.documentElement.lang=language;ui.setLocale(createLayoutTranslator(language));ui.update(state,'printer-1',[{code:'ROOM_OUT_OF_BOUNDS',entityIds:['printer-1'],params:{}}]);assert.ok(container.textContent.length>100);}});
test('file cancel emits nothing and repeated chosen file can be imported',()=>{const f=container.querySelectorAll('input').find(n=>n.type==='file');let count=actions.length;f.files=[];f.dispatch('change');assert.equal(actions.length,count);const file={name:'layout.json',size:127};f.files=[file];f.dispatch('change');assert.deepEqual(actions.at(-1),{type:'import',file});assert.equal(f.value,'');});
test('untrusted catalog text remains literal and DOM creates no injected elements',()=>{assert.equal(container.querySelector('script'),null);assert.equal(container.querySelector('img'),null);});
test('boolean error flag uses human message and explicit clear removes it',()=>{ui.setStatus({message:'The model could not load.',error:true});assert.ok(container.textContent.includes('The model could not load.'));assert.ok(!container.textContent.includes('true'));ui.setStatus({message:'',error:null});assert.equal(container.querySelectorAll('p').find(n=>n.className==='layout-feedback').hidden,true);});
test('unknown warning stays an explicit placement note without missing-key crash',()=>{ui.update(state,'printer-1',[{code:'NEW_UNREVIEWED_SCOPE',entityIds:['printer-1']}]);assert.match(container.textContent,/Exact approved printer/);});
test('desk top thickness follows the fixed 30 mm state contract',()=>{ui.update(state,'desk-1',[]);assert.equal(field('topThicknessMm').readOnly,true);assert.equal(Number(field('topThicknessMm').value),30);});
test('no-op numeric commit retains exact object-list button and emits no state action',()=>{const before=actions.length,b=container.querySelector('[data-layout-entity=printer-1]');change(field('widthMm'),state.furniture[0].widthMm);assert.equal(actions.length,before);assert.equal(container.querySelector('[data-layout-entity=printer-1]'),b);b.click();assert.equal(selection,'printer-1');});
test('selected machine dimensions use one decimal without changing catalog values',()=>{assert.ok(container.textContent.includes('543.7 × 681.9 × 593.0'));assert.equal(catalog[0].widthMm,543.700000000003);});
test('rounded shelf height never writes rounded value on focus/blur or no-input change',()=>{selection='shelf-1';mirror();const raw=state.furniture[1].levels[2].topMm,n=field('board-level-3'),before=actions.length;assert.equal(n.value,raw.toFixed(1));n.focus();n.blur();n.dispatch('change');assert.equal(actions.length,before);assert.equal(state.furniture[1].levels[2].topMm,raw);});
test('L shape is a draft until explicit validated apply',()=>{const shape=container.querySelector('#layout-room-shape'),before=state;shape.value='l';shape.dispatch('change');change(field('room-width'),6000);change(field('room-depth'),4500);change(field('room-cut-width'),1200);change(field('room-cut-depth'),1600);assert.equal(state,before);container.querySelector('#layout-room-apply').click();assert.deepEqual(state.room.polygonMm,[[-3000,-2250],[3000,-2250],[3000,650],[1800,650],[1800,2250],[-3000,2250]]);assert.equal(shape.value,'l');});
test('invalid L cut never replaces accepted room',()=>{const before=state,count=actions.length;change(field('room-cut-width'),6000);container.querySelector('#layout-room-apply').click();assert.equal(state,before);assert.equal(actions.length,count);});
test('custom corners apply exactly to contained objects; correct bounds remain read-only',()=>{for(const f of state.furniture)state=applyAction(state,{type:'UPDATE_FURNITURE',id:f.id,patch:{pose:{xMm:1000,zMm:500}}},catalog);mirror();const shape=container.querySelector('#layout-room-shape'),p=container.querySelector('#layout-room-points'),before=state;shape.value='custom';shape.dispatch('change');p.value='0, 0\n4000, 0\n4000, 3000\n2000, 1500\n0, 3000';p.dispatch('input');assert.equal(state,before);container.querySelector('#layout-room-apply').click();assert.deepEqual(state.room.polygonMm,[[0,0],[4000,0],[4000,3000],[2000,1500],[0,3000]]);assert.equal(field('room-width').readOnly,true);assert.equal(Number(field('room-width').value),4000);assert.equal(Number(field('room-depth').value),3000);const count=actions.length;change(field('room-width'),9999);assert.equal(actions.length,count);mirror();assert.equal(Number(field('room-width').value),4000);});
test('custom malformed, nonfinite, crossing and repeated corners keep accepted state',()=>{const p=container.querySelector('#layout-room-points');for(const text of ['0,0\nInfinity,1\n0,2','0,0\n2,2\n0,2\n2,0','0,0\n1,0','0,0\n2,0\n0,2\n0,0','0,0,0\n1,0\n0,1']){const before=state,count=actions.length;p.value=text;p.dispatch('input');container.querySelector('#layout-room-apply').click();assert.equal(state,before);assert.equal(actions.length,count);}});
test('room draft survives selection refresh and cannot squeeze existing objects outside',()=>{const before=state,p=container.querySelector('#layout-room-points');p.value='-5, -8\n8, -8\n8, 5\n-5, 5';p.dispatch('input');selection='printer-1';mirror();assert.equal(p.value,'-5, -8\n8, -8\n8, 5\n-5, 5');container.querySelector('#layout-room-apply').click();assert.equal(state,before);});
test('rectangle and L import/reversed winding infer shape without changing vertices',()=>{for(const reverse of [false,true]){let room=createRoomL({widthMm:5000,depthMm:4000,cutWidthMm:1200,cutDepthMm:900});if(reverse)room=createRoomPolygon({polygonMm:[...room.polygonMm].reverse(),wallHeightMm:2400});state=applyAction(state,{type:'SET_ROOM',room},catalog);const before=JSON.stringify(state.room);mirror();assert.equal(container.querySelector('#layout-room-shape').value,'l');assert.equal(JSON.stringify(state.room),before);}});
test('one selected-printer sources link uses catalog destination and current document language',()=>{selection='printer-1';mirror();for(const lang of ['en','ja','es','ko','ru']){doc.documentElement.lang=lang;ui.setLocale(createLayoutTranslator(lang));const links=container.querySelectorAll('[data-layout-source-link]');assert.equal(links.length,1);const url=new URL(links[0].href);assert.equal(url.origin,'https://example.test');assert.equal(url.pathname,'/rig/viewer/community.html');assert.equal(url.searchParams.get('machine'),'approved-1');assert.equal(url.searchParams.get('lang'),lang);assert.equal(links[0].rel,'noopener noreferrer');}});
test('saved-state URL-like fields cannot replace the registered source link',()=>{const draft={...state,printers:state.printers.map(p=>({...p,fullScene:{page:'https://bad.test/'},url:'https://bad.test/'}))};ui.update(draft,'printer-1',[]);assert.ok(container.querySelector('[data-layout-source-link]').href.startsWith('https://example.test/rig/viewer/community.html?'));mirror();});
test('edit-room emits a parent command without changing state',()=>{const before=state;command('edit-room').click();assert.deepEqual(actions.at(-1),{type:'edit-room'});assert.equal(state,before);});
test('dedicated SVG chooser cancel/repeated input only forwards the File',()=>{const f=container.querySelector('#layout-svg-file');assert.equal(f.accept,'.svg,image/svg+xml');const file={name:'floor.svg',size:123,text(){throw Error('UI must not parse SVG');}};const before=state,count=actions.length;f.files=[];f.dispatch('change');assert.equal(actions.length,count);for(let i=0;i<2;i++){f.files=[file];f.dispatch('change');assert.deepEqual(actions.at(-1),{type:'import-svg',file});assert.equal(f.value,'');}assert.equal(state,before);});
test('room modal/SVG commands remain disabled while rendering',()=>{ui.setStatus({busy:true});const count=actions.length;command('edit-room').click();assert.equal(actions.length,count);assert.equal(container.querySelector('#layout-svg-file').disabled,true);ui.setStatus({busy:false});});
// Exact binary64 room fixture; parser and browser rendering are separate checks.
const browserSavedPath=resolve(root,'fixtures/layout_short_number_room.json');
test('exact room binary64 values show short depth and inset without state edits',()=>{
  placeFixtureFurniture(-1000,-500);
  const saved=JSON.parse(readFileSync(browserSavedPath,'utf8'));
  assert.equal(saved.format,'3d-print-rig-layout');assert.equal(saved.version,1);assert.equal(saved.units,'mm');
  const xs=saved.room.polygonMm.map(p=>p[0]),zs=saved.room.polygonMm.map(p=>p[1]);
  assert.equal(Math.max(...xs)-Math.min(...xs),6000);assert.equal(Math.max(...zs)-Math.min(...zs),4000.0000000000005);
  assert.equal(Math.max(...zs)-saved.room.polygonMm[2][1],2000.0000000000002);
  const before=JSON.stringify({...saved.room,appearance:state.room.appearance});
  state=applyAction(state,{type:'SET_ROOM',room:createRoomPolygon(saved.room)},catalog);mirror();assert.equal(JSON.stringify(state.room),before);
  assert.equal(container.querySelector('#layout-room-shape').value,'l');
  assert.equal(field('room-width').value,'6000.0');assert.equal(field('room-depth').value,'4000.0');assert.equal(field('room-cut-depth').value,'2000.0');assert.equal(field('room-height').value,'2400.0');
});
test('all unmodified rounded room fields survive focus blur no-input change and Apply with no state action',()=>{
  const before=JSON.stringify(state),count=actions.length;
  for(const name of ['room-width','room-depth','room-height','room-cut-width','room-cut-depth']){const n=field(name);n.focus();n.blur();n.dispatch('change');}
  container.querySelector('#layout-room-apply').click();assert.equal(JSON.stringify(state),before);assert.equal(actions.length,count);
});
test('room height-only edit preserves all original polygon bits and exact edited height',()=>{
  const vertices=JSON.stringify(state.room.polygonMm);change(field('room-height'),2555.123456789);field('room-height').blur();
  assert.equal(field('room-height').value,'2555.1');assert.equal(JSON.stringify(state.room.polygonMm),vertices);
  container.querySelector('#layout-room-apply').click();assert.equal(JSON.stringify(state.room.polygonMm),vertices);assert.equal(state.room.wallHeightMm,2555.123456789);
});
test('editing one L dimension applies the exact user draft and retains other original finite values',()=>{
  const depth=field('room-depth')._sourceValue,height=state.room.wallHeightMm,maxX=Math.max(...state.room.polygonMm.map(p=>p[0]));
  change(field('room-cut-width'),1234.56789);field('room-cut-width').blur();assert.equal(field('room-cut-width').value,'1234.6');
  container.querySelector('#layout-room-apply').click();assert.equal(state.room.polygonMm[3][0],maxX-1234.56789);assert.equal(maxX-state.room.polygonMm[3][0],1234.56789);
  const zs=state.room.polygonMm.map(p=>p[1]);assert.equal(Math.max(...zs)-Math.min(...zs),depth);assert.equal(state.room.wallHeightMm,height);
});
test('custom polygon height-only edit does not reconstruct or round any vertex',()=>{
  placeFixtureFurniture(1000,500);
  const polygonMm=[[.123456789,.234567891],[4000.123456789,.234567891],[3000.123456789,3000.345678912],[.123456789,2000.456789123]];
  state=applyAction(state,{type:'SET_ROOM',room:createRoomPolygon({polygonMm,wallHeightMm:2444.567891})},catalog);mirror();
  assert.equal(container.querySelector('#layout-room-shape').value,'custom');const before=JSON.stringify(state.room.polygonMm);
  field('room-width').focus();field('room-width').blur();container.querySelector('#layout-room-apply').click();assert.equal(JSON.stringify(state.room.polygonMm),before);
  change(field('room-height'),2333.123456);field('room-height').blur();container.querySelector('#layout-room-apply').click();
  assert.equal(JSON.stringify(state.room.polygonMm),before);assert.equal(state.room.wallHeightMm,2333.123456);
});
state=applyAction(state,{type:'SET_ROOM',room:createRoomRect({widthMm:12000,depthMm:12000})},catalog);mirror();
test('furniture and pose fields show short values while unedited state stays exact across language and selection refresh',()=>{
  state=applyAction(state,{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{widthMm:1234.567891,depthMm:450.123456,heightMm:1800.765432,boardThicknessMm:19.876543,pose:{xMm:-.000000001,zMm:12.3456789,yawDeg:89.1234567},levels:state.furniture[1].levels.map((l,i)=>({...l,topMm:200.123456789+i*350.0123456789}))}},catalog);
  selection='shelf-1';mirror();const before=JSON.stringify(state),count=actions.length;
  assert.equal(field('xMm').value,'0.0');assert.equal(field('zMm').value,'12.3');assert.equal(field('yawDeg').value,'89.1');assert.equal(field('widthMm').value,'1234.6');
  for(const language of ['en','ja','es','ko','ru']){ui.setLocale(createLayoutTranslator(language));for(const name of ['widthMm','depthMm','heightMm','boardThicknessMm','xMm','zMm','yawDeg','board-level-1','board-level-2','board-level-3','board-level-4']){const n=field(name);assert.match(n.value,/^-?\d+\.\d$/);n.focus();n.blur();n.dispatch('change');}}
  assert.equal(JSON.stringify(state),before);assert.equal(actions.length,count);
  const printerButton=container.querySelector('[data-layout-entity=printer-1]'),n=field('widthMm');n.focus();n.blur();assert.equal(container.querySelector('[data-layout-entity=printer-1]'),printerButton);printerButton.click();assert.equal(selection,'printer-1');
});
test('one shelf-height edit preserves all unedited levels and furniture numbers exactly',()=>{
  selection='shelf-1';mirror();const before=structuredClone(state.furniture[1]),count=actions.length;change(field('board-level-2'),650.123456789);field('board-level-2').blur();
  assert.equal(field('board-level-2').value,'650.1');assert.equal(state.furniture[1].levels[1].topMm,650.123456789);assert.equal(actions.length,count+1);
  assert.deepEqual({...state.furniture[1],levels:before.levels},before);for(const i of [0,2,3])assert.deepEqual(state.furniture[1].levels[i],before.levels[i]);
});
test('external reset and serialized-state roundtrip keep exact values while the UI continues short display',()=>{
  const before=JSON.stringify(state);state=JSON.parse(before);mirror();assert.equal(JSON.stringify(state),before);assert.equal(field('widthMm').value,'1234.6');
  const saved=state;state=createDefaultLayout();selection=null;mirror();state=saved;selection='shelf-1';mirror();assert.equal(JSON.stringify(state),before);assert.equal(field('zMm').value,'12.3');
});
test('two identical known room warnings identify resolved desktop and printer titles in all five languages without raw IDs or HTML',()=>{
  const before=JSON.stringify(state),count=actions.length;
  for(const language of ['en','ja','es','ko','ru']){
    const t=createLayoutTranslator(language);doc.documentElement.lang=language;ui.setLocale(t);
    const message=t('layout.issue.ROOM_OUT_OF_BOUNDS');
    ui.update(state,selection,[{code:'ROOM_OUT_OF_BOUNDS',entityIds:['desk-1']},{code:'ROOM_OUT_OF_BOUNDS',entityIds:['printer-1'],message}]);
    const list=container.querySelector('ul.layout-issues')||container.querySelectorAll('ul').find(n=>n.className==='layout-issues');
    assert.equal(list.children.length,2);assert.equal(list.children[0].textContent,`${t('layout.deskName',{number:1})}: ${message}`);
    assert.equal(list.children[1].textContent,`Exact approved printer: ${message}`);assert.notEqual(list.children[0].textContent,list.children[1].textContent);
    ui.update(state,selection,[{code:'ROOM_OUT_OF_BOUNDS',entityIds:['internal-unknown-id']},{code:'ROOM_OUT_OF_BOUNDS',entityIds:['desk-1','internal-unknown-id','printer-1']}]);
    assert.equal(list.children[0].textContent,message);assert.equal(list.children[1].textContent,`${t('layout.deskName',{number:1})}, Exact approved printer: ${message}`);assert.ok(!list.textContent.includes('internal-unknown-id'));
    const withUnknown={...state,printers:[...state.printers,{id:'unknown-printer',machineId:'internal-unregistered-machine',attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}}]};
    ui.update(withUnknown,selection,[{code:'ROOM_OUT_OF_BOUNDS',entityIds:['unknown-printer']}]);assert.equal(list.textContent,message);assert.ok(!list.textContent.includes('internal-unregistered-machine'));
    ui.update(state,selection,[{code:'ROOM_OUT_OF_BOUNDS',entityIds:['desk-1'],message:'<img src=x onerror=alert(1)>'}]);assert.equal(list.children[0].textContent,`${t('layout.deskName',{number:1})}: <img src=x onerror=alert(1)>`);assert.equal(list.querySelector('img'),null);
  }
  assert.equal(JSON.stringify(state),before);assert.equal(actions.length,count);mirror();
});

test('flat-plan export names and availability follow projection and language without editing the plan',()=>{
  const before=JSON.stringify(state),empty={...state,printers:[]},render=container.querySelector('#layout-render');ui.update(empty,null,[]);
  for(const language of ['en','ja','es','ko','ru']){
    const t=createLayoutTranslator(language);ui.setLocale(t);ui.setProjection('orthographic-floorplan');assert.equal(render.disabled,false);assert.equal(render.getAttribute('aria-label'),t('layout.render.plan'));assert.equal(container.querySelector('[data-layout-i18n="layout.render.planHelp"]').textContent,t('layout.render.planHelp'));
    ui.setProjection('perspective-3d');assert.equal(render.disabled,true);assert.equal(render.getAttribute('aria-label'),t('layout.render'));assert.equal(container.querySelector('[data-layout-i18n="layout.renderHelp"]').textContent,t('layout.renderHelp'));
  }
  assert.equal(JSON.stringify(state),before);ui.setLocale(createLayoutTranslator('en'));mirror();
});
test('legacy boundary repair remains editable with plan export and blocks detailed 3D export',()=>{
  assert.ok(state.printers.length);const render=container.querySelector('#layout-render'),notice=container.querySelector('#layout-bounds-notice');
  for(const language of ['en','ja','es','ko','ru']){
    const t=createLayoutTranslator(language);ui.setLocale(t);
    for(const code of ['ROOM_OUT_OF_BOUNDS','SURFACE_OVERHANG']){
      ui.update(state,selection,[{code,entityIds:['printer-1']}]);ui.setProjection('perspective-3d');assert.equal(render.disabled,true);assert.equal(notice.hidden,false);assert.equal(notice.textContent,t('layout.repairBounds'));
      ui.setProjection('orthographic-floorplan');assert.equal(render.disabled,false);assert.equal(command('export').disabled,false);
      ui.update(state,selection,[]);ui.setProjection('perspective-3d');assert.equal(render.disabled,false);assert.equal(notice.hidden,true);
    }
  }
  ui.setLocale(createLayoutTranslator('en'));mirror();
});
test('section shortcuts scroll only the sidebar and retain the current selection and source values',()=>{
  selection='desk-1';mirror();const before=JSON.stringify(state),count=actions.length,scrolls=[];
  const draft=field('widthMm');draft.value='1499.25';draft.dispatch('input');
  container.scrollTop=200;container.getBoundingClientRect=()=>({top:20});container.scrollTo=options=>scrolls.push(options);
  container.querySelector('[role=toolbar]').getBoundingClientRect=()=>({height:100});
  for(const name of ['room','add','objects','selection']){
    const target=container.querySelector(`#layout-nav-${name}`);target.getBoundingClientRect=()=>({top:500});target.scrollIntoView=()=>{throw Error('Must not scroll window or other ancestors');};
    command(`layout.nav.${name}`).click();
  }
  assert.equal(scrolls.length,4);assert(scrolls.every(s=>s.top===580&&s.behavior==='instant'));
  container.querySelector('#layout-nav-room').getBoundingClientRect=()=>({top:-1000});command('layout.nav.room').click();assert.equal(scrolls.at(-1).top,0);
  assert.equal(draft.value,'1499.25');assert.equal(JSON.stringify(state),before);assert.equal(actions.length,count);
  draft.blur();selection=null;mirror();assert.equal(command('layout.nav.selection').disabled,true);
  selection='desk-1';mirror();assert.equal(command('layout.nav.selection').disabled,false);
  ui.setStatus({busy:true});assert.equal(command('layout.nav.selection').disabled,true);ui.setStatus({busy:false});
  for(const lang of ['en','ja','es','ko','ru']){const tr=createLayoutTranslator(lang);ui.setLocale(tr);for(const name of ['room','add','objects','selection'])assert.equal(command(`layout.nav.${name}`).getAttribute('aria-label'),tr(`layout.nav.${name}`));}
  ui.setLocale(createLayoutTranslator('en'));mirror();
});
test('dispose removes own UI, listeners and later updates are inert',()=>{const n=command('layout.addDesk'),before=actions.length;ui.dispose();n.click();ui.update(state,'desk-1',[]);assert.equal(container.children.length,0);assert.equal(actions.length,before);ui.dispose();});
const pin=p=>{const b=readFileSync(p);return {sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};};
assert.equal(results.length,46,'Unexpected UI fixture count');
assert.deepEqual(results.filter(r=>!r.pass),[],'UI source/action/short-number regression failures');
console.log(JSON.stringify({status:'PASS',scope:'Actual UI/state/language modules; DOM events and room are fixtures, not browser/model/native evidence.',cases:results.length,ui:pin(resolve(site,'layout/layout-ui.mjs')),state:pin(resolve(site,'layout/layout-state.mjs')),language:pin(resolve(site,'layout/layout-i18n.mjs')),roomFixture:pin(browserSavedPath)}));
