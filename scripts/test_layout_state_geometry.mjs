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
const inputPaths=['layout-state.mjs','layout-geometry.mjs','layout-catalog.json'].map(n=>path.join(src,n));
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
 anchored=S.createDefaultLayout({furniture:[S.createDesk({pose:{xMm:1000,zMm:2000,yawDeg:90}})],
  printers:[p('p1','fixture600',{parentId:'desk-1',surfaceId:'top',xMm:100,zMm:50,yawDeg:15})]},fixture);
 const a=S.worldTransform(anchored,'p1',fixture);
 assert.equal(a.xMm,1050);assert.equal(a.zMm,1900);assert.equal(a.yawDeg,105);assert.equal(a.supportYM,.75);assert.equal(a.positionM.y,.775);
 assert.equal(a.verticalRangeMm[0],750);assert.equal(a.verticalRangeMm[1],1200);
});
await test('parent-min-max-mid-reversed-and-ABA-no-double-transform',()=>{
 const before=S.serializeLayout(anchored,fixture);let value=anchored;
 for(const [x,z,yaw] of [[-1000000,-1000000,-360000],[1000000,1000000,360000],[500,-750,180],[0,0,-90],[1000,2000,90]]){
  value=S.applyAction(value,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{xMm:x,zMm:z,yawDeg:yaw}}},fixture);
  assert.deepEqual(value.printers[0].attachment,anchored.printers[0].attachment);
  const world=S.worldTransform(value,'p1',fixture),local=G.rotateXZ([100,50],yaw);
  near(world.xMm,x+local[0]);near(world.zMm,z+local[1]);
 }
 assert.equal(S.serializeLayout(value,fixture),before);assert.equal(S.serializeLayout(anchored,fixture),before);
});
await test('resize-keeps-local-printer-and-reports-overhang',()=>{
 const next=S.applyAction(anchored,{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:300,depthMm:300,heightMm:900}},fixture);
 assert.equal(next.printers.length,1);assert.deepEqual(next.printers[0].attachment,anchored.printers[0].attachment);
 assert.equal(S.worldTransform(next,'p1',fixture).supportYM,.9);
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
for(const p of inputPaths)assert.deepEqual(pin(p),before.get(p),'State test mutated actual source inputs');
assert.deepEqual(failures,[],'State/geometry regressions');
console.log(JSON.stringify({status:'PASS',scope:'State/math and actual registered catalog/index binding only; dimensions are planning inputs, not actual full-scene or native-fit evidence.',cases:cases.length,registeredMachines:machineCases.length,stateSHA256:pin(inputPaths[0]).sha256,geometrySHA256:pin(inputPaths[1]).sha256,catalogSHA256:pin(catalogFile).sha256,indexSHA256:pin(indexFile).sha256}));
