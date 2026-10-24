// Registered source/DOM-interface regression. Real XML/CTM/trusted-pointer/WebGL
// and rendered-machine audits remain separate release evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fixtureDOM} from './fixtures/layout_room_dom.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
const site=path.resolve(option('--site')||fileURLToPath(new URL('../site/',import.meta.url)));
const resourceSite=path.resolve(option('--resource-site')||site),root=path.resolve(site,'..');
const read=relative=>fs.readFileSync(path.join(site,relative),'utf8');
const locate=relative=>[path.join(site,relative),path.join(resourceSite,relative)].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
const consumed=new Map(),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function consume(relative){const filename=locate(relative);assert.ok(filename,'Missing normal resource: '+relative);const bytes=fs.readFileSync(filename);consumed.set(relative,sha(bytes));return bytes.toString('utf8')}
const checks=[];async function test(id,run){await run();checks.push({id,status:'PASS'})}
const DOM=fixtureDOM();DOM.install();let networkCalls=0;
globalThis.fetch=()=>{networkCalls++;throw Error('Preview/editor source regression must not fetch models or URLs')};
const S=await import(pathToFileURL(path.join(site,'layout/layout-state.mjs')));
const P=await import(pathToFileURL(path.join(site,'layout/layout-svg.mjs')));
const E=await import(pathToFileURL(path.join(site,'layout/layout-room-editor.mjs')));
const key=n=>'layout.roomEditor.'+n;
const L=[[0,0],[600,0],[600,150],[250,150],[250,400],[0,400]];
const cat=S.createCatalog([{id:'fixture-machine',widthMm:200,depthMm:150,heightMm:300}]);
const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:4000,depthMm:3000}),printers:[{id:'p',machineId:'fixture-machine',configurationId:'preserved-id',attachment:{parentId:null,surfaceId:'floor',xMm:-1000,zMm:-500,yawDeg:30}}]},cat);
const emptyInitial=S.createDefaultLayout({room:initial.room},cat);
const initialJSON=S.serializeLayout(initial,cat),originalPrinter=structuredClone(initial.printers[0]);
const makeL=()=>DOM.setXML([DOM.element('polygon',{id:'room-L',points:L.map(p=>p.join(',')).join(' ')})]);
const svgFile={size:140,text:async()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><polygon points="0,0 600,0 600,150 250,150 250,400 0,400"/></svg>'};
const appSource=consume('layout/layout-app.mjs');
function extract(source,start,end){assert.equal(source.split(start).length,2,'Ambiguous app extraction start');const at=source.indexOf(start),stop=source.indexOf(end,at);assert.ok(stop>at);return source.slice(at,stop)}
const commitSource=extract(appSource,'function commit(', '\nfunction select(');
const actionOriginal=extract(appSource,'async function act(', '\nfunction updateLanguage(');
// Delivery may append a content-hash query. Match only this exact relative
// module, retain the unique match, and replace that whole token for replay.
const editorImport=/await\s+import\(\s*(['"])(\.\/layout-room-editor\.mjs(?:\?[^'"\s#]*)?)\1\s*\)/g;
const editorMatches=[...actionOriginal.matchAll(editorImport)];assert.equal(editorMatches.length,1,'Expected exactly one exact relative editor import, with optional delivery query');
const editorMatch=editorMatches[0],actionSource=actionOriginal.slice(0,editorMatch.index)+'await deps.editorModule()'+actionOriginal.slice(editorMatch.index+editorMatch[0].length);
// Replay the ACTUAL source action/commit bodies with only the import boundary
// and ambient UI/storage hooks injected. No app startup/model renderer runs.
const engineFactory=new Function('deps',`
 let state=deps.state,catalog=deps.catalog,busy=false,roomEditing=false,disposed=false,selected=null,operation=null,interactionGeneration=0,placement=null;
 const past=[],future=[],language={t:x=>x},view={view:x=>deps.views.push(x)};
 const applyAction=deps.applyAction,serializeLayout=deps.serialize,sync=()=>deps.syncs++,store=()=>deps.saved.push(deps.serialize(state,catalog));
 const humanError=e=>e.errors?.[0]?.code||e.code||e.message,message=(value,error)=>deps.errors.push({text:typeof value==='function'?value():value,error});
 const $=selector=>{if(selector!=='#layout-status')throw Error('Unexpected UI hook: '+selector);return deps.statusNode;};
 const ui={setStatus:next=>deps.uiStatuses.push({...next})};
 ${commitSource}\n${actionSource}
 return {act,getState:()=>state,isEditing:()=>roomEditing,history:()=>({past:past.length,future:future.length}),dispose:()=>disposed=true};
`);
function engine(sourceState=initial){const trace={views:[],saved:[],errors:[],syncs:0,statusNode:{hidden:false,textContent:'Previous action error'},uiStatuses:[],state:sourceState,catalog:cat,applyAction:S.applyAction,serialize:S.serializeLayout,editorModule:async()=>E};return {engine:engineFactory(trace),trace}}
async function dialogReady(){for(let i=0;i<30;i++){if(DOM.doc.body.children.some(e=>e.tagName==='dialog'))return DOM.editor();await Promise.resolve()}assert.fail('Editor dialog was not opened')}
const rejectCode=fn=>{try{fn()}catch(e){assert.ok(e instanceof P.FloorplanSVGError);return e.code}assert.fail('Unsafe input accepted')};

await test('normal-source-resources-and-lazy-full-model-boundary',async()=>{
  const required=['index.html','layout.css','layout-app.mjs','layout-ui.mjs','layout-renderer.mjs','layout-state.mjs','layout-geometry.mjs','layout-svg.mjs','layout-room-editor.mjs','layout-room-editor.css','layout-language.mjs','layout-i18n.mjs','layout-machine-loader.mjs','layout-catalog.json'];
  for(const name of required)consume('layout/'+name);
  const html=read('layout/index.html');assert.match(html,/<script\b[^>]*type="module"[^>]*src="\.\/layout-app\.mjs(?:\?[^"\s#]*)?"/);
  assert.match(html,/layoutLanguage/);assert.match(html,/id="layout-sidebar"/);assert.match(html,/id="layout-scene"/);
  const maps=[...html.matchAll(/<script\b[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));assert.ok(maps.some(m=>m.imports?.three),'Normal full model source needs a Three import map');
  const files=required.filter(f=>f.endsWith('.mjs'));let references=0;
  for(const name of files){const source=read('layout/'+name);
    assert.ok(!/(?:^|[\s'"])[A-Za-z]:[\\/](?!\/)|\/Users\/|\/home\/[a-z]|chatgpt\.com\/(?:c|share)\/|codex:\/\/threads\//im.test(source),'Private path/chat in public layout source: '+name);
    for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)){
      const url=new URL(match[1],pathToFileURL(path.join(site,'layout',name)));url.search='';url.hash='';const relative=path.relative(site,fileURLToPath(url)).replaceAll('\\','/');assert.ok(!relative.startsWith('..'));consume(relative);references++;
    }
    for(const match of source.matchAll(/new URL\(['"](\.\/[^'"?#]+\.css(?:\?[^'"#]*)?)['"],\s*import\.meta\.url\)/g)){const url=new URL(match[1],pathToFileURL(path.join(site,'layout',name)));url.search='';consume(path.relative(site,fileURLToPath(url)).replaceAll('\\','/'));}
  }
  assert.ok(references>15);assert.doesNotMatch(appSource,/import\s+[^;\n]*from\s*['"]\.\/layout-machine-loader/);
  assert.match(appSource,/async function render\([\s\S]*?await import\(['"]\.\/layout-machine-loader\.mjs(?:\?[^'"\s#]*)?['"]\)/);
  const parser=read('layout/layout-svg.mjs');assert.doesNotMatch(parser,/\bfetch\s*\(|XMLHttpRequest|innerHTML|outerHTML|insertAdjacentHTML|appendChild|createElementNS|\beval\s*\(/);
  assert.doesNotMatch(read('layout/layout-room-editor.mjs'),/innerHTML|outerHTML|insertAdjacentHTML/);
  consume('viewer/machines.js');
  const {machineChoices}=await import(pathToFileURL(locate('viewer/machines.js')));
  const rows=JSON.parse(read('layout/layout-catalog.json')).machines;assert.ok(rows.length>0);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert.deepEqual(rows.map(r=>r.id).sort(),machineChoices.filter(r=>r.available!==false).map(r=>r.id).sort(),'Every registered available machine must appear, no missing/extra proxy');
  const actualCatalog=S.createCatalog(rows.map(r=>({...r,widthMm:r.dimensionsMm.width,depthMm:r.dimensionsMm.depth,heightMm:r.dimensionsMm.height})));
  assert.equal(actualCatalog.entries.length,rows.length);
});
await test('real-app-import-scaled-L-Apply-JSON-and-parent-history',async()=>{
  makeL();const {engine:a,trace}=engine(),pending=a.act({type:'import-svg',file:svgFile}),editor=await dialogReady();assert.equal(a.isEditing(),true);
  const apply=editor.button(key('apply'));assert.equal(apply.disabled,true);apply.click();apply.emit('click');assert.equal(editor.dialog.open,true);assert.equal(a.getState(),initial);assert.equal(a.history().past,0);
  editor.change(key('width'),6000);assert.equal(apply.disabled,false);apply.click();await pending;
  const expected=[[-3000,-2000],[3000,-2000],[3000,-500],[-500,-500],[-500,2000],[-3000,2000]];
  const applied=structuredClone(a.getState().room.polygonMm);assert.equal(applied.length,expected.length);
  for(let i=0;i<expected.length;i++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(applied[i][axis]-expected[i][axis])<=16*Number.EPSILON*Math.max(1,Math.abs(expected[i][axis])),'Uniform scaling arithmetic mismatch');
  assert.deepEqual(a.getState().printers[0],originalPrinter);assert.equal(a.getState().room.wallHeightMm,2400);
  assert.equal(a.history().past,1);assert.equal(a.isEditing(),false);assert.equal(trace.errors.length,0);
  assert.equal(trace.statusNode.hidden,true);assert.equal(trace.statusNode.textContent,'');assert.deepEqual(trace.uiStatuses,[{message:'',error:false}]);
  const saved=S.serializeLayout(a.getState(),cat);assert.deepEqual(S.parseLayout(saved,cat).room.polygonMm,applied);
  await a.act({type:'undo'});assert.equal(a.getState(),initial);await a.act({type:'redo'});assert.equal(S.serializeLayout(a.getState(),cat),saved);
  assert.equal(S.serializeLayout(initial,cat),initialJSON);
});
await test('real-app-valid-SVG-cannot-move-room-boundary-through-retained-printer',async()=>{
  const outside=S.createDefaultLayout({room:initial.room,printers:[{...originalPrinter,attachment:{...originalPrinter.attachment,xMm:100,zMm:-50}}]},cat);
  const before=S.serializeLayout(outside,cat);makeL();const {engine:a,trace}=engine(outside),pending=a.act({type:'import-svg',file:svgFile}),e=await dialogReady();
  e.change(key('width'),6000);assert.equal(e.button(key('apply')).disabled,false);e.button(key('apply')).click();await pending;
  assert.equal(a.getState(),outside);assert.equal(S.serializeLayout(a.getState(),cat),before);assert.equal(a.history().past,0);assert.deepEqual(trace.saved,[]);
  assert.equal(a.isEditing(),false);assert.equal(trace.errors.length,1);assert.equal(trace.errors[0].text,'ROOM_OUT_OF_BOUNDS');
  assert.equal(trace.statusNode.hidden,false);assert.equal(trace.statusNode.textContent,'Previous action error');assert.deepEqual(trace.uiStatuses,[]);
});
await test('real-app-editor-same-room-is-noop-not-extra-history-or-storage',async()=>{
  const {engine:a,trace}=engine(),pending=a.act({type:'edit-room'}),e=await dialogReady();e.button(key('apply')).click();await pending;
  assert.equal(a.getState(),initial);assert.equal(a.history().past,0);assert.deepEqual(trace.saved,[]);assert.deepEqual(trace.errors,[]);
  assert.equal(trace.statusNode.hidden,false);assert.deepEqual(trace.uiStatuses,[]);
});
await test('real-app-cancelled-draft-is-atomic-and-editing-blocks-other-actions',async()=>{
  const {engine:a}=engine(),pending=a.act({type:'edit-room'}),editor=await dialogReady();editor.change(key('width'),8000);
  await a.act({type:'REMOVE_PRINTER',id:'p'});assert.equal(a.getState(),initial);editor.button('common.close').click();await pending;
  assert.equal(a.getState(),initial);assert.equal(a.history().past,0);assert.equal(a.isEditing(),false);
});
await test('real-editor-drag-draft-Undo-and-pointer-cancel-retain-original',async()=>{
  const {engine:a}=engine(),pending=a.act({type:'edit-room'}),e=await dialogReady(),original=e.points();
  const first=e.svg.children.find(n=>n.tagName==='circle');e.press(-2000,-1500,first);e.svg.emit('pointermove',{clientX:-1800,clientY:-1200});e.svg.emit('pointerup');assert.notDeepEqual(e.points(),original);
  e.button(key('undo')).click();assert.deepEqual(e.points(),original);e.press(-2000,-1500,e.svg.children.find(n=>n.tagName==='circle'));e.svg.emit('pointermove',{clientX:-1600,clientY:-1100});e.svg.emit('pointercancel');assert.deepEqual(e.points(),original);
  e.button('common.close').click();await pending;assert.equal(a.getState(),initial);
});
await test('unsafe-entities-script-image-events-URL-paint-reject-without-state-commit',async()=>{
  for(const text of ['<!DOCTYPE svg><svg/>','<svg>&#65;</svg>','<?xml-stylesheet href="https://example.invalid/x"?><svg/>'])assert.ok(rejectCode(()=>P.parseFloorplanSVG(text)));
  for(const child of [DOM.element('script'),DOM.element('foreignObject'),DOM.element('image'),DOM.element('rect',{onload:'not-run'}),DOM.element('rect',{fill:'url(#x)'}),DOM.element('use',{href:'#x'})]){
    DOM.setXML([child]);assert.ok(rejectCode(()=>P.parseFloorplanSVG('<svg/>')));
  }
  DOM.setXML([DOM.element('script')]);const {engine:a,trace}=engine();await a.act({type:'import-svg',file:svgFile});assert.equal(a.getState(),initial);assert.equal(a.history().past,0);assert.equal(a.isEditing(),false);assert.equal(trace.errors.length,1);assert.equal(DOM.doc.body.children.length,0);
});
await test('oversize-and-read-error-reject-before-Apply-and-never-mutate-layout',async()=>{
  let reads=0;const {engine:a,trace}=engine();await a.act({type:'import-svg',file:{size:2097153,text:async()=>{reads++;return ''}}});assert.equal(reads,0);
  await a.act({type:'import-svg',file:{size:1,text:async()=>{throw Error('fixture read failure')}}});assert.equal(a.getState(),initial);assert.equal(a.history().past,0);assert.equal(trace.errors.length,2);assert.equal(DOM.doc.body.children.length,0);
});
await test('invalid-width-checkbox-never-enables-Apply-and-valid-bounds-remain-usable',async()=>{
  for(const invalid of ['',0,-1,29.9,100000.1,'NaN','Infinity']){
    makeL();const {engine:a}=engine(),pending=a.act({type:'import-svg',file:svgFile}),e=await dialogReady();e.change(key('width'),invalid);
    const checkbox=e.all().find(n=>n.tagName==='input'&&n.type==='checkbox');assert.ok(checkbox);checkbox.checked=true;checkbox.emit('change');
    assert.equal(e.button(key('apply')).disabled,true,'Invalid width must keep Apply disabled even after explicit checkbox');
    e.button(key('apply')).emit('click');assert.equal(e.dialog.open,true);assert.equal(a.getState(),initial);e.button('common.close').click();await pending;
  }
  for(const width of [30,100000]){
    makeL();const {engine:a}=engine(emptyInitial),pending=a.act({type:'import-svg',file:svgFile}),e=await dialogReady();e.change(key('width'),width);assert.equal(e.button(key('apply')).disabled,false);e.button(key('apply')).click();await pending;
    const xs=a.getState().room.polygonMm.map(p=>p[0]);assert.equal(Math.max(...xs)-Math.min(...xs),width);assert.deepEqual(a.getState().printers,[]);
  }
});
await test('self-crossing-edit-and-empty-number-cannot-commit',async()=>{
  const {engine:a}=engine(),pending=a.act({type:'edit-room'}),e=await dialogReady();e.button(key('new')).click();for(const p of [[0,0],[1000,1000],[0,1000],[1000,0]])e.press(...p);
  e.button(key('apply')).click();assert.equal(e.dialog.open,true);assert.equal(a.getState(),initial);e.button('common.close').click();await pending;
  const next=a.act({type:'edit-room'}),f=await dialogReady();f.change(key('width'),'');f.button(key('apply')).emit('click');assert.equal(f.dialog.open,true);assert.equal(a.getState(),initial);f.button('common.close').click();await next;
});
await test('disposed-app-does-not-commit-late-editor-result',async()=>{
  const {engine:a}=engine(),pending=a.act({type:'edit-room'}),e=await dialogReady();a.dispose();e.change(key('width'),6000);e.button(key('apply')).click();await pending;assert.equal(a.getState(),initial);assert.equal(a.history().past,0);assert.equal(a.isEditing(),false);
});
await test('global-work-and-source-input-budgets-are-live-not-documentation',()=>{
  assert.equal(P.SVG_LIMITS.totalPoints,16384);assert.equal(P.SVG_LIMITS.totalSegments,8192);assert.equal(P.SVG_LIMITS.inputVertices,32768);assert.equal(P.SVG_LIMITS.work,2000000);
  const points=Array.from({length:1800},(_,i)=>`${i%100},${Math.floor(i/100)}`).join(' ');DOM.setXML(Array.from({length:19},()=>DOM.element('polyline',{points})));assert.equal(rejectCode(()=>P.parseFloorplanSVG('<svg/>')),'SVG_INPUT_VERTEX_LIMIT');
  DOM.setXML([DOM.element('defs',{},[DOM.element('path',{d:'M0 0 '.repeat(14000)})])]);assert.equal(rejectCode(()=>P.parseFloorplanSVG('<svg/>')),'SVG_PATH_LIMIT');
});
await test('exact-editor-import-query-closure-unique-and-no-other-relative-module-accepted',()=>{
  const matches=text=>[...text.matchAll(editorImport)];
  for(const text of ["await import('./layout-room-editor.mjs')",'await import("./layout-room-editor.mjs?v=abcdef")',"await import( './layout-room-editor.mjs?v=hash&mode=source' )"]){assert.equal(matches(text).length,1);const m=matches(text)[0];assert.equal(text.slice(0,m.index)+'await deps.editorModule()'+text.slice(m.index+m[0].length),'await deps.editorModule()');}
  for(const text of ["await import('../layout-room-editor.mjs?v=x')","await import('./other-layout-room-editor.mjs')","await import('./layout-room-editor.mjs#x')"])assert.equal(matches(text).length,0);
  assert.equal(matches("await import('./layout-room-editor.mjs?v=a');await import('./layout-room-editor.mjs?v=b')").length,2);
});
const rendererSource=consume('layout/layout-renderer.mjs');
await test('renderer-loader-progress-cannot-replace-reserved-outer-identity',()=>{
  const marker='onProgress:detail=>onProgress(';assert.equal(rendererSource.split(marker).length,2);const start=rendererSource.indexOf(marker)+marker.length,end=rendererSource.indexOf('})});',start);assert.ok(end>start);
  const objectExpression=rendererSource.slice(start,end+1),callback=new Function('detail','i','snapshot','p',`return (${objectExpression});`);
  const cases=[[{phase:'poison',index:999,total:999,machineId:'wrong',ratio:.3},.3],[{phase:'wrong',index:-1,total:0,machineId:'wrong',percent:25},.25],[{phase:'wrong',index:-1,total:40,machineId:'wrong',loaded:10},.25],[{total:Infinity,loaded:3,ratio:NaN},0],[undefined,0],[null,0]];
  for(const [detail,ratio]of cases){const event=callback(detail,1,[{},{}],{machineId:'fixture-machine'});assert.equal(event.phase,'loading');assert.equal(event.index,1);assert.equal(event.total,2);assert.equal(event.machineId,'fixture-machine');assert.equal(event.ratio,ratio);}
});
await test('renderer-live-parent-followers-intermediate-reverse-cancel-and-commit-units',async()=>{
  const down=extract(rendererSource,'  function down(event){','\n  function move(event){'),move=extract(rendererSource,'  function move(event){','\n  function up(event){'),up=extract(rendererSource,'  function up(event){','\n  function cancel(event)'),cancel=extract(rendererSource,'  function cancel(event)','\n  // Capture phase chooses object manipulation');
  class V{constructor(x,y,z){this.x=x;this.y=y;this.z=z}clone(){return new V(this.x,this.y,this.z)}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this}}
  const state=S.createDefaultLayout({furniture:[S.createDesk({id:'desk',pose:{xMm:400,zMm:200,yawDeg:37}}),S.createShelf({id:'shelf',pose:{xMm:-1000,zMm:-100,yawDeg:90}})],printers:[
    {id:'desk-child',machineId:'fixture-machine',configurationId:null,attachment:{parentId:'desk',surfaceId:'top',xMm:50,zMm:20,yawDeg:15}},
    {id:'shelf-low',machineId:'fixture-machine',configurationId:null,attachment:{parentId:'shelf',surfaceId:'level-1',xMm:-40,zMm:30,yawDeg:-15}},
    {id:'shelf-high',machineId:'fixture-machine',configurationId:null,attachment:{parentId:'shelf',surfaceId:'level-4',xMm:40,zMm:-30,yawDeg:45}},
    {id:'floor',machineId:'fixture-machine',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:1000,zMm:500,yawDeg:0}}]},cat);
  const factory=new Function('deps',`
    const MM=.001,objects=new Map(),planObjects=new Map(),current=deps.state,derived=deps.derive(current,deps.catalog);let selectedId=null,drag=null,exporting=false,disposed=false,placing=null;
    const canvas={style:{},setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){}},draw=()=>{},hit=()=>deps.hit;
    const rotateHandle={dataset:{}},objectTools={dataset:{}};
    const isPlan=()=>false,updateSelection=()=>{},enableControls=()=>{},onError=e=>{throw e};
    const constrainMove=(proposal,context)=>deps.constrain?deps.constrain(proposal,context,objects):proposal;
    const planePoint=event=>new deps.V(event.worldX,0,event.worldZ);
    function setState(){objects.clear();planObjects.clear();for(const e of [...derived.furniture,...derived.printers]){objects.set(e.id,{position:new deps.V(e.positionM.x,e.positionM.y,e.positionM.z),yaw:e.yawRad});planObjects.set(e.id,{position:new deps.V(e.positionM.x,0,e.positionM.z)});}}
    const onSelect=()=>setState(),onMove=e=>deps.moves.push(e);setState();
    ${down}\n${move}\n${up}\n${cancel}
    return {down,move,up,cancel,objects,planObjects};`);
  const reference=S.deriveScene(state,cat),ref=new Map([...reference.furniture,...reference.printers].map(e=>[e.id,e]));
  const near=(a,b)=>assert.ok(Math.abs(a-b)<=32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)),'Parent-follow arithmetic');
  for(const parentId of ['desk','shelf']){
    const deps={state,catalog:cat,derive:S.deriveScene,V,hit:parentId,moves:[]},r=factory(deps),event={button:0,pointerId:1,clientX:0,clientY:0,worldX:0,worldZ:0,preventDefault(){},stopImmediatePropagation(){}};r.down(event);
    for(const [dx,dz]of [[.1,-.2],[.35,.4],[-.15,-.25]]){
      r.move({...event,clientX:20,worldX:dx,worldZ:dz});
      for(const p of state.printers){const actual=r.objects.get(p.id),old=ref.get(p.id),follows=p.attachment.parentId===parentId;near(actual.position.x,old.positionM.x+(follows?dx:0));near(actual.position.z,old.positionM.z+(follows?dz:0));assert.equal(actual.position.y,old.positionM.y);assert.equal(actual.yaw,old.yawRad);}
    }
    r.cancel();for(const [id,o]of r.objects){const old=ref.get(id);assert.deepEqual([o.position.x,o.position.y,o.position.z],[old.positionM.x,old.positionM.y,old.positionM.z]);}
    r.down(event);r.move({...event,clientX:20,worldX:.2,worldZ:.3});r.up({...event,clientX:20});assert.equal(deps.moves.length,1);
    near(deps.moves[0].x,(ref.get(parentId).positionM.x+.2)*1000);near(deps.moves[0].z,(ref.get(parentId).positionM.z+.3)*1000);
    const committed=S.applyAction(state,{type:'UPDATE_FURNITURE',id:parentId,patch:{pose:{xMm:deps.moves[0].x,zMm:deps.moves[0].z}}},cat);assert.deepEqual(committed.printers,state.printers);
  }
  const pointer={button:0,pointerId:1,clientX:0,clientY:0,worldX:0,worldZ:0,preventDefault(){},stopImmediatePropagation(){}};
  await test('renderer-rejected-preview-does-not-move-roots-or-commit',()=>{
    let calls=0;const deps={state,catalog:cat,derive:S.deriveScene,V,hit:'desk',moves:[],constrain(proposal,context,objects){
      calls++;assert.equal(proposal.id,'desk');assert.deepEqual(context.origin,{x:400,z:200});assert.deepEqual(context.previous,context.origin);
      assert.equal(objects.get('desk').position.x,ref.get('desk').positionM.x);return false;
    }},r=factory(deps);r.down(pointer);r.move({...pointer,clientX:20,worldX:.25,worldZ:.15});
    for(const [id,o]of r.objects){const old=ref.get(id);assert.deepEqual([o.position.x,o.position.y,o.position.z],[old.positionM.x,old.positionM.y,old.positionM.z]);}
    r.up({...pointer,clientX:20});assert.equal(calls,1);assert.deepEqual(deps.moves,[]);
  });
  await test('renderer-cancel-matches-pointer-and-restores-world-and-plan-followers',()=>{
    const deps={state,catalog:cat,derive:S.deriveScene,V,hit:'shelf',moves:[]},r=factory(deps);r.down(pointer);r.move({...pointer,clientX:20,worldX:.2,worldZ:.3});
    const moved=r.objects.get('shelf').position.clone();r.cancel({pointerId:2});assert.deepEqual(r.objects.get('shelf').position,moved);
    r.cancel({pointerId:1});assert.deepEqual(deps.moves,[]);
    for(const [id,o]of r.objects){const old=ref.get(id),plan=r.planObjects.get(id);assert.deepEqual([o.position.x,o.position.y,o.position.z],[old.positionM.x,old.positionM.y,old.positionM.z]);assert.deepEqual([plan.position.x,plan.position.z],[old.positionM.x,old.positionM.z]);}
  });
  await test('renderer-accepted-segment-context-keeps-exact-origin-and-previous',()=>{
    const contexts=[];const deps={state,catalog:cat,derive:S.deriveScene,V,hit:'desk',moves:[],constrain(proposal,context,objects){
      contexts.push(structuredClone(context));near(objects.get('desk').position.x,context.previous.x*.001);near(objects.get('desk').position.z,context.previous.z*.001);return {x:proposal.x,z:proposal.z};
    }},r=factory(deps);r.down(pointer);
    for(const [x,z]of[[.1,-.2],[.35,.4],[-.15,-.25]])r.move({...pointer,clientX:20,worldX:x,worldZ:z});
    assert.equal(contexts.length,3);for(const c of contexts)assert.deepEqual(c.origin,{x:400,z:200});
    assert.deepEqual(contexts[0].previous,{x:400,z:200});near(contexts[1].previous.x,500);near(contexts[1].previous.z,0);near(contexts[2].previous.x,750);near(contexts[2].previous.z,600);
    r.up({...pointer,clientX:20});assert.equal(deps.moves.length,1);near(deps.moves[0].x,250);near(deps.moves[0].z,-50);
  });
});

await test('extreme-aspect-import-grid-bounded-before-Apply-zoom-and-cancel-atomic',async()=>{
  const originalCreate=DOM.doc.createElementNS;let currentLines=0,peakLines=0,frames=0;
  DOM.doc.createElementNS=(ns,tag)=>{
    if(tag==='line'){currentLines++;peakLines=Math.max(peakLines,currentLines);assert.ok(currentLines<=600,'One editor redraw exceeded the 600-line SVG grid budget');}
    const n=originalCreate(ns,tag);
    if(tag==='svg'){const replace=n.replaceChildren.bind(n);n.replaceChildren=(...a)=>{currentLines=0;frames++;return replace(...a)};}
    return n;
  };
  try{
    for(const [w,h]of [[4,1000000],[1000000,4],[1,1000000],[1000000,1]]){
      const raw=[[0,0],[w,0],[w,h],[0,h]],points=raw.map(p=>p.join(',')).join(' ');
      const xml=DOM.element('polygon',{id:'extreme-room',points});DOM.setXML([xml],{viewBox:`0 0 ${w} ${h}`});
      const xmlBefore=JSON.stringify(xml.data),fileText=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><polygon points="${points}"/></svg>`;
      const file=Object.freeze({size:fileText.length,text:async()=>fileText});
      const {engine:a,trace}=engine(emptyInitial),pending=a.act({type:'import-svg',file}),e=await dialogReady(),draft=e.points();
      assert.equal(draft.length,4);assert.equal(e.button(key('apply')).disabled,true);
      const maxZ=Math.max(...draft.map(p=>p[1])),minZ=Math.min(...draft.map(p=>p[1]));
      if(h>w)assert.ok(maxZ-minZ>=1e9,'Counterexample must exercise the actual tall scaled draft');
      for(const deltaY of [1,1,1,1,-1,-1,-1,-1]){e.svg.emit('wheel',{deltaY});assert.ok(currentLines<=600);assert.deepEqual(e.points(),draft,'Grid/zoom changed imported coordinates');}
      e.button(key('fit')).click();assert.ok(currentLines<=600);assert.deepEqual(e.points(),draft);
      e.button('common.close').click();await pending;
      assert.equal(a.getState(),emptyInitial);assert.equal(a.history().past,0);assert.equal(trace.errors.length,0);assert.equal(JSON.stringify(xml.data),xmlBefore);assert.equal(await file.text(),fileText);
    }
    assert.ok(frames>=40);assert.ok(peakLines>0&&peakLines<=600);
  }finally{DOM.doc.createElementNS=originalCreate;}
});

assert.equal(networkCalls,0);
for(const n of DOM.created.filter(n=>n.namespaceURI)){assert.ok(['svg','g','line','polygon','polyline','circle','text'].includes(n.tagName));assert.ok(!Object.entries(n.attributes).some(([name,value])=>/^on/i.test(name)||/href|src/i.test(name)||/url\(|javascript:|https?:/i.test(value)))}
for(const [relative,hash]of consumed)assert.equal(sha(fs.readFileSync(locate(relative))),hash,'Source changed during regression: '+relative);
const report={schema:'layout-svg-room-editor-source-regression-v2',status:'PASS',checks,sourceInputs:Object.fromEntries([...consumed].sort()),networkCalls,editorImportSpecifier:editorMatch[2],
  actualEditorSource:true,actualAppActionCommitBodies:true,actualStateAndParserGeometry:true,DOMAndXMLInterfaceFixtures:true,realBrowserXML:false,WebGL:false,nativeCAD:false,
  scope:'Source/resource contract and actual app/editor action replay with instrumented DOM/XML interfaces. Real browser SVG security, native CTM/pointer/GPU and full default machine assets remain separate required evidence.'};
if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,checks:checks.length,sourceFiles:consumed.size,networkCalls,scope:report.scope}));
