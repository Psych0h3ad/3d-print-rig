// Independent BIQU state/UI sidecar. Run with node --max-old-space-size=384.
// Real layout/app/UI transactions; DOM, storage, preview readiness and view are
// synthetic ports. No CAD/mesh loading, native jobs, GPU pixels or fit claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = name => {const i=process.argv.indexOf(name); if(i<0)return null; assert(process.argv[i+1],`${name} requires a path`); return path.resolve(process.argv[i+1]);};
const site = option('--site') ?? path.join(root, 'site');
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
const files = ['layout-app.mjs','layout-state.mjs','layout-geometry.mjs','layout-constraints.mjs',
  'layout-collision.mjs','layout-placement.mjs','layout-groups.mjs','layout-clipboard.mjs',
  'layout-group-data.mjs','layout-group-labels.mjs','layout-ui.mjs','layout-i18n.mjs',
  'layout-equipment.mjs','layout-equipment-transfer.mjs','layout-equipment-preview.mjs',
  'layout-machine-loader.mjs','layout-renderer.mjs','layout-biqu-popstation.mjs','layout-catalog.json'];
const pin = name => {const p=path.join(site,'layout',name);return fs.existsSync(p)?{bytes:fs.statSync(p).size,sha256:sha(fs.readFileSync(p))}:null;};
const before = Object.fromEntries(files.map(f=>[f,pin(f)]));
const appURL = pathToFileURL(path.join(site,'layout/layout-app.mjs'));
const appSource = fs.readFileSync(appURL,'utf8');
// Use the app's real versioned imports, including its private module identities.
function binding(name) {
  const match=appSource.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`));
  assert(match,`Actual app import missing: ${name}`);return new URL(match[1],appURL);
}
const S = await import(binding('layout-state.mjs'));
const G = await import(binding('layout-groups.mjs'));
const C = await import(binding('layout-clipboard.mjs'));
const P = await import(binding('layout-placement.mjs'));
const {createLayoutUI} = await import(binding('layout-ui.mjs'));
const I = await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const E = await import(binding('layout-equipment.mjs'));
const registry = JSON.parse(fs.readFileSync(path.join(site,'layout/layout-catalog.json'),'utf8'));
const rows = [...registry.machines,...E.equipmentRows].map(r=>({...r,
  widthMm:r.dimensionsMm.width,depthMm:r.dimensionsMm.depth,heightMm:r.dimensionsMm.height}));
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'App catalog IDs must be independent');
const catalog = S.createCatalog(rows);
const TYPE = 'popstation_mini_biqu_v1', SOURCE_ID = 'biqu_popstation_mini_cad_v1';
const DIMS = Object.freeze({widthMm:423.10022712374223,depthMm:478.28293730922826,heightMm:417.40023949665624});
const pose = (xMm=0,zMm=0,yawDeg=0) => ({xMm,zMm,yawDeg});
const clone = value => JSON.parse(JSON.stringify(value));
const encode = state => S.serializeLayout(state,catalog);
const results=[],observations=[],uis=[];
async function test(name,run) {
  try {await run();results.push({name,passed:true});}
  catch(error) {results.push({name,passed:false,error:error.stack??String(error)});}
}
function close(actual,expected,tolerance=1e-7) {assert(Number.isFinite(actual));assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}
function reject(run,label) {assert.throws(run,e=>e?.name==='LayoutValidationError'&&e.errors?.length>0,label);}
function fixed(entity) {assert.equal(entity.type,TYPE);for(const [key,value] of Object.entries(DIMS))assert.equal(entity[key],value,key);}
function cabinet(id='biqu',p=pose()) {assert.equal(typeof S.createBiquPopStation,'function','Missing committed createBiquPopStation interface');return S.createBiquPopStation({id,pose:p});}
function plan({room=S.createRoomRect({widthMm:8000,depthMm:6000}),furniture=[cabinet()],printers=[]}={}) {
  return S.createDefaultLayout({room,furniture,printers},catalog);
}
const floorPrinter=(id='u1',machineId=S.U1_LAYOUT_MACHINE_ID)=>({id,machineId,configurationId:'saved:u1?profile=layout',
  attachment:{parentId:null,surfaceId:'floor',...pose(2000,0,0)}});
function clean(state) {assert.deepEqual(S.validatePlacement(state,catalog),[]);assert.equal(S.validateState(state,catalog).ok,true);}
function finiteTree(value) {if(typeof value==='number')assert(Number.isFinite(value),'Nonfinite scene value');else if(value&&typeof value==='object')for(const v of Object.values(value))finiteTree(v);}
function section(start,end) {const a=appSource.indexOf(start),b=appSource.indexOf(end,a+start.length);assert(a>=0&&b>a,`Actual app section missing: ${start}`);return appSource.slice(a,b);}

// Literal fixture and hashes captured before the source-specific integration.
// Do not derive expected dimensions, support data or bytes from new production.
const legacyFixture={format:'3d-print-rig-layout',version:1,units:'mm',room:{
  polygonMm:[[-3000,-2500],[3000,-2500],[3000,2500],[-3000,2500]],wallHeightMm:2400,appearance:{wall:'paint',floor:'oak'}},
  furniture:[{id:'legacy-pop',type:'popstation_mini',widthMm:422,depthMm:456,heightMm:428,pose:pose(-900,123.125,37.5)}],
  printers:[{id:'legacy-u1',machineId:'snapmaker_u1_layout_reference',configurationId:'saved:u1?profile=layout',
    attachment:{parentId:'legacy-pop',surfaceId:'top',...pose()}}]};
const legacyBytes=JSON.stringify(legacyFixture,null,2);
await test('legacy golden JSON, dimensions and U1 support remain byte-identical',()=>{
  assert.equal(sha(legacyBytes),'79012a139ac7fc6cc6593e68082f79f5deefba283d71905178e70a29861aa662','Literal fixture drift');
  const state=S.parseLayout(legacyBytes,catalog);
  assert.equal(encode(state),legacyBytes);
  assert.deepEqual(S.createPopStation({id:'legacy-pop',pose:pose(-900,123.125,37.5)}),legacyFixture.furniture[0]);
  assert.equal(digest(S.POPSTATION_MINI),'126f73c6640c7ab06884fc1fc5879e6c3d9e38bea3ca58d104aa5a15db1dc7d9');
  assert.equal(digest(S.resolvePrinterEquipment(state,'legacy-u1',catalog)),'7e599137fe7e31b86b51b27a1783800b27f31db97c20d57b561269fb9ef78eae');
  const top=S.getSurface(state,'legacy-pop','top');assert.equal(top.heightMm,417.4);assert.equal(top.fixedMount,true);assert.equal(top.capacity,1);
  assert.equal(S.worldTransform(state,'legacy-u1',catalog).positionM.y,.4174);clean(state);
});

let sourceModule,sourceRecord;
await test('source-specific BIQU module and CAD identity exist independently of legacy',async()=>{
  sourceModule=await import(pathToFileURL(path.join(site,'layout/layout-biqu-popstation.mjs')));
  sourceRecord=sourceModule.BIQU_POPSTATION_CAD;
  assert(sourceRecord,`Missing exported source record ${SOURCE_ID}`);
  assert.equal(sourceRecord.id,SOURCE_ID);assert.equal(sourceRecord.type,TYPE);
  assert.deepEqual(sourceRecord.dimensionsMm,{width:DIMS.widthMm,depth:DIMS.depthMm,height:DIMS.heightMm});
  assert.deepEqual(sourceRecord.rootPivotM,[0,0,0]);assert.deepEqual(sourceRecord.fullScene.normalizationFrame,{units:'m',up:'+Y',front:'+Z',rootPivotM:[0,0,0]});
  assert.equal(sourceRecord.proxy.kind,'manufacturer-cad-source-triangles');assert.equal(sourceRecord.proxy.appendGenericPrinterCues,false);
  assert.equal(sourceRecord.source.sourceInstances,70);assert.equal(sourceRecord.source.sourceDefinitions,30);assert.equal(sourceRecord.source.sourcePartsRemoved,0);
  assert.deepEqual(sourceRecord.source.supportsRemoved,[]);assert.equal(sourceRecord.privateSourceDerived,true);
  assert.equal(E.getLayoutEquipment(SOURCE_ID,'supplied').id,SOURCE_ID);assert(Object.isFrozen(sourceRecord));
  const source=sourceRecord.source,model=sourceRecord.model,preview=sourceRecord.preview;
  for(const receipt of [source,model,preview]){assert.match(receipt.sha256,/^[0-9a-f]{64}$/);assert(receipt.bytes>0);}
  observations.push({sourceSha256:source.sha256,modelSha256:model.sha256,previewSha256:preview.sha256,
    reviewed:'Source metadata and routing only; no private STEP or exported geometry opened.'});
});
await test('BIQU preview discovery follows native layouts/clipboard/groups without downloading or invoking accessors',async()=>{
  assert(sourceModule,'Source module unavailable');const preview=await import(binding('layout-equipment-preview.mjs'));
  const state=plan(),template=C.captureLayoutClipboard(state,['biqu'],catalog),group=G.createGroup(state,{id:'preview-group',name:'BIQU',memberIds:['biqu']},catalog);
  for(const value of [state,{kind:TYPE},{template},group,G.captureGroupTemplate(group,'preview-group',catalog)]){
    assert.equal(sourceModule.needsBiquPreview(value),true);assert.equal(preview.needsEquipmentPreview(value),true);
  }
  assert.equal(sourceModule.needsBiquPreview({type:'popstation_mini'}),false);assert.equal(sourceModule.needsBiquPreview(S.createDefaultLayout()),false);
  const cycle={};cycle.self=cycle;Object.defineProperty(cycle,'trap',{enumerable:true,get(){throw Error('Saved data getter must not execute');}});
  assert.equal(sourceModule.needsBiquPreview(cycle),false);assert.equal(sourceModule.isBiquPreviewPrepared(),false);
  assert.deepEqual(sourceRecord.proxy.parts,[],'State/UI tests must not download or fabricate mesh parts');
});
await test('constructor is fixed-size, detached from caller input and floor normalized',()=>{
  const input=pose(123.125,-234.375,37.5),f=cabinet('biqu',input);fixed(f);
  input.xMm=999;assert.equal(f.pose.xMm,123.125);assert(Object.isFrozen(f));assert(Object.isFrozen(f.pose));
  const state=plan({furniture:[f]}),world=S.worldTransform(state,f.id,catalog);
  fixed(world);assert.equal(world.positionM.y,0);assert.deepEqual(world.verticalRangeMm,[0,DIMS.heightMm]);
  assert.equal(world.positionM.x,.123125);assert.equal(world.positionM.z,-.234375);finiteTree(S.deriveScene(state,catalog));clean(state);
});
await test('all resize routes reject exact-source dimension tampering atomically',()=>{
  const state=plan(),saved=encode(state);
  for(const key of Object.keys(DIMS))for(const value of [30,DIMS[key]-.001,DIMS[key]+.001,S.LIMITS.maxDimensionMm]){
    reject(()=>S.applyAction(state,{type:'UPDATE_FURNITURE',id:'biqu',patch:{[key]:value}},catalog),key);
    const hostile=clone(state);hostile.furniture[0][key]=value;
    assert.equal(S.validateState(hostile,catalog).ok,false);reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));
    const destination=S.createDefaultLayout({},catalog);
    const result=P.proposePlacement(destination,{kind:TYPE,id:'bad-copy',copy:hostile.furniture[0],xMm:0,zMm:0,yawDeg:0,snapMm:0},catalog);
    assert.equal(result.valid,false);assert.equal(result.state,null);
  }
  for(const [key,value] of Object.entries(DIMS))assert.equal(encode(S.applyAction(state,{type:'UPDATE_FURNITURE',id:'biqu',patch:{[key]:value}},catalog)),saved);
  assert.equal(encode(state),saved);
});
await test('BIQU publishes no attachable surface or generic rectangular top',()=>{
  const state=plan(),scene=S.deriveScene(state,catalog),world=scene.furniture[0];
  assert.equal(scene.surfaces.filter(s=>s.parentId==='biqu').length,0);
  assert.deepEqual(world.boards,[],'Finite cutout deck must not become a full support/picking board');
  for(const id of ['top','floor','level-1'])reject(()=>S.getSurface(state,'biqu',id));
  assert.equal(state.printers.length,0);assert.equal(scene.printers.length,0,'No invented printer/spool inventory');
});
await test('U1 and ordinary printer malicious attachments fail through every state/clipboard ingress',()=>{
  const ordinary=registry.machines[0].id;
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,ordinary]){
    const state=plan({printers:[floorPrinter('printer',machineId)]}),saved=encode(state);
    for(const surfaceId of ['top','floor','level-1']){
      const attachment={parentId:'biqu',surfaceId,...pose()};
      reject(()=>S.applyAction(state,{type:'SET_ATTACHMENT',id:'printer',attachment},catalog));
      reject(()=>S.applyAction(state,{type:'UPDATE_PRINTER',id:'printer',patch:{attachment}},catalog));
      reject(()=>S.applyAction(plan(),{type:'ADD_PRINTER',printer:{...floorPrinter('injected',machineId),attachment}},catalog));
      const hostile=clone(state);hostile.printers[0].attachment=attachment;
      assert.equal(S.validateState(hostile,catalog).ok,false);reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));
      const template={format:'3d-print-rig-layout-set',version:1,name:'Hostile attachment',furniture:clone(state.furniture),printers:[{...floorPrinter('injected',machineId),attachment}]};
      reject(()=>C.decodeLayoutClipboard(JSON.stringify(template),catalog));
      reject(()=>G.instantiateGroupTemplate(S.createDefaultLayout({},catalog),template,{id:'injected-set',...pose()},catalog));
      const proposed=P.proposePlacement(state,{kind:'printer',id:'injected',machineId,parentId:'biqu',surfaceId,xMm:0,zMm:0,yawDeg:0,snapMm:0},catalog);
      assert.equal(proposed.valid,false);assert.equal(proposed.state,null);
    }
    assert.equal(encode(state),saved);
  }
});
await test('legacy and source-specific cabinets coexist without migration or U1 variant contamination',()=>{
  const legacy=S.parseLayout(legacyBytes,catalog),state=S.applyAction(legacy,{type:'ADD_FURNITURE',furniture:cabinet('biqu',pose(1500,-600,-90))},catalog);
  clean(state);assert.deepEqual(state.furniture[0],legacyFixture.furniture[0]);assert.deepEqual(state.printers,legacyFixture.printers);
  assert.equal(digest(S.resolvePrinterEquipment(state,'legacy-u1',catalog)),'7e599137fe7e31b86b51b27a1783800b27f31db97c20d57b561269fb9ef78eae');
  assert.equal(encode(S.parseLayout(encode(state),catalog)),encode(state));
  assert.equal(encode(S.applyAction(state,{type:'REMOVE_FURNITURE',id:'biqu'},catalog)),legacyBytes);
});

await test('coordinate/yaw minimum maximum intermediate reversed and nonnormal values preserve exact state',()=>{
  for(const p of [pose(-S.LIMITS.maxCoordinateMm,-S.LIMITS.maxCoordinateMm,-S.LIMITS.maxYawDeg),
    pose(S.LIMITS.maxCoordinateMm,S.LIMITS.maxCoordinateMm,S.LIMITS.maxYawDeg),pose(123.125,-234.375,37.5),pose(0,0,450),pose(0,0,-810)]){
    const state=plan({furniture:[cabinet('biqu',p)]});fixed(state.furniture[0]);assert.deepEqual(state.furniture[0].pose,p);
    assert.equal(encode(S.parseLayout(encode(state),catalog)),encode(state));finiteTree(S.deriveScene(state,catalog));
  }
  const state=plan(),saved=encode(state);let next=state;
  for(const p of [pose(-1200,0,0),pose(1200,0,0),pose(0,-1200,0),pose(0,1200,0),pose(123.125,-234.375,0),pose()]){
    next=S.applyWorldMove(next,{id:'biqu',xMm:p.xMm,zMm:p.zMm},catalog,{snapMm:0});clean(next);fixed(next.furniture[0]);
  }
  assert.equal(encode(next),saved);
  for(const patch of [{pose:pose(NaN,0,0)},{pose:pose(0,Infinity,0)},{pose:pose(0,0,S.LIMITS.maxYawDeg+1)}])reject(()=>S.applyAction(state,{type:'UPDATE_FURNITURE',id:'biqu',patch},catalog));
});
for(const yawDeg of [0,90,180,270,-90,37.5,450,-810])await test(`planning footprint and wall fitting at ${yawDeg} degrees`,()=>{
  const radians=yawDeg*Math.PI/180,halfX=(Math.abs(Math.cos(radians))*DIMS.widthMm+Math.abs(Math.sin(radians))*DIMS.depthMm)/2,
    halfZ=(Math.abs(Math.sin(radians))*DIMS.widthMm+Math.abs(Math.cos(radians))*DIMS.depthMm)/2;
  const room=S.createRoomRect({widthMm:2400,depthMm:2200}),initial=plan({room,furniture:[cabinet('biqu',pose(0,0,yawDeg))]});
  const origin=encode(initial);let state=initial;
  for(const target of [{x:9999,z:0},{x:-9999,z:0},{x:0,z:9999},{x:0,z:-9999},{x:9999,z:9999}]){
    const result=S.resolveWorldMove(state,{id:'biqu',...target},catalog,{snapMm:0});assert(result?.state);assert.equal(result.boundaryLimited,true);
    state=result.state;clean(state);fixed(state.furniture[0]);const p=state.furniture[0].pose;
    assert(Math.abs(p.xMm)<=1200-halfX+1e-6);assert(Math.abs(p.zMm)<=1100-halfZ+1e-6);
    if(target.x&&target.z===0)close(p.xMm,Math.sign(target.x)*(1200-halfX));
    if(target.z&&target.x===0)close(p.zMm,Math.sign(target.z)*(1100-halfZ));
    const back=S.resolveWorldMove(state,{id:'biqu',x:0,z:0},catalog,{snapMm:0});assert(back?.state);state=back.state;assert.equal(encode(state),origin);
  }
  const outside=clone(initial);outside.furniture[0].pose.xMm=1200-halfX+.01;
  assert(S.validatePlacement(outside,catalog).some(e=>e.code==='ROOM_OUT_OF_BOUNDS'&&e.entityIds.includes('biqu')));
});
await test('free and wall-assisted cardinal/intermediate/reversed rotations retain dimensions and source datum',()=>{
  const initial=plan({furniture:[cabinet('biqu',pose(100.25,-200.125,37.5))]}),saved=encode(initial);let state=initial;
  for(const yawDeg of [127.5,217.5,307.5,397.5,37.5,-52.5,37.5]){
    const result=S.resolveWorldRotation(state,{id:'biqu',yawDeg},catalog,{snapDeg:0});assert(result?.state);close(result.yawDeg,yawDeg);
    state=result.state;fixed(state.furniture[0]);clean(state);
  }
  assert.equal(encode(state),saved);
  const room=S.createRoomRect({widthMm:1200,depthMm:1200}),edge=plan({room,furniture:[cabinet('biqu',pose(600-DIMS.widthMm/2,0,0))]});
  const turn=S.resolveWorldRotation(edge,{id:'biqu',yawDeg:90},catalog,{snapDeg:0});assert(turn?.state);assert.equal(turn.yawDeg,90);clean(turn.state);
  const back=S.resolveWorldRotation(turn.state,{id:'biqu',yawDeg:0},catalog,{snapDeg:0,anchorPointMm:{xMm:edge.furniture[0].pose.xMm,zMm:0}});
  assert(back?.state);assert.equal(encode(back.state),encode(edge));
});
await test('room/furniture/printer collision rejects occupied and undersized destinations',()=>{
  const state=plan({furniture:[cabinet(),S.createDesk({id:'desk',widthMm:600,depthMm:700,pose:pose(1300)})],printers:[{...floorPrinter(),attachment:{parentId:null,surfaceId:'floor',...pose(2800)}}]});
  clean(state);const saved=encode(state);
  for(const xMm of [1300,2800])reject(()=>S.applyWorldMove(state,{id:'biqu',xMm,zMm:0},catalog,{snapMm:0}));
  reject(()=>S.applyAction(state,{type:'SET_ROOM',room:S.createRoomRect({widthMm:DIMS.widthMm-1,depthMm:DIMS.depthMm-1})},catalog));
  const floor=S.createDefaultLayout({},catalog),placed=P.proposePlacement(floor,{kind:TYPE,id:'fresh',xMm:0,zMm:0,yawDeg:0,snapMm:0},catalog);
  assert.equal(placed.valid,true);fixed(placed.state.furniture[0]);
  for(const request of [{xMm:0,zMm:0},{xMm:1300,zMm:0},{xMm:9999,zMm:0}]){
    const result=P.proposePlacement(state,{kind:TYPE,id:'blocked',...request,yawDeg:0,snapMm:0},catalog);assert.equal(result.valid,false);assert.equal(result.state,null);
    assert(result.issues.some(e=>['ENVELOPE_OVERLAP','ROOM_OUT_OF_BOUNDS'].includes(e.code)));
  }
  assert.equal(encode(state),saved);
});
await test('clipboard and duplicate placements allocate independent IDs and detached storage',()=>{
  const source=plan({furniture:[cabinet('source',pose(123.125,-234.375,37.5))]}),saved=encode(source);
  const captured=C.captureLayoutClipboard(source,['source'],catalog,{name:'BIQU set'}),text=C.encodeLayoutClipboard(captured,catalog),template=C.decodeLayoutClipboard(text,catalog);
  assert.equal(template.printers.length,0);fixed(template.furniture[0]);
  let destination=S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000})},catalog);
  destination=G.instantiateGroupTemplate(destination,template,{id:'copy-a',...pose(-1500,0,90)},catalog);
  destination=G.instantiateGroupTemplate(destination,template,{id:'copy-b',...pose(1500,0,-90)},catalog);clean(destination);
  const ids=[...destination.furniture,...destination.groups].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);assert(!ids.includes('source'));
  for(const f of destination.furniture)fixed(f);const beforeCopy=encode(destination);
  template.furniture[0].pose.xMm=999;captured.furniture[0].pose.zMm=888;
  assert.equal(encode(destination),beforeCopy);assert.equal(encode(source),saved);
  const moved=G.transformGroup(destination,'copy-a',{xMm:-1300},catalog);assert.deepEqual(moved.furniture[1],destination.furniture[1]);
  const duplicated=P.proposePlacement(source,{kind:TYPE,id:'direct-copy',copy:source.furniture[0],xMm:1800,zMm:500,yawDeg:-810,snapMm:0},catalog);
  assert.equal(duplicated.valid,true);assert.equal(duplicated.state.furniture[1].id,'direct-copy');fixed(duplicated.state.furniture[1]);
  assert.deepEqual(duplicated.state.furniture[0],source.furniture[0]);
});
await test('group/regroup/ungroup/save-load preserve BIQU roots and exact reversed transforms',()=>{
  const initial=plan({furniture:[cabinet('one',pose(-800,0,37.5)),cabinet('two',pose(800,0,-90)),S.createDesk({id:'bench',pose:pose(0,1500)})]});
  let state=G.createGroup(initial,{id:'original-set',name:'BIQU pair',memberIds:['one','two']},catalog),saved=encode(state);
  const origin={...state.groups[0].pose};state=G.transformGroup(state,'original-set',{xMm:100,zMm:-200,yawDeg:37.5},catalog);clean(state);
  state=S.parseLayout(encode(state),catalog);state=G.transformGroup(state,'original-set',origin,catalog);assert.equal(encode(state),saved);
  const roots=JSON.stringify(state.furniture);
  state=C.regroupLayoutSelection(state,{id:'regrouped',name:'Cabinet and bench',selectionIds:['one','bench']},catalog);
  assert.equal(JSON.stringify(state.furniture),roots);assert.deepEqual(G.groupEntityIds(state,'original-set'),['two']);
  assert.deepEqual(G.groupEntityIds(state,'regrouped'),['one','bench']);
  const template=G.captureGroupTemplate(state,'regrouped',catalog);assert.equal(template.furniture.filter(f=>f.type===TYPE).length,1);assert.equal(template.printers.length,0);
  state=G.ungroup(state,'regrouped',catalog);assert.equal(JSON.stringify(state.furniture),roots);assert.equal(encode(S.parseLayout(encode(state),catalog)),encode(state));
});
await test('room palette A-to-B-to-A leaves cabinet identity and source material metadata untouched',()=>{
  assert(sourceRecord,'Source record unavailable');const sourceBytes=JSON.stringify(sourceRecord),initial=plan(),saved=encode(initial);
  let state=S.applyAction(initial,{type:'SET_ROOM',room:{...initial.room,appearance:{wall:'stripe',floor:'tile'}}},catalog);
  assert.deepEqual(state.furniture,initial.furniture);assert.deepEqual(S.deriveScene(state,catalog).furniture,S.deriveScene(initial,catalog).furniture);
  state=S.applyAction(state,{type:'SET_ROOM',room:initial.room},catalog);assert.equal(encode(state),saved);assert.equal(JSON.stringify(sourceRecord),sourceBytes);
});

function uiFixture(initial,selected='biqu',onAction,language='en') {
  const document=new TestDocument(),container=document.createElement('aside'),actions=[];document.body.append(container);
  const ui=createLayoutUI({container,catalog:rows,t:I.createLayoutTranslator(language),onAction:action=>{actions.push(clone(action));return onAction?.(action);}});
  uis.push(ui);ui.update(initial,selected);
  const find=selector=>{const n=container.querySelector(selector);assert(n,`Missing UI control ${selector}`);return n;};
  return {ui,document,container,actions,find,command:key=>find(`[data-layout-command="${key}"]`),field:key=>find(`[data-layout-field="${key}"]`),
    change(node,value){node.value=String(value);node.dispatch('input');node.dispatch('change');}};
}
await test('ordinary add button uses committed label/action in every supported language',()=>{
  for(const language of I.supportedLanguages){
    const t=I.createLayoutTranslator(language),r=uiFixture(S.createDefaultLayout({},catalog),null,undefined,language),b=r.command('layout.addBiquPopStation');
    assert.equal(b.tagName,'BUTTON');assert(b.className.split(/\s+/).includes('layout-button-label'));
    assert.notEqual(t('layout.addBiquPopStation'),'layout.addBiquPopStation');assert.equal(b.getAttribute('aria-label'),t('layout.addBiquPopStation'));
    assert(!/\p{Extended_Pictographic}/u.test(b.textContent),'No emoji UI icon');b.click();assert.deepEqual(r.actions,[{type:'add',kind:TYPE}]);
    r.ui.setStatus({busy:true});b.click();assert.equal(r.actions.length,1);r.ui.setStatus({busy:false});
    r.ui.dispose();
  }
});
await test('BIQU editor exposes pose, quarter-turn and lifecycle controls without dimension resizing',()=>{
  const state=plan(),saved=encode(state),r=uiFixture(state);
  for(const key of ['widthMm','depthMm','heightMm','topThicknessMm','boardThicknessMm','support']){
    const control=r.container.querySelector(`[data-layout-field="${key}"]`);assert(!control||control.disabled||control.readOnly,`Editable fixed-source ${key}`);
  }
  r.change(r.field('xMm'),123.125);r.change(r.field('zMm'),-234.375);r.change(r.field('yawDeg'),-810);
  r.command('layout.rotateRight').click();r.command('layout.rotateLeft').click();r.command('layout.duplicate').click();r.command('layout.delete').click();
  assert.deepEqual(r.actions,[{type:'UPDATE_FURNITURE',id:'biqu',patch:{pose:{xMm:123.125}}},{type:'UPDATE_FURNITURE',id:'biqu',patch:{pose:{zMm:-234.375}}},
    {type:'UPDATE_FURNITURE',id:'biqu',patch:{pose:{yawDeg:-810}}},{type:'rotate-world',id:'biqu',deltaDeg:90},{type:'rotate-world',id:'biqu',deltaDeg:-90},
    {type:'duplicate',id:'biqu'},{type:'delete',id:'biqu',detachChildren:false}]);assert.equal(encode(state),saved);
  assert(r.find('[data-layout-group-member="biqu"]'),'BIQU must remain a furniture grouping root');
});
await test('support chooser excludes BIQU while retaining legacy U1-only top and normal desks',()=>{
  const state=plan({furniture:[cabinet(),S.createPopStation({id:'legacy',pose:pose(-1200)}),S.createDesk({id:'desk',pose:pose(0,1800)})],printers:[floorPrinter()]});
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,registry.machines[0].id]){
    const current={...state,printers:[floorPrinter('u1',machineId)]},r=uiFixture(current,'u1'),options=r.field('support').options.map(o=>JSON.parse(o.value));
    assert(options.some(([id,surface])=>id===null&&surface==='floor'));assert(options.some(([id,surface])=>id==='desk'&&surface==='top'));
    assert(!options.some(([id])=>id==='biqu'));assert.equal(options.some(([id])=>id==='legacy'),machineId===S.U1_LAYOUT_MACHINE_ID);
  }
});
await test('UI selection A-to-B-to-A/save-load/reset and locale changes keep exact BIQU pose',()=>{
  const initial=plan({furniture:[cabinet('biqu',pose(123.125,-234.375,37.5)),S.createDesk({id:'desk',pose:pose(1800)})]}),saved=encode(initial),r=uiFixture(initial);
  for(const language of I.supportedLanguages){r.ui.setLocale(I.createLayoutTranslator(language));r.ui.update(initial,'desk');r.ui.update(S.parseLayout(saved,catalog),'biqu');
    assert.equal(r.field('xMm').value,'123.1');assert.equal(r.field('zMm').value,'-234.4');assert.equal(r.field('yawDeg').value,'37.5');
    for(const key of ['xMm','zMm','yawDeg']){r.field(key).focus();r.field(key).blur();r.field(key).dispatch('change');}}
  assert.deepEqual(r.actions,[]);r.ui.update(S.createDefaultLayout({},catalog),null);assert.equal(r.container.querySelector('[data-layout-entity="biqu"]'),null);
  r.ui.update(initial,'biqu');assert.equal(r.field('yawDeg').value,'37.5');assert.equal(encode(initial),saved);
});

// Execute unchanged current app sections. Only external I/O and view/preview
// readiness are ports; placement, commit/history, state, groups and UI are real.
function appFixture(initial) {
  const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p'),canvas=document.createElement('canvas');
  status.id='layout-status';document.body.append(status,container,canvas);
  const writes=[],downloads=[],views=[],placements=[],messages=[];
  const factory=new Function('deps',`"use strict";
    const {document,container,canvas,localStorage,catalog,rows,t,createLayoutUI,needsEquipmentPreview,isLayoutEquipmentPreviewPrepared,
      createBiquPopStation,createPopStation,createDesk,createShelf,createDefaultLayout,applyAction,applyWorldMove,worldTransform,validatePlacement,serializeLayout,parseLayout,
      resolveWorldRotation,resolveSupportedPrinterRotation,resolveGroupRotation,transformGroup,renameGroup,ungroup,removeGroup,
      captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard,regroupLayoutSelection,groupTemplateInfo,proposePlacement,proposeGroupPlacement}=deps;
    let state=deps.initial,selected='biqu',ui,placement=null,lastPlacementTarget=null,busy=false,roomEditing=false,disposed=false,operation=null,
      interactionGeneration=0,nextId=1,groupLibrary=[],clipboardText='',pendingRotation=null,discreteRotation=null;
    const past=[],future=[],view={canvas,setState(){},setPlacement:p=>deps.placements.push(p),
      cancelOpening(){},setOpeningSelection(){},refreshPlacement:()=>true,view:mode=>deps.views.push(mode)};
    const $=selector=>document.body.querySelector(selector),storageKey='3d-print-rig-layout-v2',legacyStorageKey='3d-print-rig-layout-v1',maxFileBytes=2*1024*1024;
    const message=(value,error=false)=>deps.messages.push({text:typeof value==='function'?value():value,error}),humanError=e=>e.message;
    const ensureEquipmentPreview=async()=>true,updatePlacementBar=()=>{},download=(blob,name)=>deps.downloads.push({blob,name});
    ${section('const id=prefix=>','const t=')}
    ${section('function store(){','function message(')}
    ${section('function sync(){','function selectOpening(')}
    ${section('function selectionIds(){','async function readClipboardSelection(')}
    ${section('function cancelPlacement(){','function download(')}
    ${section('function worldRotate(','async function render(')}
    ${section('async function act(action){','function updateViewPresentation(')}
    ui=createLayoutUI({container,catalog:rows,t,onAction:act});sync();
    return {act,ui,select,previewPlacement,placeProposal,beginPlacement,pasteSelection,copySelection,worldRotate,
      state:()=>state,placement:()=>placement,history:()=>({past:past.length,future:future.length}),selected:()=>selected};`);
  const engine=factory({...S,...G,...C,...P,createLayoutUI,catalog,rows,initial,document,container,canvas,
    t:I.createLayoutTranslator('en'),localStorage:{setItem:(key,value)=>writes.push({key,value}),getItem:()=>null},
    needsEquipmentPreview:()=>false,isLayoutEquipmentPreviewPrepared:()=>true,writes,downloads,views,placements,messages});
  uis.push(engine.ui);return {...engine,document,container,writes,downloads,views,placements,messages};
}
await test('actual app add/duplicate/paste placement uses BIQU size, new IDs and real commits',async()=>{
  const r=appFixture(S.createDefaultLayout({},catalog));await r.act({type:'add',kind:TYPE});
  let spec=r.placement();assert.equal(spec.kind,TYPE);assert.deepEqual(spec.sizeMm,{width:DIMS.widthMm,depth:DIMS.depthMm,height:DIMS.heightMm});
  let proposal=r.previewPlacement({xMm:-1200,zMm:0,yawDeg:0,altKey:true});assert.equal(proposal.valid,true);r.placeProposal(proposal);
  const first=r.state().furniture[0];fixed(first);r.select(first.id);await r.act({type:'duplicate',id:first.id});
  assert.equal(r.placement().kind,TYPE);assert.notEqual(r.placement().id,first.id);
  proposal=r.previewPlacement({xMm:1200,zMm:0,yawDeg:90,altKey:true});assert.equal(proposal.valid,true);r.placeProposal(proposal);
  r.copySelection([first.id]);r.pasteSelection();assert.equal(r.placement().kind,TYPE);
  proposal=r.previewPlacement({xMm:0,zMm:1000,yawDeg:-90,altKey:true});assert.equal(proposal.valid,true);r.placeProposal(proposal);
  assert.equal(r.state().furniture.length,3);assert.equal(new Set(r.state().furniture.map(f=>f.id)).size,3);
  for(const f of r.state().furniture)fixed(f);clean(r.state());assert.equal(r.history().past,3);assert.equal(r.writes.length,3);
  assert.equal(r.messages.filter(m=>m.error).length,0);
});
await test('actual app printer add with BIQU selected starts on floor, never on an invented top',async()=>{
  const actual=[];
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,registry.machines[0].id]){
    const r=appFixture(plan());r.select('biqu');await r.act({type:'add',kind:'printer',machineId});
    const spec=r.placement(),proposal=r.previewPlacement({xMm:2000,zMm:0,yawDeg:0,altKey:true});
    actual.push({machineId,parentId:spec.parentId,surfaceId:spec.surfaceId,valid:proposal.valid,issues:proposal.issues.map(i=>i.code)});
    if(proposal.valid){r.placeProposal(proposal);assert.equal(r.state().printers[0].attachment.parentId,null);clean(r.state());}
  }
  observations.push({case:'printer add with BIQU selected',actual});
  assert.deepEqual(actual,actual.map(({machineId})=>({machineId,parentId:null,surfaceId:'floor',valid:true,issues:[]})),
    'A cabinet with unqualified contact must not be chosen as a printer support');
});
await test('cabinet-only UI enables detailed image export and real export inventory uses exact source ID',()=>{
  const state=plan(),r=uiFixture(state),render=r.command('render');assert.equal(render.disabled,false);
  render.click();assert.deepEqual(r.actions,[{type:'render'}]);
  const renderer=fs.readFileSync(path.join(site,'layout/layout-renderer.mjs'),'utf8');
  // Execute the current production inventory statement, not a reimplementation
  // of its cabinet filter. This only proves admission into streamed export.
  const inventoryLines=renderer.split(/\r?\n/).filter(line=>/^\s*const snapshot=/.test(line));
  assert.equal(inventoryLines.length,1,'One actual streamed-image inventory');
  const inventory=Function('derived',`${inventoryLines[0]} return snapshot;`)(S.deriveScene(state,catalog));
  assert.equal(inventory.length,1);assert.equal(inventory[0].id,'biqu');assert.equal(inventory[0].machineId,SOURCE_ID);
  assert.equal(inventory[0].equipmentVariant,'supplied');assert.equal(inventory[0].positionM.y,0);fixed(inventory[0]);
  const row=E.getLayoutEquipment(inventory[0].machineId,inventory[0].equipmentVariant);assert.equal(row.id,SOURCE_ID);
  assert.equal(row.proxy.appendGenericPrinterCues,false);assert.equal(row.model.sha256,sourceRecord.model.sha256);
  inventory[0].positionM.x=999;assert.equal(S.worldTransform(state,'biqu',catalog).positionM.x,0);
  observations.push({case:'detailed image export inventory',machineId:SOURCE_ID,entries:inventory.length,
    scope:'Actual inventory expression and equipment resolution; streaming, GPU pixels and actual geometry remain separate gates.'});
});
await test('actual app rejects injected attachment/resize without history, then exports/imports/reset/undo',async()=>{
  const initial=plan({printers:[floorPrinter()]}),saved=encode(initial),r=appFixture(initial);
  await r.act({type:'SET_ATTACHMENT',id:'u1',attachment:{parentId:'biqu',surfaceId:'top',...pose()}});
  await r.act({type:'UPDATE_FURNITURE',id:'biqu',patch:{widthMm:999}});
  assert.equal(encode(r.state()),saved);assert.deepEqual(r.history(),{past:0,future:0});assert.equal(r.writes.length,0);assert.equal(r.messages.filter(m=>m.error).length,2);
  await r.act({type:'export'});assert.equal(await r.downloads[0].blob.text(),saved);
  await r.act({type:'reset'});assert.equal(r.state().furniture.length,0);await r.act({type:'undo'});assert.equal(encode(r.state()),saved);
  await r.act({type:'redo'});assert.equal(r.state().furniture.length,0);
  await r.act({type:'import',file:{size:Buffer.byteLength(saved),text:async()=>saved}});assert.equal(encode(r.state()),saved);
  await r.act({type:'UPDATE_FURNITURE',id:'biqu',patch:{pose:{xMm:123.125}}});
  assert.equal(r.state().furniture[0].pose.xMm,123.125);fixed(r.state().furniture[0]);
  await r.act({type:'rotate-world',id:'biqu',deltaDeg:90});await r.act({type:'rotate-world',id:'biqu',deltaDeg:-90});assert.equal(r.state().furniture[0].pose.yawDeg,0);
});

for(const ui of uis)ui.dispose();
await test('all inspected production inputs remained unchanged during this run',()=>{
  assert.deepEqual(Object.fromEntries(files.map(f=>[f,pin(f)])),before,'Parent edits during a run invalidate this report; rerun against stable files');
});
const report={status:results.every(r=>r.passed)?'PASS':'FAIL',cases:results.length,failures:results.filter(r=>!r.passed),results,
  sourceInputs:before,test:{sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))},
  identity:{furnitureType:TYPE,sourceId:SOURCE_ID,dimensionsMm:DIMS},registeredMachineCount:registry.machines.length,
  observations,limits:{nativeJobs:0,mathWorkers:0,concurrentTests:1,nodeHeapRequestedMiB:384},
  scope:'Real layout-state, clipboard/group/placement and UI modules plus unchanged app transaction bodies. Synthetic DOM/storage/preview-ready/view ports. No CAD or exported asset loading, source-solid contact, GPU/browser pixels, full startup or complete-machine fit coverage. Room finish reversal checks state/source metadata only; rendered source materials and detailed image export remain separate asset/browser gates.'};
const output=option('--report');if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:results.length,failures:report.failures.map(r=>({name:r.name,error:r.error.split('\n')[0]})),registeredMachineCount:registry.machines.length,scope:report.scope}));
if(report.failures.length)process.exitCode=1;
