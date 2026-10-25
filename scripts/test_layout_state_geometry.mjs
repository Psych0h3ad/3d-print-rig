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
const inputPaths=['layout-state.mjs','layout-geometry.mjs','layout-catalog.json','layout-constraints.mjs','layout-collision.mjs','layout-wall-rotation.mjs','layout-app.mjs'].map(n=>path.join(src,n));
const indexFile=path.join(site,'assets/machines/index.json');inputPaths.push(indexFile);
const before=new Map(inputPaths.map(p=>[p,pin(p)]));
const S=await import(pathToFileURL(path.join(src,'layout-state.mjs'))),G=await import(pathToFileURL(path.join(src,'layout-geometry.mjs')));
const C=await import(pathToFileURL(path.join(src,'layout-constraints.mjs')));
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
 const imported=S.createDefaultLayout({printers:[p('old','fixture200',{parentId:null,surfaceId:'floor',xMm:3000,zMm:0,yawDeg:0}),p('valid','fixture200',{parentId:null,surfaceId:'floor',xMm:0,zMm:1000,yawDeg:0})]},fixture);
 const text=S.serializeLayout(imported,fixture),state=S.parseLayout(text,fixture);
 assert.equal(S.serializeLayout(state,fixture),text);assert.ok(S.validatePlacement(state,fixture).some(i=>i.entityIds.includes('old')));
 const dragFixed=S.applyWorldMove(state,{id:'old',xMm:0,zMm:0},fixture);
 assert.deepEqual(S.placementViolations(dragFixed,fixture),[]);
 assert.deepEqual(S.previewWorldMove(state,{id:'old',x:0,z:0},fixture),{x:0,z:0});
 assert.equal(S.previewWorldMove(state,{id:'old',x:2900,z:0},fixture),false);
 const next=S.applyWorldMove(state,{id:'valid',xMm:100,zMm:1000},fixture);assert.deepEqual(next.printers[0],state.printers[0]);
 const fixed=S.applyAction(next,{type:'UPDATE_PRINTER',id:'old',patch:{attachment:{xMm:-500}}},fixture);
 assert.equal(S.validatePlacement(fixed,fixture).some(i=>i.code==='ROOM_OUT_OF_BOUNDS'),false);
});
await test('actual-app-worldMove-uses-authoritative-rejection-noop-history-and-parent-conversion',()=>{
 const app=fs.readFileSync(path.join(src,'layout-app.mjs'),'utf8');
 const commit=app.slice(app.indexOf('function commit('),app.indexOf('function select('));
 const move=app.slice(app.indexOf('let pendingMove='),app.indexOf('async function render('));
 const factory=Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,selected=null,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let synced=0,stored=0,errors=0;const sync=()=>synced++,store=()=>stored++,message=()=>errors++,humanError=e=>e;const statusNode={hidden:false,textContent:''},$=()=>statusNode,ui={setStatus(){}};${commit}\n${move}\nreturn {move:worldMove,preview:constrainMove,get:()=>state,counts:()=>({synced,stored,errors,history:past.length})};`);
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
 const factory=Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,selected=null,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let stored=0;const sync=()=>{},store=()=>stored++,message=()=>{},humanError=e=>e;const statusNode={hidden:false,textContent:''},$=()=>statusNode,ui={setStatus(){}};${commit}\n${move}\nreturn {preview:constrainMove,move:worldMove,get:()=>state,history:()=>past.length,stored:()=>stored};`);
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
 return Function('initial','catalog','applyWorldMove','resolveWorldMove','serializeLayout',`let state=initial,selected=null,busy=false,roomEditing=false,disposed=false;const past=[],future=[];let stored=0;const sync=()=>{},store=()=>stored++,message=()=>{},humanError=e=>e;const statusNode={hidden:false,textContent:''},$=()=>statusNode,ui={setStatus(){}};${commit}\n${moves}\nreturn {preview:constrainMove,move:worldMove,get:()=>state,history:()=>past,stored:()=>stored};`)(initial,sourceCatalog,S.applyWorldMove,S.resolveWorldMove,S.serializeLayout);
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
// Independent synthetic planning-footprint cases; never loads actual models.
// Numeric equality allowance below compares computed coordinates only. It is
// not fed into any containment predicate or used to admit an outside footprint.
const wallCat=S.createCatalog([{id:'wall-square',widthMm:200,depthMm:200,heightMm:300}]);
const wallTimes=[],wallWarmTimings=[];
const wallClose=(a,b,label='coordinate')=>assert.ok(Math.abs(a-b)<=1e-7,`${label}: expected ${b}, observed ${a}`);
const wallPrinter=(x,z,attachment={})=>({id:'wall-printer',machineId:'wall-square',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:x,zMm:z,yawDeg:0,...attachment}});
function wallState(x,z,room=S.createRoomRect()){
 return S.createDefaultLayout({room,printers:[wallPrinter(x,z)]},wallCat);
}
function wallResolve(state,id,x,z,options={snapMm:0}){
 const saved=S.serializeLayout(state,wallCat),start=S.worldTransform(state,id,wallCat),clock=performance.now();
 const r=S.resolveWorldMove(state,{id,x,z},wallCat,options);wallTimes.push(performance.now()-clock);
 assert.ok(r,'Resolver rejected a valid-start wall scenario');
 assert.equal(S.serializeLayout(state,wallCat),saved,'Resolver mutated committed source state');
 assert.deepEqual(S.placementViolations(r.state,wallCat),[],'Accepted state has a room/support boundary violation');
 assert.equal(r.x,S.worldTransform(r.state,id,wallCat).xMm);assert.equal(r.z,S.worldTransform(r.state,id,wallCat).zMm);
 assert.ok(Math.hypot(r.x-start.xMm,r.z-start.zMm)<=Math.hypot(x-start.xMm,z-start.zMm)+1e-7,'Movement was amplified beyond the requested displacement');
 return r;
}
for(const axis of ['x','z'])for(const side of [-1,1])for(const direction of [-1,1])await test(`wall-axis-${axis}-${side}-tangent-${direction}-pressure-and-pullaway`,()=>{
 const bound=axis==='x'?1900:1400,start=axis==='x'?[side*bound,0]:[0,side*bound];
 const initial=wallState(...start),target=axis==='x'?[start[0],direction*200]:[direction*200,start[1]];
 const tangent=wallResolve(initial,'wall-printer',...target);wallClose(tangent.x,target[0]);wallClose(tangent.z,target[1]);
 const desired=target.slice();desired[axis==='x'?0:1]+=side*80;
 const pressure=wallResolve(initial,'wall-printer',...desired);wallClose(pressure.x,target[0]);wallClose(pressure.z,target[1]);assert.equal(pressure.boundaryLimited,true);
 const away=target.slice();away[axis==='x'?0:1]-=side*10;
 const pull=wallResolve(pressure.state,'wall-printer',...away);wallClose(pull.x,away[0]);wallClose(pull.z,away[1]);
});
for(const nx of [-1,1])for(const nz of [-1,1])for(const direction of [-1,1])await test(`wall-diagonal-${nx}-${nz}-tangent-${direction}`,()=>{
 const room=S.createRoomPolygon({polygonMm:[[0,-2000],[2000,0],[0,2000],[-2000,0]]});
 const start=[nx*900,nz*900],tangent=[-nz*100*direction,nx*100*direction];
 const ideal=[start[0]+tangent[0],start[1]+tangent[1]],goal=[ideal[0]+nx*10,ideal[1]+nz*10];
 const r=wallResolve(wallState(...start,room),'wall-printer',...goal);
 // Square support on each diamond edge is exactly200mm: |cxﾂｱcz|<=1800.
 wallClose(nx*r.x+nz*r.z,1800,'contact normal');wallClose(r.x,ideal[0],'diagonal tangent x');wallClose(r.z,ideal[1],'diagonal tangent z');
 const away=wallResolve(r.state,'wall-printer',r.x-nx*10,r.z-nz*10);wallClose(away.x,r.x-nx*10);wallClose(away.z,r.z-nz*10);
});
for(const sx of [-1,1])for(const sz of [-1,1])await test(`wall-corner-${sx}-${sz}-no-leak-or-jump`,()=>{
 const initial=wallState(sx*1900,sz*1400),r=wallResolve(initial,'wall-printer',sx*2050,sz*1550);
 wallClose(r.x,sx*1900);wallClose(r.z,sz*1400);
 const slide=wallResolve(r.state,'wall-printer',sx*1800,sz*1500);wallClose(slide.x,sx*1800);wallClose(slide.z,sz*1400);
 const away=wallResolve(slide.state,'wall-printer',sx*1790,sz*1390);wallClose(away.x,sx*1790);wallClose(away.z,sz*1390);
});
const wallLocalToWorld=(parent,x,z)=>{
 const angle=parent.pose.yawDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return {x:parent.pose.xMm+c*x+s*z,z:parent.pose.zMm-s*x+c*z};
};
for(const yaw of [0,90,37,-37])for(const side of [-1,1])await test(`wall-rotated-support-${yaw}-side-${side}`,()=>{
 const parent=S.createDesk({id:'wall-desk',widthMm:1000,depthMm:600,pose:{xMm:1000,zMm:500,yawDeg:yaw}});
 const state=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[parent],printers:[wallPrinter(side*400,0,{parentId:parent.id,surfaceId:'top'})]},wallCat);
 assert.deepEqual(S.placementViolations(state,wallCat),[],'Fixture must begin inside its rotated support');
 const target=wallLocalToWorld(parent,side*450,120),r=wallResolve(state,'wall-printer',target.x,target.z,{snapMm:10,snapOrigin:{xMm:side*400,zMm:0}});
 const a=r.state.printers[0].attachment;wallClose(a.xMm,side*400,'support local normal');wallClose(a.zMm,120,'support local tangent');
 assert.deepEqual(r.state.furniture[0],parent);
 const targetAway=wallLocalToWorld(parent,side*390,120),away=wallResolve(r.state,'wall-printer',targetAway.x,targetAway.z,{snapMm:10,snapOrigin:{xMm:side*400,zMm:0}});
 wallClose(away.state.printers[0].attachment.xMm,side*390,'support pullaway');wallClose(away.state.printers[0].attachment.zMm,120);
});
function wallFamily(side=1,yaw=0,children=2){
 const extent=yaw===90?300:500,limit=2000-extent;
 const parent=S.createDesk({id:'wall-desk',widthMm:1000,depthMm:600,pose:{xMm:side*limit,zMm:0,yawDeg:yaw}});
 const printers=Array.from({length:children},(_,i)=>({...wallPrinter(children===2?(i?400:-400):[-300,-100,100,300][i%4],children===2?(i?200:-200):[-150,-50,50,150][Math.floor(i/4)],{parentId:parent.id,surfaceId:'top'}),id:'wall-child-'+i}));
 return S.createDefaultLayout({furniture:[parent],printers},wallCat);
}
for(const yaw of [0,90])for(const side of [-1,1])await test(`wall-table-children-${yaw}-${side}-source-local-unchanged`,()=>{
 const initial=wallFamily(side,yaw),before=S.deriveScene(initial,wallCat),x=initial.furniture[0].pose.xMm;
 const r=wallResolve(initial,'wall-desk',x+side*80,100);wallClose(r.x,x);wallClose(r.z,100);
 assert.deepEqual(r.state.printers,initial.printers,'Dragging a table must not edit child attachments');
 const after=S.deriveScene(r.state,wallCat);
 for(let i=0;i<after.printers.length;i++){wallClose(after.printers[i].xMm,before.printers[i].xMm);wallClose(after.printers[i].zMm,before.printers[i].zMm+100);assert.equal(after.printers[i].supportYM,before.printers[i].supportYM);assert.equal(after.printers[i].yawDeg,before.printers[i].yawDeg);}
});
await test('wall-concave-U-single-proposal-cannot-tunnel-between-valid-arms',()=>{
 const initial=wallState(1000,4000,Uroom()),r=wallResolve(initial,'wall-printer',5000,4000);
 assert.ok(r.x<=1900);wallClose(r.x,1900);wallClose(r.z,4000);
 throwsCode(()=>S.applyWorldMove(initial,{id:'wall-printer',xMm:5000,zMm:4000},wallCat),'ROOM_OUT_OF_BOUNDS');
});
await test('wall-concave-U-accepted-segments-one-drop-original-undo',()=>{
 const initial=wallState(1000,4000,Uroom()),a=actualAppTransaction(initial,wallCat),origin={x:1000,z:4000};let previous=origin;
 for(const [x,z]of[[2500,3800],[1900,1000],[5000,1000],[5000,4000]]){
  const r=a.preview({id:'wall-printer',x,z},{origin,previous});assert.ok(r);previous={x:r.x,z:r.z};assert.equal(a.get(),initial);assert.equal(a.history().length,0);
 }
 wallClose(previous.x,5000);wallClose(previous.z,4000);assert.equal(a.move({id:'wall-printer',...previous}),true);assert.equal(a.history().length,1);assert.equal(a.history()[0],initial);assert.equal(a.stored(),1);
 assert.deepEqual(S.placementViolations(a.get(),wallCat),[]);
});
await test('wall-fractional-contact-pressure-reverse-no-quantized-normal-drift',()=>{
 const wallFractionCat=S.createCatalog([{id:'wall-fraction',widthMm:725.328,depthMm:200,heightMm:300}]);
 const initial=S.createDefaultLayout({printers:[{...wallPrinter(1637.336,0),machineId:'wall-fraction'}]},wallFractionCat),before=S.serializeLayout(initial,wallFractionCat);
 let state=initial;
 for(const z of [100,-100,200,-200,0]){
  const r=S.resolveWorldMove(state,{id:'wall-printer',x:1800,z},wallFractionCat,{snapMm:10,snapOrigin:{xMm:1637.336,zMm:0}});assert.ok(r);assert.deepEqual(S.placementViolations(r.state,wallFractionCat),[]);wallClose(r.x,1637.336);wallClose(r.z,z);state=r.state;
 }
 assert.equal(S.serializeLayout(initial,wallFractionCat),before);
});
await test('wall-near-contact-tangent-candidate-does-not-waive-crossing',()=>{
 const initial=wallState(1899.99999999,0),r=wallResolve(initial,'wall-printer',2000,200);
 assert.ok(r.x<=1900);wallClose(r.z,200);assert.deepEqual(S.placementViolations(r.state,wallCat),[]);
});
await test('wall-warmed-repeated-contact-responsiveness-observed-not-fit',()=>{
 for(const [name,state,id,goal,count]of[
  ['printer',wallState(1900,0),'wall-printer',[1980,100],20],
  ['table-plus-2',wallFamily(),'wall-desk',[1580,100],12],
  ['table-plus-16',wallFamily(1,0,16),'wall-desk',[1580,100],6]]){
  for(let i=0;i<4;i++)wallResolve(state,id,...goal);
  const values=[];
  for(let i=0;i<count;i++){const begin=performance.now(),r=wallResolve(state,id,...goal);values.push(performance.now()-begin);wallClose(r.z,100);}
  const ordered=values.slice().sort((a,b)=>a-b);wallWarmTimings.push({scenario:name,samples:values.length,ms:values,medianMs:ordered[Math.floor(ordered.length/2)],maxMs:ordered.at(-1)});
 }
});

// Integer vertices/corners on a3:4 wall; tangent normalization still exercises
// non-dyadic0.6/0.8 arithmetic without starting from an approximate contact.
for(const sx of [-1,1])for(const sz of [-1,1])for(const direction of [-1,1])await test(`wall-3-4-angle-${sx}-${sz}-tangent-${direction}`,()=>{
 const points=[[-400,-2800],[2800,-400],[400,2800],[-2800,400]].map(([x,z])=>[sx*x,sz*z]);
 const room=S.createRoomPolygon({polygonMm:points}),initial=wallState(sx*1500,sz*1100,room);
 assert.deepEqual(S.placementViolations(initial,wallCat),[],'Exact integer contact must start contained');
 const ideal=[sx*(1500-300*direction),sz*(1100+400*direction)];
 const r=wallResolve(initial,'wall-printer',ideal[0]+sx*40,ideal[1]+sz*30);
 wallClose(r.x,ideal[0],'3:4 wall tangent x');wallClose(r.z,ideal[1],'3:4 wall tangent z');
 const away=wallResolve(r.state,'wall-printer',r.x-sx*8,r.z-sz*6);wallClose(away.x,r.x-sx*8);wallClose(away.z,r.z-sz*6);
});

for(const side of [-1,1])await test(`wall-adjacent-slanted-base-corner-${side}`,()=>{
 const room=S.createRoomPolygon({polygonMm:[[0,0],[4000,0],[2000,4000]]});
 const x=side<0?200:3800,initial=wallState(x,100,room),ideal=[x-side*100,300];
 // At either slanted/base corner, one tangent blocks and the other is usable.
 const r=wallResolve(initial,'wall-printer',ideal[0]+side*20,ideal[1]+10);
 wallClose(r.x,ideal[0],'adjacent slanted tangent x');wallClose(r.z,ideal[1],'adjacent slanted tangent z');
 const down=wallResolve(r.state,'wall-printer',r.x-side*10,r.z-10);assert.deepEqual(S.placementViolations(down.state,wallCat),[]);
});
await test('wall-3-4-repeated-tangential-pressure-no-numeric-stick-or-drift',()=>{
 const room=S.createRoomPolygon({polygonMm:[[-400,-2800],[2800,-400],[400,2800],[-2800,400]]});
 let state=wallState(1500,1100,room);
 for(const direction of [1,1,1,1,1,1,1,1,-1,-1,-1,-1,-1,-1,-1,-1]){
  const before=S.worldTransform(state,'wall-printer',wallCat),ideal=[before.xMm-30*direction,before.zMm+40*direction];
  const r=wallResolve(state,'wall-printer',ideal[0]+4,ideal[1]+3);
  wallClose(r.x,ideal[0],'repeated3:4tangent x');wallClose(r.z,ideal[1],'repeated3:4tangent z');
  state=r.state;
 }
 wallClose(state.printers[0].attachment.xMm,1500);wallClose(state.printers[0].attachment.zMm,1100);
});

// Directed, continuous in-scene rotations. These are footprint constraints,
// separate from printer meshes, native mounting and inter-item fit warnings.
const rotationCat=S.createCatalog([{id:'rotation-long',widthMm:600,depthMm:100,heightMm:300},
 {id:'rotation-wide',widthMm:600,depthMm:400,heightMm:300},
 {id:'rotation-square',widthMm:400,depthMm:400,heightMm:300},
 {id:'rotation-small',widthMm:200,depthMm:100,heightMm:300}]);
const rotationPrinter=(machineId='rotation-long',attachment={})=>({id:'rot-p',machineId,configurationId:null,
 attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0,...attachment}});
const rotationState=(machineId='rotation-long',yawDeg=0,room=S.createRoomRect())=>
 S.createDefaultLayout({room,printers:[rotationPrinter(machineId,{yawDeg})]},rotationCat);
function rotateResolved(state,id,yawDeg,options={snapDeg:0},cat=rotationCat){
 const saved=S.serializeLayout(state,cat),start=S.worldTransform(state,id,cat),r=S.resolveWorldRotation(state,{id,yawDeg},cat,options);
 assert.ok(r,'Expected a contained continuous rotation transaction');
 assert.equal(S.serializeLayout(state,cat),saved,'Rotation mutated the committed source state');
 const end=S.worldTransform(r.state,id,cat);
 assert.equal(r.yawDeg,end.yawDeg);assert.equal(r.x,end.xMm);assert.equal(r.z,end.zMm);
 assert.ok([r.x,r.z,r.yawDeg].every(Number.isFinite),'Resolved world pose must be finite');
 if(r.wallAdjusted!==true){assert.equal(end.xMm,start.xMm);assert.equal(end.zMm,start.zMm);}
 else assert.equal(r.wallAdjusted,true,'Translation is an explicit wall-assisted result');
 assert.equal(end.positionM.y,start.positionM.y);assert.deepEqual(S.placementViolations(r.state,cat),[]);
 assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.state));
 return r;
}
function actualRotationPreview(initial,sourceCatalog){
 const app=fs.readFileSync(path.join(src,'layout-app.mjs'),'utf8'),start=app.indexOf('let pendingRotation='),end=app.indexOf('function worldRotate(',start);
 assert.ok(start>=0&&end>start,'Actual app rotation-preview section missing');
 return Function('initial','catalog','S',`const {resolveWorldRotation,worldTransform}=S;let state=initial,busy=false,roomEditing=false,disposed=false;
  const resolveGroupRotation=()=>{throw Error('Group is not part of this independent state fixture')};
  ${app.slice(start,end)}\nreturn {preview:constrainRotate,pending:()=>pendingRotation,state:()=>state};`)(initial,sourceCatalog,S);
}
for(const kind of ['floor','supported'])await test(`rotation-actual-app-rejects-tampered-origin-world-xz-${kind}`,()=>{
 const desk=S.createDesk({id:'origin-desk',widthMm:1200,depthMm:900,pose:{xMm:100.25,zMm:-200.125,yawDeg:37.5}});
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:kind==='supported'?[desk]:[],
  printers:[rotationPrinter('rotation-small',kind==='supported'?{parentId:desk.id,surfaceId:'top',xMm:123.125,zMm:-23.75,yawDeg:0.1}:{xMm:900.125,zMm:-0.375,yawDeg:0.1})]},rotationCat);
 const engine=actualRotationPreview(initial,rotationCat),world=S.worldTransform(initial,'rot-p',rotationCat),origin={x:world.xMm,z:world.zMm,yawDeg:world.yawDeg};
 const accepted=engine.preview({id:'rot-p',yawDeg:origin.yawDeg+30},{origin,previous:origin,snapDeg:15});assert.ok(accepted);
 const pending=engine.pending();
 for(const axis of ['x','z']){
  const forged={...origin,[axis]:origin[axis]+0.5};
  assert.equal(engine.preview({id:'rot-p',yawDeg:origin.yawDeg+45},{origin:forged,previous:accepted,snapDeg:15}),false,'Pending gesture must reject a changed original world '+axis);
  assert.equal(engine.pending(),pending,'Origin tamper must not replace the last proven transaction');
 }
 const continued=engine.preview({id:'rot-p',yawDeg:origin.yawDeg+45},{origin,previous:accepted,snapDeg:15});assert.ok(continued);assert.equal(continued.yawDeg,origin.yawDeg+45);
 for(const axis of ['x','z']){
  const fresh=actualRotationPreview(initial,rotationCat),forged={...origin,[axis]:origin[axis]+0.5};
  assert.equal(fresh.preview({id:'rot-p',yawDeg:origin.yawDeg+30},{origin:forged,previous:forged,snapDeg:15}),false,'A forged first-event origin is not the committed source pose');
 }
 assert.equal(engine.state(),initial);
});
await test('rotation-world-unwrapped-signed-free-full-turns-reversal-and-native-reset',()=>{
 const initial=rotationState(),saved=S.serializeLayout(initial,rotationCat);let state=initial;
 for(const yaw of [90,360,720,450,-270,-720,0]){
  const r=rotateResolved(state,'rot-p',yaw);assert.equal(r.yawDeg,yaw);assert.equal(r.boundaryLimited,undefined);state=r.state;
 }
 assert.equal(S.serializeLayout(state,rotationCat),saved);
});
await test('rotation-original-numeric-world-snap-anchor-retained-across-accepted-segments',()=>{
 const initial=rotationState('rotation-long',12.25);let state=initial;
 for(const [raw,target]of[[13,12.25],[20,27.25],[34,27.25],[50,57.25],[-8,-2.75],[12.25,12.25]]){
  const r=rotateResolved(state,'rot-p',raw,{snapDeg:15,snapOrigin:12.25});
  assert.equal(r.yawDeg,target);assert.equal(r.pointerRemainderDeg,raw-target);state=r.state;
 }
 assert.deepEqual(state,initial);
});
for(const snapDeg of [0,1,.1,15])await test(`rotation-fine-and-no-snap-${snapDeg}`,()=>{
 const initial=rotationState('rotation-long',12.25),raw=16.123;
 const expected=snapDeg===0?raw:12.25+Math.round((raw-12.25)/snapDeg)*snapDeg;
 const r=rotateResolved(initial,'rot-p',raw,{snapDeg,snapOrigin:12.25});assert.equal(r.yawDeg,expected);assert.equal(r.pointerRemainderDeg,raw-expected);
});
await test('rotation-default15-and-explicit-global-zero-anchor',()=>{
 const initial=rotationState('rotation-long',12.25);
 assert.equal(rotateResolved(initial,'rot-p',20,{}).yawDeg,27.25);
 assert.equal(rotateResolved(initial,'rot-p',20,{snapOrigin:0}).yawDeg,15);
});
for(const parentYaw of [90,37.5,-37.5,450])await test(`rotation-attached-printer-world-to-local-${parentYaw}`,()=>{
 const desk=S.createDesk({id:'rot-desk',widthMm:1600,depthMm:1600,pose:{xMm:300,zMm:-400,yawDeg:parentYaw}});
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[desk],printers:[rotationPrinter('rotation-small',{parentId:desk.id,surfaceId:'top',xMm:120,zMm:-70,yawDeg:15.25})]},rotationCat);
 const origin=S.worldTransform(initial,'rot-p',rotationCat).yawDeg;
 const r=rotateResolved(initial,'rot-p',origin+30.2,{snapDeg:15,snapOrigin:origin});
 assert.equal(r.yawDeg,origin+30);assert.equal(r.state.printers[0].attachment.yawDeg,45.25);
 assert.equal(r.state.printers[0].attachment.xMm,120);assert.equal(r.state.printers[0].attachment.zMm,-70);
 assert.deepEqual(r.state.furniture,initial.furniture);
 const back=rotateResolved(r.state,'rot-p',origin,{snapDeg:0});assert.deepEqual(back.state,initial);
});
for(const type of ['desk','shelf'])await test(`rotation-${type}-followers-preserve-local-attachments-and-orbit`,()=>{
 const parent=(type==='desk'?S.createDesk:S.createShelf)({id:'rot-parent',widthMm:1600,depthMm:1400,pose:{xMm:100,zMm:200,yawDeg:0}});
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[parent],printers:[
  rotationPrinter('rotation-small',{parentId:parent.id,surfaceId:type==='desk'?'top':'level-1',xMm:300,zMm:-200,yawDeg:15})]},rotationCat);
 const r=rotateResolved(initial,parent.id,450);
 assert.deepEqual(r.state.printers,initial.printers);
 const child=S.worldTransform(r.state,'rot-p',rotationCat),q=G.rotateXZ([300,-200],450);
 assert.equal(child.xMm,100+q[0]);assert.equal(child.zMm,200+q[1]);assert.equal(child.yawDeg,465);
 assert.equal(child.supportYM,S.worldTransform(initial,'rot-p',rotationCat).supportYM);
 assert.deepEqual(rotateResolved(r.state,parent.id,0).state,initial);
});
for(const direction of [-1,1])await test(`rotation-narrow-gap-endpoints-fit-mid-sweep-blocked-${direction}`,()=>{
 const initial=rotationState('rotation-wide',0,S.createRoomRect({widthMm:660,depthMm:660}));
 const m=rotationCat.byId['rotation-wide'];assert.ok(G.polygonContains(initial.room.polygonMm,G.transformPolygon(m.footprintMm,{xMm:0,zMm:0,yawDeg:direction*90})));
 assert.equal(G.polygonContains(initial.room.polygonMm,G.transformPolygon(m.footprintMm,{xMm:0,zMm:0,yawDeg:direction*45})),false);
 const r=rotateResolved(initial,'rot-p',direction*90);
 assert.equal(r.boundaryLimited,true);assert.ok(direction*r.yawDeg>0&&direction*r.yawDeg<45);
 const analyticFirst=(Math.atan2(200,300)-Math.acos(330/Math.hypot(300,200)))*180/Math.PI;
 assert.ok(Math.abs(r.yawDeg)<=analyticFirst,'Accepted prefix must not exceed the exact rectangular first wall contact');
 assert.equal(r.state.printers[0].attachment.xMm,0);assert.equal(r.state.printers[0].attachment.zMm,0);
 assert.equal(rotateResolved(r.state,'rot-p',0).yawDeg,0);
});
await test('rotation-360-must-not-use-equal-endpoint-shortcut-or-snap-over-obstacle',()=>{
 const initial=rotationState('rotation-square',0,S.createRoomRect({widthMm:500,depthMm:500}));
 assert.deepEqual(G.transformPolygon(rotationCat.byId['rotation-square'].footprintMm,{xMm:0,zMm:0,yawDeg:360}),rotationCat.byId['rotation-square'].footprintMm);
 // Negative control: an endpoint-only full-turn transaction is accepted by
 // the old shortest-yaw API; the new directed resolver must stop before45deg.
 assert.equal(S.applyAction(initial,{type:'UPDATE_PRINTER',id:'rot-p',patch:{attachment:{yawDeg:360}}},rotationCat).printers[0].attachment.yawDeg,360);
 const r=rotateResolved(initial,'rot-p',360,{snapDeg:15,snapOrigin:0});assert.equal(r.boundaryLimited,true);assert.ok(r.yawDeg>0&&r.yawDeg<45);
 assert.notEqual(r.yawDeg%15,0,'Boundary contact is not rounded through a wall to the next snap');
});
await test('rotation-negative270-and-positive90-have-different-swept-paths',()=>{
 const initial=rotationState('rotation-long',45,S.createRoomRect({widthMm:550,depthMm:1000}));
 const short=rotateResolved(initial,'rot-p',135);assert.equal(short.yawDeg,135);assert.equal(short.boundaryLimited,undefined);
 assert.equal(S.applyAction(initial,{type:'UPDATE_PRINTER',id:'rot-p',patch:{attachment:{yawDeg:-225}}},rotationCat).printers[0].attachment.yawDeg,-225);
 const directed=rotateResolved(initial,'rot-p',-225);assert.equal(directed.boundaryLimited,true);assert.ok(directed.yawDeg<45&&directed.yawDeg>0);
 assert.equal(rotateResolved(directed.state,'rot-p',45).yawDeg,45);
});
for(const corner of [false,true])await test(`rotation-exact-wall-contact-${corner?'corner':'wall'}-cannot-leak`,()=>{
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:2000,depthMm:2000}),printers:[rotationPrinter('rotation-small',{xMm:900,zMm:corner?950:0})]},rotationCat);
 const anchor=S.worldTransform(initial,'rot-p',rotationCat),anchorPointMm={xMm:anchor.xMm,zMm:anchor.zMm};
 const r=rotateResolved(initial,'rot-p',30);
 assert.equal(r.yawDeg,30);assert.equal(r.boundaryLimited,undefined);assert.equal(r.wallAdjusted,true);
 assert.ok(r.x<anchor.xMm,'Right-wall rotation requires actual inward movement');
 if(corner)assert.ok(r.z<anchor.zMm,'Corner rotation must also retreat from the second wall');
 const back=rotateResolved(r.state,'rot-p',anchor.yawDeg,{snapDeg:0,anchorPointMm,targetLocalYawDeg:initial.printers[0].attachment.yawDeg});
 assert.equal(S.serializeLayout(back.state,rotationCat),S.serializeLayout(initial,rotationCat),'Inverse anchored turn must restore exact x/z/yaw');
});
for(const parentYaw of [0,37.5,90])for(const corner of [false,true])await test(`rotation-support-${corner?'corner':'edge'}-wall-assist-and-anchored-return-${parentYaw}`,()=>{
 const desk=S.createDesk({id:'rot-desk',widthMm:1000.25,depthMm:600.25,pose:{xMm:100.25,zMm:-200.125,yawDeg:parentYaw}});
 const attachment={parentId:desk.id,surfaceId:'top',xMm:400.125,zMm:corner?250.125:0.375,yawDeg:0};
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[desk],printers:[rotationPrinter('rotation-small',attachment)]},rotationCat);
 const origin=S.worldTransform(initial,'rot-p',rotationCat),anchorPointMm={xMm:origin.xMm,zMm:origin.zMm};
 const r=rotateResolved(initial,'rot-p',parentYaw+30,{snapDeg:0,targetLocalYawDeg:30});
 assert.equal(r.yawDeg,parentYaw+30);assert.equal(r.boundaryLimited,undefined);assert.equal(r.wallAdjusted,true);
 assert.deepEqual(r.state.furniture,initial.furniture,'Supported rotation cannot move the parent');
 const a=r.state.printers[0].attachment;
 assert.equal(a.parentId,attachment.parentId);assert.equal(a.surfaceId,attachment.surfaceId);assert.equal(a.yawDeg,30);
 assert.ok(a.xMm<attachment.xMm);if(corner)assert.ok(a.zMm<attachment.zMm);
 assert.ok(G.polygonContains(G.rectangle(desk.widthMm,desk.depthMm),G.transformPolygon(rotationCat.byId['rotation-small'].footprintMm,a)),'Actual parent-local footprint must remain contained');
 const back=rotateResolved(r.state,'rot-p',origin.yawDeg,{snapDeg:0,anchorPointMm,anchorLocalPointMm:{xMm:attachment.xMm,zMm:attachment.zMm},targetLocalYawDeg:0});
 assert.equal(back.yawDeg,origin.yawDeg);assert.deepEqual(back.state.furniture,initial.furniture);
 // Exact local restoration is an independent check, not an allowance for an
 // outside contact. World/parent roundtrips must not erase a true overhang.
 assert.deepEqual(back.state.printers[0].attachment,attachment,'Anchored support reversal must retain fractional source attachment');
});
for(const xMm of [0,1690])await test(`rotation-peer-only-block-never-causes-room-retreat-${xMm}`,()=>{
 const peer={...rotationPrinter('rotation-small',{xMm,zMm:-250}),id:'peer'};
 const initial=S.createDefaultLayout({printers:[rotationPrinter('rotation-long',{xMm}),peer]},rotationCat);
 const origin=S.worldTransform(initial,'rot-p',rotationCat),poly=rotationCat.byId['rotation-long'].footprintMm;
 assert.equal(C.rigidMotionStaysInside(initial.room.polygonMm,poly,origin,{...origin,yawDeg:90}),true,'Independent room-only sweep is clear');
 const r=rotateResolved(initial,'rot-p',90);
 assert.equal(r.boundaryLimited,true);assert.equal(r.wallAdjusted,undefined);assert.equal(r.x,xMm);assert.equal(r.z,0);
 assert.ok(r.yawDeg>0&&r.yawDeg<90);assert.deepEqual(r.state.printers.find(p=>p.id==='peer'),peer);
 const end=S.worldTransform(r.state,'rot-p',rotationCat),obstacle=S.worldTransform(r.state,'peer',rotationCat);
 assert.equal(G.polygonsOverlap(end.worldEnvelopeMm,obstacle.worldEnvelopeMm),false,'Clipped turn cannot overlap the actual peer footprint');
 assert.deepEqual(rotateResolved(r.state,'rot-p',0).state,initial);
});
for(const signedTurn of [90,-720,720,-1080,1080])await test(`rotation-required-inward-retreat-blocked-by-peer-stays-atomic-${signedTurn}`,()=>{
 const cat=S.createCatalog([{id:'moving',widthMm:200,depthMm:100,heightMm:300},{id:'stop',widthMm:10,depthMm:400,heightMm:300}]);
 const peer={...rotationPrinter('stop',{xMm:795}),id:'peer'};
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:2000,depthMm:2000}),printers:[rotationPrinter('moving',{xMm:900}),peer]},cat);
 assert.deepEqual(S.validatePlacement(initial,cat),[],'Peer touches the left source edge without initial overlap');
 throwsCode(()=>S.applyWorldMove(initial,{id:'rot-p',xMm:899,zMm:0},cat),'ENVELOPE_OVERLAP');
 const r=rotateResolved(initial,'rot-p',signedTurn,{snapDeg:0},cat);
 assert.equal(r.boundaryLimited,true);assert.equal(r.wallAdjusted,undefined);assert.equal(r.x,900);assert.equal(r.z,0);
 assert.ok(Math.sign(signedTurn)*r.yawDeg>=0&&Math.abs(r.yawDeg)<1e-9,'Blocked retreat cannot unlock an unproved signed turn even when a repeated-turn endpoint fits');
 assert.deepEqual(r.state.printers.find(p=>p.id==='peer'),peer);
});
for(const signedTurn of [-1080,-720,-360,-90,90,360,720,1080])await test(`rotation-wall-assist-fractional-signed-anchored-ABA-${signedTurn}`,()=>{
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:2000.25,depthMm:2000}),printers:[rotationPrinter('rotation-small',{xMm:890.125,zMm:-0.375,yawDeg:0.1})]},rotationCat);
 const saved=S.serializeLayout(initial,rotationCat),origin=S.worldTransform(initial,'rot-p',rotationCat),anchorPointMm={xMm:origin.xMm,zMm:origin.zMm};
 let state=initial;
 for(let repeat=0;repeat<3;repeat++){
  const target=origin.yawDeg+signedTurn;
  const r=rotateResolved(state,'rot-p',target,{snapDeg:0,anchorPointMm,targetLocalYawDeg:target});
  assert.equal(r.yawDeg,target);assert.equal(r.boundaryLimited,undefined);assert.equal(r.wallAdjusted,true);
  const loaded=S.parseLayout(S.serializeLayout(r.state,rotationCat),rotationCat);
  const back=rotateResolved(loaded,'rot-p',origin.yawDeg,{snapDeg:0,anchorPointMm,targetLocalYawDeg:0.1});
  assert.equal(S.serializeLayout(back.state,rotationCat),saved,'Signed inverse must restore the full fractional source pose without drift');state=back.state;
 }
});
for(const snapDeg of [1,15])for(const direction of [-1,1])await test(`rotation-snapped-origin-restores-exact-native-fraction-${snapDeg}-${direction}`,()=>{
 const desk=S.createDesk({id:'snap-desk',widthMm:1200,depthMm:900,pose:{xMm:100.25,zMm:-200.125,yawDeg:37.5}});
 const attachment={parentId:desk.id,surfaceId:'top',xMm:123.456,zMm:-23.75,yawDeg:0.1};
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[desk],printers:[rotationPrinter('rotation-small',attachment)]},rotationCat);
 const origin=S.worldTransform(initial,'rot-p',rotationCat),saved=S.serializeLayout(initial,rotationCat);
 assert.notEqual(origin.yawDeg-desk.pose.yawDeg,attachment.yawDeg,'Fixture must expose loss of native yaw bits in world-parent subtraction');
 const options={snapDeg,snapOrigin:origin.yawDeg,anchorPointMm:{xMm:origin.xMm,zMm:origin.zMm},anchorLocalPointMm:{xMm:attachment.xMm,zMm:attachment.zMm}};
 const away=rotateResolved(initial,'rot-p',origin.yawDeg+30,{...options,targetLocalYawDeg:30.1});
 const raw=origin.yawDeg+direction*snapDeg/4;assert.notEqual(raw,origin.yawDeg);
 const back=rotateResolved(away.state,'rot-p',raw,{...options,targetLocalYawDeg:attachment.yawDeg});
 assert.equal(back.yawDeg,origin.yawDeg);assert.equal(back.state.printers[0].attachment.yawDeg,attachment.yawDeg);
 assert.equal(S.serializeLayout(back.state,rotationCat),saved,'A raw angle snapping to the origin must restore exact native x/z/yaw');
});
for(const parentYaw of [0,37.5,90])await test(`rotation-support-sweep-not-only-room-${parentYaw}`,()=>{
 const desk=S.createDesk({id:'rot-desk',widthMm:660,depthMm:660,pose:{xMm:400,zMm:300,yawDeg:parentYaw}});
 const initial=S.createDefaultLayout({furniture:[desk],printers:[rotationPrinter('rotation-wide',{parentId:desk.id,surfaceId:'top'})]},rotationCat);
 const r=rotateResolved(initial,'rot-p',parentYaw+90);assert.equal(r.boundaryLimited,true);assert.ok(r.yawDeg>parentYaw&&r.yawDeg<parentYaw+45);
 assert.deepEqual(r.state.furniture,initial.furniture);
});
await test('rotation-concave-reflex-notch-has-safe-endpoints-but-unsafe-interior',()=>{
 const room=S.createRoomL(),initial=S.createDefaultLayout({room,printers:[rotationPrinter('rotation-long',{xMm:-200,zMm:-200})]},rotationCat);
 const poly=rotationCat.byId['rotation-long'].footprintMm;
 assert.ok(G.polygonContains(room.polygonMm,G.transformPolygon(poly,{xMm:-200,zMm:-200,yawDeg:-90})));
 assert.equal(G.polygonContains(room.polygonMm,G.transformPolygon(poly,{xMm:-200,zMm:-200,yawDeg:-45})),false);
 // An independently chosen bottom-left retreat has a complete valid path;
 // the unsafe fixed-centre arc must not imply that every assisted turn fails.
 const from={xMm:-200,zMm:-200,yawDeg:0},away={xMm:-400,zMm:-400,yawDeg:0},turned={...away,yawDeg:-90},end={...from,yawDeg:-90};
 for(const [a,b]of[[from,away],[away,turned],[turned,end]])assert.equal(C.rigidMotionStaysInside(room.polygonMm,poly,a,b),true,'Independent concave three-leg witness must be continuously contained');
 const r=rotateResolved(initial,'rot-p',-90);assert.equal(r.yawDeg,-90);assert.equal(r.boundaryLimited,undefined);assert.equal(r.wallAdjusted,true);
 assert.deepEqual(rotateResolved(r.state,'rot-p',0,{snapDeg:0,anchorPointMm:{xMm:-200,zMm:-200},targetLocalYawDeg:0}).state,initial);
});
await test('rotation-uses-catalog-footprint-not-inflated-width-depth-box',()=>{
 const cat=S.createCatalog([{id:'tri',widthMm:200,depthMm:200,heightMm:300,footprintMm:[[-50,-50],[50,-50],[-50,50]]}]);
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:150,depthMm:150}),printers:[rotationPrinter('tri')]},cat);
 const r=rotateResolved(initial,'rot-p',360,{snapDeg:0},cat);assert.equal(r.yawDeg,360);assert.equal(r.boundaryLimited,undefined);
});
await test('rotation-pending-accepted-state-roundtrip-retains-turn-count-and-exact-reset',()=>{
 const initial=rotationState('rotation-long',12.25);let r=rotateResolved(initial,'rot-p',402.25,{snapDeg:15,snapOrigin:12.25});
 const loaded=S.parseLayout(S.serializeLayout(r.state,rotationCat),rotationCat);assert.deepEqual(loaded,r.state);
 r=rotateResolved(loaded,'rot-p',12.25,{snapDeg:15,snapOrigin:12.25});assert.deepEqual(r.state,initial);
});
await test('rotation-off-grid-wall-contact-continued-pressure-does-not-snap-backward',()=>{
 const initial=rotationState('rotation-wide',0,S.createRoomRect({widthMm:700,depthMm:1000}));
 const contact=rotateResolved(initial,'rot-p',90,{snapDeg:15,snapOrigin:0});assert.equal(contact.boundaryLimited,true);
 assert.equal(contact.pointerRemainderDeg,undefined,'Do not re-add a signed snap residual at an off-grid boundary');
 assert.ok(contact.yawDeg>15&&contact.yawDeg<22.5,'Fixture must stop between grid15 and the22.5 midpoint');
 let state=contact.state;
 for(const raw of [contact.yawDeg+.5,contact.yawDeg+1,contact.yawDeg+2,contact.yawDeg+6]){
  const r=rotateResolved(state,'rot-p',raw,{snapDeg:15,snapOrigin:0});
  assert.ok(r.yawDeg>=contact.yawDeg,'Outward pointer pressure must not turn backward to the previous snap');state=r.state;
 }
 const reverse=rotateResolved(state,'rot-p',contact.yawDeg-.5,{snapDeg:15,snapOrigin:0});assert.equal(reverse.yawDeg,15);
});
await test('rotation-invalid-inputs-and-legacy-overhang-reject-without-source-mutation',()=>{
 const initial=rotationState(),saved=S.serializeLayout(initial,rotationCat);
 for(const input of [null,[],{}, {id:'missing',yawDeg:90},{id:'rot-p',yawDeg:NaN},{id:'rot-p',yawDeg:Infinity},{id:'rot-p',yawDeg:'90'}, {id:'rot-p',yawDeg:90,other:1}])
  assert.equal(S.resolveWorldRotation(initial,input,rotationCat),false);
 for(const options of [null,[],{snapDeg:-1},{snapDeg:NaN},{snapDeg:361},{snapOrigin:{yawDeg:0}},{snapOrigin:Infinity},{unknown:1},
  {anchorPointMm:[]},{anchorPointMm:{xMm:0}},{anchorPointMm:{zMm:0}},{anchorPointMm:{xMm:'0',zMm:0}},
  {anchorPointMm:{xMm:NaN,zMm:0}},{anchorPointMm:{xMm:0,zMm:Infinity}},
  {anchorPointMm:{xMm:S.LIMITS.maxCoordinateMm+1,zMm:0}},{anchorPointMm:{xMm:0,zMm:-S.LIMITS.maxCoordinateMm-1}},
  {anchorPointMm:{xMm:0,zMm:0,unexpected:1}},{anchorPointMm:new Date(0)},
  {targetLocalYawDeg:'90'},{targetLocalYawDeg:NaN},{targetLocalYawDeg:Infinity},{targetLocalYawDeg:{}},
  {targetLocalYawDeg:S.LIMITS.maxYawDeg+1},{targetLocalYawDeg:-S.LIMITS.maxYawDeg-1},{targetLocalYawDeg:89}])
  assert.equal(S.resolveWorldRotation(initial,{id:'rot-p',yawDeg:90},rotationCat,options),false);
 const explicitNulls=rotateResolved(initial,'rot-p',90,{snapDeg:0,anchorPointMm:null,targetLocalYawDeg:null});assert.equal(explicitNulls.yawDeg,90);
 const valid=rotateResolved(initial,'rot-p',90,{snapDeg:0,anchorPointMm:{xMm:0,zMm:0},targetLocalYawDeg:90});assert.equal(valid.yawDeg,90);
 const bad=clone(initial);bad.printers[0].attachment.xMm=5000;assert.equal(S.resolveWorldRotation(bad,{id:'rot-p',yawDeg:90},rotationCat),false);
 assert.equal(S.serializeLayout(initial,rotationCat),saved);
});
await test('rotation-native-anchor-requires-valid-shape-parent-and-exact-world-forward-image',()=>{
 const desk=S.createDesk({id:'anchor-desk',widthMm:1000,depthMm:600,pose:{xMm:100.25,zMm:-200.125,yawDeg:37.5}});
 const attachment={parentId:desk.id,surfaceId:'top',xMm:23.125,zMm:-7.375,yawDeg:0};
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:[desk],printers:[rotationPrinter('rotation-small',attachment)]},rotationCat);
 const saved=S.serializeLayout(initial,rotationCat),origin=S.worldTransform(initial,'rot-p',rotationCat);
 const anchorPointMm={xMm:origin.xMm,zMm:origin.zMm},anchorLocalPointMm={xMm:attachment.xMm,zMm:attachment.zMm};
 const input={id:'rot-p',yawDeg:67.5},valid={snapDeg:0,anchorPointMm,anchorLocalPointMm,targetLocalYawDeg:30};
 assert.equal(rotateResolved(initial,'rot-p',input.yawDeg,valid).yawDeg,input.yawDeg);
 for(const native of [[],{},new Date(0),{xMm:23.125},{zMm:-7.375},{xMm:'23.125',zMm:-7.375},
  {xMm:NaN,zMm:-7.375},{xMm:23.125,zMm:Infinity},{xMm:S.LIMITS.maxCoordinateMm+1,zMm:0},
  {xMm:23.125,zMm:-S.LIMITS.maxCoordinateMm-1},{...anchorLocalPointMm,unexpected:true},
  {...anchorLocalPointMm,xMm:attachment.xMm+1},{...anchorLocalPointMm,zMm:attachment.zMm-1}])
  assert.equal(S.resolveWorldRotation(initial,input,rotationCat,{...valid,anchorLocalPointMm:native}),false,'Invalid/mismatched native anchor must reject');
 assert.equal(S.resolveWorldRotation(initial,input,rotationCat,{...valid,anchorPointMm:null}),false,'Native anchor requires its world image');
 assert.equal(S.resolveWorldRotation(initial,input,rotationCat,{...valid,anchorPointMm:{...anchorPointMm,xMm:origin.xMm+1e-9}}),false,'World/native mismatch is not waived by a tolerance');
 const floor=rotationState();
 assert.equal(S.resolveWorldRotation(floor,{id:'rot-p',yawDeg:30},rotationCat,{snapDeg:0,anchorPointMm:{xMm:0,zMm:0},anchorLocalPointMm:{xMm:0,zMm:0}}),false,'Floor printer cannot claim an unrelated support-local anchor');
 assert.equal(S.serializeLayout(initial,rotationCat),saved);
});

for(const p of inputPaths)assert.deepEqual(pin(p),before.get(p),'State test mutated actual source inputs');
const wallReport={status:failures.length?'FAIL':'PASS',cases,failures,wallWarmTimings,wallCallCount:wallTimes.length,sourceInputs:Object.fromEntries(before),scope:'Independent synthetic source planning-footprint and actual app transaction regressions. No browser/models/native-fit claim.'};const wallReportArg=process.argv.indexOf('--report');if(wallReportArg>=0)fs.writeFileSync(process.argv[wallReportArg+1],JSON.stringify(wallReport,null,2)+'\n',{flag:'wx'});
assert.deepEqual(failures,[],'State/geometry regressions');
console.log(JSON.stringify({status:'PASS',scope:'State/math and actual registered catalog/index binding only; dimensions are planning inputs, not actual full-scene or native-fit evidence.',cases:cases.length,registeredMachines:machineCases.length,previewTimingMs:timings,stateSHA256:pin(inputPaths[0]).sha256,geometrySHA256:pin(inputPaths[1]).sha256,catalogSHA256:pin(catalogFile).sha256,indexSHA256:pin(indexFile).sha256}));
