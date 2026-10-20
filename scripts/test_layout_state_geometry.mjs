// Independent state/geometry oracles and actual registered catalog bindings.
// Source/fixtures only: no model imports, network, WebGL or native fit claim.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const R=path.dirname(fileURLToPath(import.meta.url));
const option=process.argv.indexOf('--site'),site=option>=0?path.resolve(process.argv[option+1]):path.resolve(R,'../site');
const src=path.join(site,'layout'),catalogFile=path.join(src,'layout-catalog.json');
const pin=p=>({bytes:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});
const inputPaths=['layout-state.mjs','layout-geometry.mjs','layout-catalog.json','layout-constraints.mjs','layout-app.mjs'].map(n=>path.join(src,n));
const indexFile=path.join(site,'assets/machines/index.json');inputPaths.push(indexFile);
const before=new Map(inputPaths.map(p=>[p,pin(p)]));
const S=await import(pathToFileURL(path.join(src,'layout-state.mjs'))),G=await import(pathToFileURL(path.join(src,'layout-geometry.mjs')));
const registered=JSON.parse(fs.readFileSync(indexFile,'utf8'));
const raw=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
const entries=raw.machines.map(m=>({...m,widthMm:m.dimensionsMm.width,depthMm:m.dimensionsMm.depth,heightMm:m.dimensionsMm.height}));
const catalog=S.createCatalog(entries);
const fixture=[{id:'fixture600',widthMm:600,depthMm:400,heightMm:450,baseOffsetMm:25},
 {id:'fixture200',widthMm:200,depthMm:100,heightMm:200}];
const p=(id='p1',machineId='fixture600',attachment={parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0})=>({id,machineId,configurationId:null,attachment});
const clone=x=>structuredClone(x),cases=[],failures=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-9,`${a} != ${b} (mm mathematical output only; not CAD fit tolerance)`);
async function test(id,run){try{await run();cases.push({id,status:'PASS'})}catch(e){const f={id,status:'FAIL',error:e.message};cases.push(f);failures.push(f)}}
function throwsCode(run,code){assert.throws(run,e=>e instanceof S.LayoutValidationError&&e.errors.some(x=>x.code===code))}
const small=()=>S.createDefaultLayout({},fixture);

await test('room-concavity-all-four-corners-inside-is-insufficient',()=>{
 const room=[[0,0],[6000,0],[6000,6000],[4000,6000],[4000,2000],[2000,2000],[2000,6000],[0,6000]];
 const inner=[[1000,1000],[5000,1000],[5000,5000],[1000,5000]];
 assert.ok(inner.every(p=>G.pointInPolygon(p,room)>0));assert.equal(G.polygonContains(room,inner),false);
 assert.equal(G.polygonContains([...room].reverse(),inner),false);
});
await test('simple-polygon-self-cross-touch-backtrack-rejected',()=>{
 for(const polygon of [ [[0,0],[1000,1000],[0,1000],[1000,0]],
   [[0,0],[1000,0],[1000,1000],[500,0],[0,1000]], [[0,0],[1000,0],[500,0],[1000,1000],[0,1000]],
   [[0,0],[1000,0],[1000,1000],[0,0]], [[0,0],[1,1],[2,2]] ]){
   assert.throws(()=>S.createRoomPolygon({polygonMm:polygon}),S.LayoutValidationError);
 }
});
await test('independent-integer-orientation-1000-controls',()=>{
 let seed=73489;const next=()=>{seed=(seed*48271)%2147483647;return seed%2000001-1000000};
 for(let i=0;i<1000;i++){
  const a=[next(),next()],b=[next(),next()],c=[next(),next()];
  const det=(BigInt(b[0])-BigInt(a[0]))*(BigInt(c[1])-BigInt(a[1]))-(BigInt(b[1])-BigInt(a[1]))*(BigInt(c[0])-BigInt(a[0]));
  assert.equal(G.orient(a,b,c),det<0n?-1:det>0n?1:0);
 }
});
await test('rotated-footprint-corners-and-tangent-overlap',()=>{
 const desk=G.rectangle(1000,600),printer=G.transformPolygon(G.rectangle(600,400),{xMm:0,zMm:0,yawDeg:45});
 assert.equal(G.pointInPolygon([0,0],desk),1);assert.equal(G.polygonContains(desk,printer),false);
 assert.equal(G.polygonsOverlap(G.rectangle(100,100),G.transformPolygon(G.rectangle(100,100),{xMm:100,zMm:0,yawDeg:0})),false);
 assert.equal(G.polygonsOverlap(G.rectangle(100,100),G.transformPolygon(G.rectangle(100,100),{xMm:99,zMm:0,yawDeg:0})),true);
 assert.deepEqual(G.rotateXZ([123,456],90),[456,-123]);assert.deepEqual(G.rotateXZ([123,456],-90),[-456,123]);
});
let anchored;
await test('parent-local-transform-and-independent-base-offset',()=>{
 anchored=S.createDefaultLayout({room:S.createRoomRect({widthMm:100000,depthMm:100000}),furniture:[S.createDesk({depthMm:900,pose:{xMm:1000,zMm:2000,yawDeg:90}})],
  printers:[p('p1','fixture600',{parentId:'desk-1',surfaceId:'top',xMm:100,zMm:50,yawDeg:15})]},fixture);
 const a=S.worldTransform(anchored,'p1',fixture);
 assert.equal(a.xMm,1050);assert.equal(a.zMm,1900);assert.equal(a.yawDeg,105);assert.equal(a.supportYM,.75);assert.equal(a.positionM.y,.775);
 assert.equal(a.verticalRangeMm[0],750);assert.equal(a.verticalRangeMm[1],1200);
});
await test('parent-min-max-mid-reversed-and-ABA-no-double-transform',()=>{
 const before=S.serializeLayout(anchored,fixture);let value=anchored;
 for(const [x,z,yaw] of [[-48000,-48000,-360000],[48000,48000,360000],[500,-750,180],[0,0,-90],[1000,2000,90]]){
  value=S.applyAction(value,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{xMm:x,zMm:z,yawDeg:yaw}}},fixture);
  assert.deepEqual(value.printers[0].attachment,anchored.printers[0].attachment);
  const world=S.worldTransform(value,'p1',fixture),local=G.rotateXZ([100,50],yaw);
  near(world.xMm,x+local[0]);near(world.zMm,z+local[1]);
 }
 assert.equal(S.serializeLayout(value,fixture),before);assert.equal(S.serializeLayout(anchored,fixture),before);
});
await test('resize-rejects-overhang-import-retains-warning-without-repair',()=>{
 const before=S.serializeLayout(anchored,fixture);
 throwsCode(()=>S.applyAction(anchored,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:300,depthMm:300,heightMm:900}},fixture),'SURFACE_OVERHANG');
 assert.equal(S.serializeLayout(anchored,fixture),before);
 const imported=clone(anchored);Object.assign(imported.furniture[0],{widthMm:300,depthMm:300,heightMm:900});
 const next=S.parseLayout(JSON.stringify(imported),fixture);
 assert.deepEqual(next,imported);assert.deepEqual(next.printers[0].attachment,anchored.printers[0].attachment);
 assert.ok(S.validatePlacement(next,fixture).some(i=>i.code==='SURFACE_OVERHANG'));
});
await test('shelf-resize-board-heights-and-preserved-attachment',()=>{
 const state=S.createDefaultLayout({furniture:[S.createShelf()],printers:[p('p1','fixture200',{parentId:'shelf-1',surfaceId:'level-2',xMm:10,zMm:20,yawDeg:0})]},fixture);
 const next=S.applyAction(state,{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{heightMm:900}},fixture);
 const expected=[20,313.3333333333333,606.6666666666666,900];next.furniture[0].levels.forEach((l,i)=>near(l.topMm,expected[i]));
 assert.deepEqual(next.printers[0].attachment,state.printers[0].attachment);near(S.worldTransform(next,'p1',fixture).supportYM*1000,expected[1]);
 throwsCode(()=>S.applyAction(next,{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{levels:[{id:'level-1',topMm:20}]}},fixture),'UNKNOWN_SURFACE');
});
await test('occupied-parent-removal-and-explicit-floor-detach',()=>{
 throwsCode(()=>S.applyAction(anchored,{type:'REMOVE_FURNITURE',id:'desk-1'},fixture),'PARENT_OCCUPIED');
 const next=S.applyAction(anchored,{type:'REMOVE_FURNITURE',id:'desk-1',detachChildren:true},fixture),a=S.worldTransform(anchored,'p1',fixture),b=S.worldTransform(next,'p1',fixture);
 assert.equal(b.xMm,a.xMm);assert.equal(b.zMm,a.zMm);assert.equal(b.yawDeg,a.yawDeg);assert.equal(b.supportYM,0);assert.equal(next.furniture.length,0);
});
await test('shelf-positive-board-overlap-distinct-from-touch',()=>{
 const shelf=S.createShelf({heightMm:1000,levels:[{id:'bottom',topMm:20},{id:'upper',topMm:500}]});
 const state=S.createDefaultLayout({furniture:[shelf],printers:[p('p1','fixture600',{parentId:'shelf-1',surfaceId:'bottom',xMm:0,zMm:0,yawDeg:0})]},fixture);
 assert.equal(S.validatePlacement(state,fixture).some(i=>i.code==='SHELF_BOARD_INTERSECTION'),false);
 const changed=clone(state);changed.furniture[0].levels[1].topMm=469;
 assert.ok(S.validatePlacement(changed,fixture).some(i=>i.code==='SHELF_BOARD_INTERSECTION'));
});
await test('roundtrip-invalid-import-does-not-change-current-state',()=>{
 const text=S.serializeLayout(anchored,fixture);assert.deepEqual(S.parseLayout(text,fixture),anchored);
 for(const bad of ['', 'null','[]','{"format":', '1', '"string"', ' '.repeat(S.LIMITS.maxJsonChars+1)])assert.throws(()=>S.parseLayout(bad,fixture),S.LayoutValidationError);
 assert.equal(S.serializeLayout(anchored,fixture),text);
});
for(const [id,change,code] of [
 ['version',s=>s.version=2,'VERSION_UNSUPPORTED'],['units',s=>s.units='m','UNITS_MUST_BE_MM'],
 ['unknown-machine',s=>s.printers[0].machineId='unregistered-printer','UNKNOWN_MACHINE'],
 ['duplicate-cross-type-ID',s=>s.printers[0].id='desk-1','DUPLICATE_ENTITY_ID'],
 ['missing-parent',s=>s.printers[0].attachment.parentId='missing-desk','UNKNOWN_PARENT'],
 ['self-parent',s=>s.printers[0].attachment.parentId='p1','UNKNOWN_PARENT'],
 ['bad-surface',s=>s.printers[0].attachment.surfaceId='missing-level','UNKNOWN_SURFACE'],
 ['negative-width',s=>s.furniture[0].widthMm=-1,'NUMBER_OUT_OF_RANGE'],
 ['overflow',s=>s.furniture[0].widthMm=1e309,'NUMBER_OUT_OF_RANGE'],
 ['injected-url',s=>s.printers[0].modelUrl='https://attacker.invalid/anything.glb','UNKNOWN_FIELD'],
 ['injected-dimensions',s=>s.printers[0].widthMm=1,'UNKNOWN_FIELD']]){
 await test('invalid-import-'+id,()=>{const v=clone(anchored);change(v);throwsCode(()=>S.parseLayout(JSON.stringify(v),fixture),code)});
}
await test('prototype-keys-reject-without-pollution',()=>{
 const text=S.serializeLayout(anchored,fixture),unsafe=text.replace('"version": 1','"version": 1, "__proto__": {"layoutPolluted":true}');
 throwsCode(()=>S.parseLayout(unsafe,fixture),'UNKNOWN_FIELD');assert.equal(Object.prototype.layoutPolluted,undefined);
});
await test('furniture-count-and-printer-count-limits',()=>{
 const a=small();let v=clone(a);v.furniture=Array.from({length:S.LIMITS.maxFurniture+1},(_,i)=>S.createDesk({id:'d'+i}));throwsCode(()=>S.parseLayout(JSON.stringify(v),fixture),'FURNITURE_COUNT');
 v=clone(a);v.printers=Array.from({length:S.LIMITS.maxPrinters+1},(_,i)=>p('p'+i));throwsCode(()=>S.parseLayout(JSON.stringify(v),fixture),'PRINTER_COUNT');
});
await test('every-registered-source-ID-thumbnail-and-catalog-binding',()=>{
 assert.match(raw.sourceRevision,/^[a-f0-9]{64}$/);
 assert.equal(entries.length,registered.machines.length);assert.ok(entries.length>0);
 assert.equal(new Set(registered.machines.map(m=>m.id)).size,registered.machines.length);
 assert.equal(new Set(entries.map(m=>m.id)).size,entries.length);
 assert.deepEqual(new Set(entries.map(e=>e.id)),new Set(registered.machines.map(e=>e.id)));
 for(const row of raw.machines){
  const indexed=registered.machines.find(m=>m.id===row.id);
  assert.equal(row.thumbnail.path,'assets/machines/'+indexed.thumbnail);
  assert.equal(row.thumbnail.sha256,indexed.thumbnail_sha256);assert.equal(row.thumbnail.bytes,indexed.thumbnail_bytes);
  assert.equal(row.fullScene.machineId,row.id);assert.equal(row.fullScene.page,indexed.page);assert.equal(row.family,indexed.family);
  assert.ok(Number.isFinite(row.baseOffsetMm));assert.ok(row.unknowns.length,'Planning unknowns must remain explicit');
  for(const value of Object.values(row.dimensionsMm))assert.ok(Number.isFinite(value)&&value>0);
  assert.ok(row.sourceEvidence.sources.length>0);assert.ok(indexed.model_pins.length>0);
  for(const model of indexed.model_pins)assert.match(model.model_sha256,/^[a-f0-9]{64}$/);
 }
});
const machineCases=[];
for(const m of entries)await test('actual-catalog-state-roundtrip-ABA-'+m.id,()=>{
 let state=S.createDefaultLayout({printers:[p('p1',m.id)]},catalog),initial=state;
 for(const yawDeg of [90,-90,180,360,0])state=S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{yawDeg}}},catalog);
 assert.deepEqual(state,initial);assert.deepEqual(S.parseLayout(S.serializeLayout(state,catalog),catalog),initial);
 const derived=S.deriveScene(state,catalog).printers[0];assert.ok(derived.worldEnvelopeMm.flat().every(Number.isFinite));
 assert.equal(derived.widthMm,m.dimensionsMm.width);assert.equal(derived.depthMm,m.dimensionsMm.depth);assert.equal(derived.heightMm,m.dimensionsMm.height);
 machineCases.push({id:m.id,state_math:'PASS',source_dimension_claim:'Pinned proposal only; not actual full-scene proof',full_scene_loader:'PENDING'});
});
await test('room-wall-contact-allowed-crossing-rejected-atomic-state',()=>{
 let state=S.createDefaultLayout({printers:[p('p1','fixture200')]},fixture);
 state=S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{xMm:1900}}},fixture);
 const before=S.serializeLayout(state,fixture);
 throwsCode(()=>S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{xMm:1900.0001}}},fixture),'ROOM_OUT_OF_BOUNDS');
 assert.equal(S.serializeLayout(state,fixture),before);
 assert.equal(S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{xMm:1900}}},fixture),state);
});
const Uroom=()=>S.createRoomPolygon({polygonMm:[[0,0],[6000,0],[6000,6000],[4000,6000],[4000,2000],[2000,2000],[2000,6000],[0,6000]]});
await test('concave-room-contained-corners-cannot-create-notched-crossing',()=>{
 const state=S.createDefaultLayout({room:Uroom()},fixture);
 throwsCode(()=>S.applyAction(state,{type:'ADD_FURNITURE',furniture:S.createDesk({widthMm:4000,depthMm:4000,pose:{xMm:3000,zMm:3000,yawDeg:0}})},fixture),'ROOM_OUT_OF_BOUNDS');
});
await test('continuous-translation-cannot-jump-notch-endpoints-both-valid',()=>{
 let state=S.createDefaultLayout({room:Uroom(),printers:[p('p1','fixture200',{parentId:null,surfaceId:'floor',xMm:1000,zMm:5000,yawDeg:0})]},fixture);
 const before=S.serializeLayout(state,fixture);
 throwsCode(()=>S.applyWorldMove(state,{id:'p1',xMm:5000,zMm:5000},fixture),'ROOM_OUT_OF_BOUNDS');
 throwsCode(()=>S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{xMm:5000}}},fixture),'ROOM_OUT_OF_BOUNDS');
 assert.equal(S.serializeLayout(state,fixture),before);
 for(const [xMm,zMm]of[[1000,1000],[5000,1000],[5000,5000]])state=S.applyWorldMove(state,{id:'p1',xMm,zMm},fixture);
 assert.equal(state.printers[0].attachment.xMm,5000);assert.deepEqual(S.validatePlacement(state,fixture),[]);
});
await test('rotation-path-between-valid-endpoints-is-not-a-pose-grid',()=>{
 const state=S.createDefaultLayout({room:S.createRoomRect({widthMm:640,depthMm:640}),printers:[p()]},fixture);
 throwsCode(()=>S.applyAction(state,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{yawDeg:90}}},fixture),'ROOM_OUT_OF_BOUNDS');
 const wide=S.createDefaultLayout({room:S.createRoomRect({widthMm:800,depthMm:800}),printers:[p()]},fixture);
 const rotated=S.applyAction(wide,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{yawDeg:90}}},fixture);
 assert.deepEqual(S.validatePlacement(rotated,fixture),[]);
 assert.deepEqual(S.applyAction(rotated,{type:'UPDATE_PRINTER',id:'p1',patch:{attachment:{yawDeg:0}}},fixture),wide);
});
await test('surface-local-footprint-rotated-parent-exact-boundary-world-drag',()=>{
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[S.createDesk({widthMm:1000,depthMm:600,pose:{xMm:1000,zMm:2000,yawDeg:90}})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:0,zMm:0,yawDeg:0})]},fixture);
 state=S.applyWorldMove(state,{id:'p1',xMm:1050,zMm:1600},fixture);
 assert.deepEqual(state.printers[0].attachment,{parentId:'desk-1',surfaceId:'top',xMm:400,zMm:50,yawDeg:0});
 throwsCode(()=>S.applyWorldMove(state,{id:'p1',xMm:1050,zMm:1590},fixture),'SURFACE_OVERHANG');
});
await test('parent-rotation-move-resize-followers-stay-local-and-contained',()=>{
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:5000,depthMm:5000}),furniture:[S.createDesk({widthMm:1000,depthMm:600})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:300,zMm:0,yawDeg:0})]},fixture);
 const attachment=state.printers[0].attachment;
 state=S.applyAction(state,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{yawDeg:90}}},fixture);
 state=S.applyWorldMove(state,{id:'desk-1',xMm:1000,zMm:1000},fixture);
 assert.deepEqual(state.printers[0].attachment,attachment);assert.deepEqual(S.validatePlacement(state,fixture),[]);
 throwsCode(()=>S.applyWorldMove(state,{id:'desk-1',xMm:2400,zMm:1000},fixture),'ROOM_OUT_OF_BOUNDS');
 throwsCode(()=>S.applyAction(state,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:500}},fixture),'SURFACE_OVERHANG');
});
await test('room-shrink-and-shelf-resize-reject-new-protrusion',()=>{
 const state=S.createDefaultLayout({furniture:[S.createShelf({widthMm:1000,depthMm:600})],printers:[p('p1','fixture200',{parentId:'shelf-1',surfaceId:'level-1',xMm:300,zMm:0,yawDeg:0})]},fixture);
 throwsCode(()=>S.applyAction(state,{type:'SET_ROOM',room:S.createRoomRect({widthMm:800,depthMm:600})},fixture),'ROOM_OUT_OF_BOUNDS');
 throwsCode(()=>S.applyAction(state,{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{widthMm:500}},fixture),'SURFACE_OVERHANG');
});
await test('legacy-invalid-import-warns-no-auto-move-valid-other-edit-and-explicit-repair',()=>{
 const imported=S.createDefaultLayout({printers:[p('old','fixture200',{parentId:null,surfaceId:'floor',xMm:3000,zMm:0,yawDeg:0}),p('valid','fixture200')]},fixture);
 const text=S.serializeLayout(imported,fixture),state=S.parseLayout(text,fixture);
 assert.equal(S.serializeLayout(state,fixture),text);assert.ok(S.validatePlacement(state,fixture).some(i=>i.entityIds.includes('old')));
 const dragFixed=S.applyWorldMove(state,{id:'old',xMm:0,zMm:0},fixture);
 assert.deepEqual(S.placementViolations(dragFixed,fixture),[]);
 assert.deepEqual(S.previewWorldMove(state,{id:'old',x:0,z:0},fixture),{x:0,z:0});
 assert.equal(S.previewWorldMove(state,{id:'old',x:2900,z:0},fixture),false);
 const next=S.applyWorldMove(state,{id:'valid',xMm:100,zMm:0},fixture);assert.deepEqual(next.printers[0],state.printers[0]);
 const fixed=S.applyAction(next,{type:'UPDATE_PRINTER',id:'old',patch:{attachment:{xMm:-500}}},fixture);
 assert.equal(S.validatePlacement(fixed,fixture).some(i=>i.code==='ROOM_OUT_OF_BOUNDS'),false);
});
await test('actual-app-worldMove-uses-authoritative-rejection-noop-history-and-parent-conversion',()=>{
 const app=fs.readFileSync(path.join(src,'layout-app.mjs'),'utf8');
 const commit=app.slice(app.indexOf('function commit('),app.indexOf('function select('));
 const move=app.slice(app.indexOf('let pendingMove='),app.indexOf('async function render('));
 const factory=Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let synced=0,stored=0,errors=0;const sync=()=>synced++,store=()=>stored++,message=()=>errors++,humanError=e=>e;${commit}\n${move}\nreturn {move:worldMove,preview:constrainMove,get:()=>state,counts:()=>({synced,stored,errors,history:past.length})};`);
 const state=S.createDefaultLayout({printers:[p('p1','fixture200')]},fixture),a=factory(state,fixture,S.applyWorldMove,S.resolveWorldMove,S.serializeLayout);
 assert.equal(a.move({id:'p1',x:100,z:0}),true);const valid=a.get();
 assert.equal(a.move({id:'p1',x:5000,z:0}),false);assert.equal(a.get(),valid);assert.equal(a.counts().history,1);
 const counts=a.counts();assert.equal(a.move({id:'p1',x:100,z:0}),true);assert.deepEqual(a.counts(),counts);
 assert.ok(app.includes('userAgentData?.mobile===true'),'Parent mobile notice must remain intact');
});
await test('repair-mode-boundary-helper-retains-import-and-nonboundary-warnings',()=>{
 const legacy=S.createDefaultLayout({printers:[p('outside','fixture200',{parentId:null,surfaceId:'floor',xMm:3000,zMm:0,yawDeg:0})]},fixture);
 const saved=S.serializeLayout(legacy,fixture),loaded=S.parseLayout(saved,fixture);
 assert.deepEqual(S.PLACEMENT_BOUNDARY_CODES,['ROOM_OUT_OF_BOUNDS','SURFACE_OVERHANG']);
 assert.deepEqual(S.placementViolations(loaded,fixture).map(e=>[e.code,e.entityIds]),[['ROOM_OUT_OF_BOUNDS',['outside']]]);
 assert.equal(S.serializeLayout(loaded,fixture),saved);assert.ok(Object.isFrozen(S.placementViolations(loaded,fixture)));
 const tall=S.createDefaultLayout({room:S.createRoomRect({wallHeightMm:100}),printers:[p()]},fixture);
 assert.deepEqual(S.placementViolations(tall,fixture),[]);assert.ok(S.validatePlacement(tall,fixture).some(e=>e.code==='ROOM_HEIGHT_EXCEEDED'));
});
await test('legacy-front-wall-fully-outside-and-huge-parent-explicit-recovery',()=>{
 const outside=(xMm,zMm)=>S.createDefaultLayout({printers:[p('p1','fixture200',{parentId:null,surfaceId:'floor',xMm,zMm,yawDeg:0})]},fixture);
 const front=outside(0,1490),original=S.serializeLayout(front,fixture);
 assert.equal(S.previewWorldMove(front,{id:'p1',x:0,z:1480},fixture),false);
 assert.deepEqual(S.previewWorldMove(front,{id:'p1',x:0,z:1300},fixture),{x:0,z:1300});
 assert.equal(S.serializeLayout(front,fixture),original);
 assert.deepEqual(S.previewWorldMove(outside(10000,10000),{id:'p1',x:0,z:0},fixture),{x:0,z:0});
 const huge=S.createDefaultLayout({furniture:[S.createDesk({widthMm:5000})]},fixture);
 assert.equal(S.previewWorldMove(huge,{id:'desk-1',x:100,z:0},fixture),false);
 const partial=S.applyAction(huge,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:4500}},fixture);
 assert.ok(S.placementViolations(partial,fixture).some(e=>e.code==='ROOM_OUT_OF_BOUNDS'));
 const resized=S.applyAction(huge,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:4000}},fixture);
 assert.deepEqual(S.placementViolations(resized,fixture),[]);
 const roomFixed=S.applyAction(huge,{type:'SET_ROOM',room:S.createRoomRect({widthMm:6000,depthMm:3000})},fixture);
 assert.deepEqual(S.placementViolations(roomFixed,fixture),[]);
});
await test('legacy-surface-overhang-corrective-drag-preserves-other-boundaries',()=>{
 const state=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1000,depthMm:600})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:500,zMm:0,yawDeg:0})]},fixture);
 assert.equal(S.previewWorldMove(state,{id:'p1',x:490,z:0},fixture),false);
 const fixed=S.resolveWorldMove(state,{id:'p1',x:300,z:0},fixture);
 assert.deepEqual(S.placementViolations(fixed.state,fixture),[]);
 const unchanged=S.applyWorldMove(state,{id:'desk-1',xMm:100,zMm:0},fixture);
 assert.deepEqual(unchanged.printers[0].attachment,state.printers[0].attachment);assert.equal(S.placementViolations(unchanged,fixture)[0].code,'SURFACE_OVERHANG');
 const c=[{id:'wide',widthMm:800,depthMm:400,heightMm:300}];
 const old=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1000,depthMm:600,pose:{xMm:1400,zMm:0,yawDeg:0}})],printers:[p('p1','wide',{parentId:'desk-1',surfaceId:'top',xMm:0,zMm:450,yawDeg:0})]},c);
 assert.equal(S.placementViolations(old,c).some(e=>e.code==='ROOM_OUT_OF_BOUNDS'),false);
 throwsCode(()=>S.applyAction(old,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{yawDeg:90}}},c),'ROOM_OUT_OF_BOUNDS');
});
await test('parent-and-edge-child-recovery-together-no-arbitrary-child-offset',()=>{
 const state=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1000,depthMm:600,pose:{xMm:1700,zMm:0,yawDeg:0}})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:350,zMm:0,yawDeg:0})]},fixture);
 assert.equal(S.placementViolations(state,fixture).length,2);
 const r=S.resolveWorldMove(state,{id:'desk-1',x:1500,z:0},fixture);
 assert.deepEqual(S.placementViolations(r.state,fixture),[]);assert.deepEqual(r.state.printers[0].attachment,state.printers[0].attachment);
 assert.equal(S.worldTransform(r.state,'p1',fixture).xMm,1850);
});
await test('live-preview-clamps-swept-prefix-before-notch-not-other-arm',()=>{
 const state=S.createDefaultLayout({room:Uroom(),printers:[p('p1','fixture200',{parentId:null,surfaceId:'floor',xMm:1000,zMm:5000,yawDeg:0})]},fixture);
 const r=S.resolveWorldMove(state,{id:'p1',x:5000,z:5000},fixture);
 assert.ok(r.x<=1900);near(r.x,1900);assert.equal(r.z,5000);
 assert.deepEqual(S.placementViolations(r.state,fixture),[]);assert.equal(state.printers[0].attachment.xMm,1000);
});
await test('live-preview-snap-first-fractional-contact-and-exact-single-drop',()=>{
 const c=[{id:'fractional',widthMm:725.328,depthMm:500,heightMm:400}];
 const state=S.createDefaultLayout({printers:[p('p1','fractional')]},c),text=S.serializeLayout(state,c);
 const app=fs.readFileSync(path.join(src,'layout-app.mjs'),'utf8'),commit=app.slice(app.indexOf('function commit('),app.indexOf('function select('));
 const move=app.slice(app.indexOf('let pendingMove='),app.indexOf('async function render('));
 const factory=Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let stored=0;const sync=()=>{},store=()=>stored++,message=()=>{},humanError=e=>e;${commit}\n${move}\nreturn {preview:constrainMove,move:worldMove,get:()=>state,history:()=>past.length,stored:()=>stored};`);
 const a=factory(state,c,S.applyWorldMove,S.resolveWorldMove,S.serializeLayout);
 let shown;for(const x of [100,1000,1800,2000])shown=a.preview({id:'p1',x,z:0});
 assert.equal(a.get(),state);assert.equal(a.history(),0);assert.equal(a.stored(),0);
 assert.ok(shown.x<=1637.336);near(shown.x,1637.336);assert.ok(!Number.isInteger(shown.x/10));
 assert.equal(a.move({id:'p1',...shown}),true);assert.equal(a.history(),1);assert.equal(a.stored(),1);
 assert.equal(S.worldTransform(a.get(),'p1',c).xMm,shown.x);assert.equal(S.serializeLayout(state,c),text);
 const cancelled=factory(state,c,S.applyWorldMove,S.resolveWorldMove,S.serializeLayout);cancelled.preview({id:'p1',x:5000,z:0});
 assert.equal(cancelled.get(),state);assert.equal(cancelled.history(),0);assert.equal(cancelled.stored(),0);
});
await test('fractional-source-origin-snap-delta-ABA-and-rotated-world-identity',()=>{
 const state=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1200,depthMm:900,pose:{xMm:5.25,zMm:-7.125,yawDeg:23}})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:5.125,zMm:-3.75,yawDeg:15})]},fixture);
 const world=S.worldTransform(state,'p1',fixture),noOp=S.resolveWorldMove(state,{id:'p1',x:world.xMm,z:world.zMm},fixture);
 assert.deepEqual(noOp.state,state);
 const r=S.resolveWorldMove(state,{id:'p1',x:world.xMm+50,z:world.zMm+50},fixture);
 assert.equal(r.x,S.worldTransform(r.state,'p1',fixture).xMm);assert.equal(r.z,S.worldTransform(r.state,'p1',fixture).zMm);
 const back=S.resolveWorldMove(r.state,{id:'p1',x:world.xMm,z:world.zMm},fixture);assert.deepEqual(back.state,state);
});
const timings=[];
await test('bounded-live-preview-source-math-timing-not-model-fit',()=>{
 const state=S.createDefaultLayout({printers:[p('p1','fixture200')]},fixture);
 for(let i=0;i<8;i++){const start=performance.now();const r=S.resolveWorldMove(state,{id:'p1',x:5000,z:5000},fixture);timings.push(performance.now()-start);assert.ok(r.x<=1900&&r.z<=1450);assert.deepEqual(S.placementViolations(r.state,fixture),[]);}
});
function actualAppTransaction(initial,sourceCatalog){
 const app=fs.readFileSync(path.join(src,'layout-app.mjs'),'utf8');
 const commit=app.slice(app.indexOf('function commit('),app.indexOf('function select('));
 const moves=app.slice(app.indexOf('let pendingMove='),app.indexOf('async function render('));
 return Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let stored=0;const sync=()=>{},store=()=>stored++,message=()=>{},humanError=e=>e;${commit}\n${moves}\nreturn {preview:constrainMove,move:worldMove,get:()=>state,history:()=>past,stored:()=>stored};`)(initial,sourceCatalog,S.applyWorldMove,S.resolveWorldMove,S.serializeLayout);
}
await test('actual-app-one-gesture-dogleg-concave-room-segments-one-undo',()=>{
 const state=S.createDefaultLayout({room:Uroom(),printers:[p('p1','fixture200',{parentId:null,surfaceId:'floor',xMm:1000,zMm:4000,yawDeg:0})]},fixture);
 const a=actualAppTransaction(state,fixture),origin={x:1000,z:4000};let previous=origin;
 for(const [x,z]of[[1000,1000],[5000,1000],[5000,4000]]){
  const next=a.preview({id:'p1',x,z},{origin,previous});assert.deepEqual(next,{x,z});previous=next;
  assert.equal(a.get(),state);assert.equal(a.history().length,0);assert.equal(a.stored(),0);
 }
 throwsCode(()=>S.applyWorldMove(state,{id:'p1',xMm:5000,zMm:4000},fixture),'ROOM_OUT_OF_BOUNDS');
 assert.equal(a.move({id:'p1',...previous}),true);assert.equal(a.history().length,1);assert.equal(a.history()[0],state);assert.equal(a.stored(),1);
 assert.equal(a.get().printers[0].attachment.xMm,5000);assert.equal(a.get().printers[0].attachment.zMm,4000);
});
await test('actual-app-parent-child-dogleg-rejection-retains-last-safe-transaction',()=>{
 const state=S.createDefaultLayout({room:Uroom(),furniture:[S.createDesk({widthMm:400,depthMm:400,pose:{xMm:1000,zMm:4000,yawDeg:0}})],printers:[p('p1','fixture200',{parentId:'desk-1',surfaceId:'top',xMm:50,zMm:50,yawDeg:0})]},fixture);
 const a=actualAppTransaction(state,fixture),origin={x:1000,z:4000};
 const first=a.preview({id:'desk-1',x:1000,z:1000},{origin,previous:origin});
 const last=a.preview({id:'desk-1',x:5000,z:1000},{origin,previous:first});assert.deepEqual(last,{x:5000,z:1000});
 assert.equal(a.preview({id:'desk-1',x:NaN,z:1000},{origin,previous:last}),false);
 assert.equal(a.preview({id:'desk-1',x:5000,z:2000},{origin,previous:{x:1,z:2}}),false);
 assert.equal(a.move({id:'desk-1',...last}),true);assert.equal(a.history().length,1);
 assert.deepEqual(a.get().printers[0].attachment,state.printers[0].attachment);
 assert.equal(S.worldTransform(a.get(),'p1',fixture).xMm,5050);
 assert.deepEqual(S.placementViolations(a.get(),fixture),[]);
});
await test('actual-app-segment-preview-original-fractional-snap-anchor-ABA-cancel-restart',()=>{
 const c=[{id:'fractional',widthMm:725.328,depthMm:500,heightMm:400}],origin={x:5.125,z:-7.25};
 const state=S.createDefaultLayout({printers:[p('p1','fractional',{parentId:null,surfaceId:'floor',xMm:origin.x,zMm:origin.z,yawDeg:0})]},c);
 const a=actualAppTransaction(state,c),hit=a.preview({id:'p1',x:5000,z:origin.z},{origin,previous:origin});
 assert.ok(hit.x<=1637.336);assert.ok(!Number.isInteger(hit.x/10));
 const second=a.preview({id:'p1',x:200,z:origin.z},{origin,previous:hit});assert.equal(second.x,195.125);
 const back=a.preview({id:'p1',...origin},{origin,previous:second});assert.deepEqual(back,origin);
 assert.equal(a.move({id:'p1',...back}),true);assert.equal(a.get(),state);assert.equal(a.history().length,0);
 // A canceled preview is never committed. New previous===origin discards it.
 a.preview({id:'p1',x:1000,z:origin.z},{origin,previous:origin});assert.equal(a.get(),state);
 const restarted=a.preview({id:'p1',x:-100,z:origin.z},{origin,previous:origin});assert.equal(restarted.x,-104.875);
 assert.equal(a.move({id:'p1',...restarted}),true);assert.equal(a.history().length,1);
});
await test('legacy-two-axis-shrink-field-by-field-and-outer-expansion-monotone',()=>{
 const state=S.createDefaultLayout({furniture:[S.createDesk({widthMm:5000,depthMm:4000})]},fixture),saved=S.serializeLayout(state,fixture);
 const width=S.applyAction(state,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:4000}},fixture);
 assert.equal(S.placementViolations(width,fixture).length,1);
 assert.equal(S.serializeLayout(state,fixture),saved);
 throwsCode(()=>S.applyAction(width,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:6000}},fixture),'ROOM_OUT_OF_BOUNDS');
 throwsCode(()=>S.applyAction(width,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{xMm:500}}},fixture),'ROOM_OUT_OF_BOUNDS');
 const fixed=S.applyAction(width,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{depthMm:3000}},fixture);
 assert.deepEqual(S.placementViolations(fixed,fixture),[]);
 const bigger=S.applyAction(state,{type:'SET_ROOM',room:S.createRoomRect({widthMm:5000,depthMm:3000})},fixture);
 assert.equal(S.placementViolations(bigger,fixture).length,1);
 throwsCode(()=>S.applyAction(state,{type:'SET_ROOM',room:S.createRoomRect({widthMm:5000,depthMm:2500})},fixture),'ROOM_OUT_OF_BOUNDS');
 const repaired=S.applyAction(bigger,{type:'SET_ROOM',room:S.createRoomRect({widthMm:5000,depthMm:4000})},fixture);
 assert.deepEqual(S.placementViolations(repaired,fixture),[]);
});
await test('legacy-support-expands-fieldwise-but-cannot-worsen-other-room-domain',()=>{
 const c=[{id:'large',widthMm:1400,depthMm:900,heightMm:500}];
 const state=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1000,depthMm:600})],printers:[p('p1','large',{parentId:'desk-1',surfaceId:'top',xMm:0,zMm:0,yawDeg:0})]},c);
 const width=S.applyAction(state,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:1400}},c);
 assert.equal(S.placementViolations(width,c)[0].code,'SURFACE_OVERHANG');
 throwsCode(()=>S.applyAction(width,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{depthMm:500}},c),'SURFACE_OVERHANG');
 const fixed=S.applyAction(width,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{depthMm:900}},c);
 assert.deepEqual(S.placementViolations(fixed,c),[]);
 const nearWall=S.createDefaultLayout({furniture:[S.createDesk({widthMm:1000,depthMm:600,pose:{xMm:1400,zMm:0,yawDeg:0}})],printers:[p('p1','large',{parentId:'desk-1',surfaceId:'top',xMm:0,zMm:0,yawDeg:0})]},c);
 throwsCode(()=>S.applyAction(nearWall,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:1400}},c),'ROOM_OUT_OF_BOUNDS');
});
for(const p of inputPaths)assert.deepEqual(pin(p),before.get(p),'State test mutated actual source inputs');
assert.deepEqual(failures,[],'State/geometry regressions');
console.log(JSON.stringify({status:'PASS',scope:'State/math and actual registered catalog/index binding only; dimensions are planning inputs, not actual full-scene or native-fit evidence.',cases:cases.length,registeredMachines:machineCases.length,previewTimingMs:timings,stateSHA256:pin(inputPaths[0]).sha256,geometrySHA256:pin(inputPaths[1]).sha256,catalogSHA256:pin(catalogFile).sha256,indexSHA256:pin(indexFile).sha256}));
