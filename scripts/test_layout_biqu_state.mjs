// Independent canonical BIQU replacement state/UI sidecar. Node heap: 384 MiB.
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
const started=performance.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
const files = ['layout-app.mjs','layout-state.mjs','layout-geometry.mjs','layout-constraints.mjs',
  'layout-collision.mjs','layout-placement.mjs','layout-groups.mjs','layout-clipboard.mjs',
  'layout-group-data.mjs','layout-group-labels.mjs','layout-ui.mjs','layout-i18n.mjs',
  'layout-equipment.mjs','layout-equipment-transfer.mjs','layout-equipment-preview.mjs',
  'layout-machine-loader.mjs','layout-renderer.mjs','layout-biqu-popstation.mjs','layout-popstation-feet.mjs','layout-catalog.json'];
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
const TYPE = 'popstation_mini', SOURCE_TYPE = 'popstation_mini_biqu_v1', SOURCE_ID = 'biqu_popstation_mini_cad_v1';
// Bare supplied geometry remains immutable. Only the installed layout includes
// separately identified exterior pad references and a rigid source-body lift.
const BARE_DIMS = Object.freeze({widthMm:423.10022712374223,depthMm:478.28293730922826,heightMm:417.40023949665624});
const DIMS = Object.freeze({...BARE_DIMS,heightMm:428.00023949665626});
const BARE_TOP_MM = 412.1002393966562, TOP_MM = 422.7002393966562, BODY_LIFT_M = .0106, INSTALLED_VARIANT = 'standard-feet';
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

// Historical input bytes stay pinned. The explicit replacement request changes
// its expected output, not the legacy fixture or the unchanged U1 reference.
const legacyFixture={format:'3d-print-rig-layout',version:1,units:'mm',room:{
  polygonMm:[[-3000,-2500],[3000,-2500],[3000,2500],[-3000,2500]],wallHeightMm:2400,appearance:{wall:'paint',floor:'oak'}},
  furniture:[{id:'legacy-pop',type:'popstation_mini',widthMm:422,depthMm:456,heightMm:428,pose:pose(-900,123.125,37.5)}],
  printers:[{id:'legacy-u1',machineId:'snapmaker_u1_layout_reference',configurationId:'saved:u1?profile=layout',
    attachment:{parentId:'legacy-pop',surfaceId:'top',...pose()}}]};
const legacyBytes=JSON.stringify(legacyFixture,null,2);
const migratedFixture=clone(legacyFixture);Object.assign(migratedFixture.furniture[0],DIMS);
const migratedBytes=JSON.stringify(migratedFixture,null,2);
await test('legacy golden JSON migrates only cabinet dimensions while preserving IDs, pose and U1 attachment',()=>{
  assert.equal(sha(legacyBytes),'79012a139ac7fc6cc6593e68082f79f5deefba283d71905178e70a29861aa662','Literal fixture drift');
  const state=S.parseLayout(legacyBytes,catalog);
  assert.equal(encode(state),migratedBytes);assert.notEqual(encode(state),legacyBytes);
  fixed(state.furniture[0]);assert.deepEqual(state.furniture[0].pose,legacyFixture.furniture[0].pose);
  assert.deepEqual(state.printers,legacyFixture.printers);assert.deepEqual(S.getPopStationMigrations(state),['legacy-pop']);
  assert(Object.isFrozen(S.getPopStationMigrations(state)));assert(Object.isFrozen(state.furniture[0].pose));
  assert.deepEqual(S.createPopStation({id:'legacy-pop',pose:pose(-900,123.125,37.5)}),migratedFixture.furniture[0]);
  assert.equal(S.POPSTATION_MINI.type,TYPE);for(const [key,value]of Object.entries(DIMS))assert.equal(S.POPSTATION_MINI[key],value);
  assert.equal(S.POPSTATION_MINI.topMm,TOP_MM);
  assert.equal(digest(S.resolvePrinterEquipment(state,'legacy-u1',catalog)),'7e599137fe7e31b86b51b27a1783800b27f31db97c20d57b561269fb9ef78eae');
  const top=S.getSurface(state,'legacy-pop','top');assert.equal(top.heightMm,TOP_MM);assert.equal(top.fixedMount,true);assert.equal(top.capacity,1);
  close(S.worldTransform(state,'legacy-u1',catalog).positionM.y,TOP_MM/1000,1e-15);clean(state);
  const reloaded=S.parseLayout(encode(state),catalog);assert.equal(encode(reloaded),migratedBytes);assert.deepEqual(S.getPopStationMigrations(reloaded),[]);
});
await test('default-layout and parse ingress migrate both saved kinds, preserving groups and source input',()=>{
  const fixture=clone(legacyFixture),supplied={id:'supplied-pop',type:SOURCE_TYPE,...BARE_DIMS,pose:pose(1400,-400,-810)};
  fixture.furniture.push(supplied);
  fixture.groups=[{id:'saved-group',name:'Saved cabinets',pose:pose(),originPose:pose(),memberIds:['legacy-pop','supplied-pop'],
    memberPoses:fixture.furniture.map(f=>({id:f.id,pose:clone(f.pose)}))}];
  const original=JSON.stringify(fixture),expected=clone(fixture);for(const f of expected.furniture)Object.assign(f,{type:TYPE},DIMS);
  for(const state of [S.parseLayout(original,catalog),S.createDefaultLayout(fixture,catalog)]){
    assert.deepEqual(state.furniture,expected.furniture);assert.deepEqual(state.printers,fixture.printers);assert.deepEqual(state.groups,fixture.groups);
    assert.deepEqual(S.getPopStationMigrations(state),['legacy-pop','supplied-pop']);
    assert.deepEqual(G.groupEntityIds(state,'saved-group'),['legacy-pop','supplied-pop','legacy-u1']);clean(state);
    const serialized=encode(state);assert(!serialized.includes('popstation_mini_biqu_v1'));assert(!serialized.includes('popStationMigrations'));
    const reloaded=S.parseLayout(serialized,catalog);assert.equal(encode(reloaded),serialized);assert.deepEqual(S.getPopStationMigrations(reloaded),[]);
  }
  assert.equal(JSON.stringify(fixture),original,'Migration must not mutate caller-owned objects');
  assert.deepEqual(S.getPopStationMigrations(S.createDefaultLayout()),[]);
});
await test('migration keeps a saved placement that becomes out of bounds and exposes its warning',()=>{
  const fixture=clone(legacyFixture);fixture.room=S.createRoomRect({widthMm:1000,depthMm:1000});fixture.printers=[];fixture.furniture[0].pose=pose(289,0,0);
  const state=S.parseLayout(JSON.stringify(fixture),catalog);fixed(state.furniture[0]);assert.deepEqual(state.furniture[0].pose,pose(289,0,0));
  assert.deepEqual(S.getPopStationMigrations(state),['legacy-pop']);assert.equal(S.validateState(state,catalog).ok,true);
  assert(S.validatePlacement(state,catalog).some(e=>e.code==='ROOM_OUT_OF_BOUNDS'&&e.entityIds.includes('legacy-pop')));
});
await test('migration is exact and rejects near-legacy sizes, obsolete supplied dimensions and unknown saved fields',()=>{
  for(const type of [TYPE,SOURCE_TYPE])for(const [key,value]of Object.entries({widthMm:422,depthMm:456,heightMm:428})){
    const hostile=clone(legacyFixture);Object.assign(hostile.furniture[0],DIMS,{type,[key]:value});
    reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));reject(()=>S.createDefaultLayout(hostile,catalog));
  }
  for(const patch of [{widthMm:422.001},{depthMm:456.001},{heightMm:428.001},{type:SOURCE_TYPE},{type:SOURCE_ID},{equipmentVariant:'loaded'},{source:{id:SOURCE_ID}}]){
    const hostile=clone(legacyFixture);Object.assign(hostile.furniture[0],patch);
    reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));reject(()=>S.createDefaultLayout(hostile,catalog));
  }
});

let sourceModule,sourceRecord,standardRecord,feetModule;
await test('supplied BIQU source identity stays independent of the single canonical furniture type',async()=>{
  sourceModule=await import(pathToFileURL(path.join(site,'layout/layout-biqu-popstation.mjs')));
  sourceRecord=sourceModule.BIQU_POPSTATION_CAD;
  assert(sourceRecord,`Missing exported source record ${SOURCE_ID}`);
  assert.equal(sourceRecord.id,SOURCE_ID);assert.equal(sourceRecord.type,SOURCE_TYPE);assert.notEqual(sourceRecord.type,TYPE);
  assert.deepEqual(sourceRecord.dimensionsMm,{width:BARE_DIMS.widthMm,depth:BARE_DIMS.depthMm,height:BARE_DIMS.heightMm});
  assert.deepEqual(sourceRecord.rootPivotM,[0,0,0]);assert.deepEqual(sourceRecord.fullScene.normalizationFrame,{units:'m',up:'+Y',front:'+Z',rootPivotM:[0,0,0]});
  assert.equal(sourceRecord.proxy.kind,'manufacturer-cad-source-triangles');assert.equal(sourceRecord.proxy.appendGenericPrinterCues,false);
  assert.equal(sourceRecord.source.sourceInstances,70);assert.equal(sourceRecord.source.sourceDefinitions,30);assert.equal(sourceRecord.source.sourcePartsRemoved,0);
  assert.equal(sourceRecord.supportYM*1000,BARE_TOP_MM);assert.equal(sourceRecord.equipmentVariant,'supplied');assert.deepEqual(sourceRecord.equipmentVariants,['supplied']);
  assert.equal(sourceRecord.manufacturerCAD,true);assert.equal(sourceRecord.footReference,undefined,'Reference pads must not be merged into the bare manufacturer source');
  assert.deepEqual(sourceRecord.source.supportsRemoved,[]);assert.equal(sourceRecord.privateSourceDerived,true);
  assert.equal(E.getLayoutEquipment(SOURCE_ID,'supplied').id,SOURCE_ID);assert(Object.isFrozen(sourceRecord));
  for(const variant of ['empty','loaded','standalone','docked'])assert.throws(()=>E.getLayoutEquipment(SOURCE_ID,variant),e=>e.code==='LAYOUT_UNKNOWN_EQUIPMENT_VARIANT');
  const source=sourceRecord.source,model=sourceRecord.model,preview=sourceRecord.preview;
  for(const receipt of [source,model,preview]){assert.match(receipt.sha256,/^[0-9a-f]{64}$/);assert(receipt.bytes>0);}
  assert.equal(model.sha256,'cd531f04bf1db39af6826aa658fe30a2e9efaafd1209e5d61ff4548c4970c83b');assert.equal(model.bytes,1347856);
  assert.equal(preview.sha256,'f7ae02fccb83c655c4784af5736eec59fb4064ca4e5f714846f7b88f34f3ab6c');assert.equal(preview.bytes,9549487);
  assert.equal(preview.vertices,79824);assert.equal(preview.triangles,82048);
  assert.deepEqual(preview.arrays,{
    positionsM:{bytes:957888,sha256:'c995a62cf8e79745c1114313b1dc28abd01415d2d03784968fd28e1070ef8d66'},
    normals:{bytes:957888,sha256:'9914dec9221789934d4f0e2ab2b238b3e69a92e8cb06682a0bef9ddea71f910b'},
    indices:{bytes:984576,sha256:'436b549dbd7af9f115b5ac904df926990d952c7d83401abb47057e8e40ca8306'}});
  assert.equal(preview.sourceLeaves.sha256,'c0912c131610ca812ba94ecbb7104ee3e76cbe9b5f1e40ea31903a45817194ae');
  observations.push({sourceSha256:source.sha256,modelSha256:model.sha256,previewSha256:preview.sha256,
    reviewed:'Original 70-leaf model/preview identity and array receipt pins only; actual supplier bytes and arrays were not loaded or re-audited.'});
});
await test('installed standard-feet descriptor keeps the bare source separate and marks pads as unqualified references',async()=>{
  assert(sourceModule);standardRecord=sourceModule.BIQU_POPSTATION_STANDARD;
  feetModule=await import(pathToFileURL(path.join(site,'layout/layout-popstation-feet.mjs')));
  const feet=feetModule.POPSTATION_STANDARD_FEET;
  assert(standardRecord);assert.equal(standardRecord.id,SOURCE_ID);assert.equal(standardRecord.type,SOURCE_TYPE);
  assert.equal(standardRecord.equipmentVariant,INSTALLED_VARIANT);assert.deepEqual(standardRecord.equipmentVariants,[INSTALLED_VARIANT]);
  assert.deepEqual(standardRecord.dimensionsMm,{width:DIMS.widthMm,depth:DIMS.depthMm,height:DIMS.heightMm});
  close(standardRecord.supportYM*1000,TOP_MM,1e-12);close(standardRecord.supportYM-sourceRecord.supportYM,BODY_LIFT_M,1e-15);
  assert.equal(standardRecord.manufacturerCAD,false);assert.equal(standardRecord.manufacturerBodyCAD,true);
  for(const key of ['model','preview','source','proxy'])assert.equal(standardRecord[key],sourceRecord[key],`Installed ${key} must retain the original body identity`);
  assert.deepEqual(standardRecord.rootPivotM,[0,0,0]);assert.deepEqual(standardRecord.fullScene.normalizationFrame,sourceRecord.fullScene.normalizationFrame);
  assert.equal(standardRecord.footReference.bodyLiftM,BODY_LIFT_M);assert.deepEqual(standardRecord.footReference,feet);
  assert.equal(feet.count,4);assert.equal(feet.centersXZ.length,4);assert.equal(new Set(feet.centersXZ.map(p=>p.join(','))).size,4);
  assert.equal(feet.manufacturerCAD,false);assert.equal(feet.physicalMountingVerified,false);assert(Object.isFrozen(feet));
  assert(Object.isFrozen(feet.centersXZ));for(const center of feet.centersXZ){assert(Object.isFrozen(center));assert.equal(center.length,2);finiteTree(center);}
  assert.match(feet.scope,/reference estimates/i);assert.match(feet.scope,/not supplied CAD/i);assert(feet.sources.length>=2);
  for(const url of feet.sources)assert.equal(new URL(url).protocol,'https:');
  for(const name of ['createPopStationFootGeometry','addPopStationFootPads','assemblePopStationStandardFeet'])assert.equal(typeof feetModule[name],'function');
  assert.equal(E.getLayoutEquipment(SOURCE_ID,INSTALLED_VARIANT).equipmentVariant,INSTALLED_VARIANT);
  assert.equal(E.getLayoutEquipment(SOURCE_ID,'supplied').manufacturerCAD,true);
  assert.equal(feetModule.assemblePopStationStandardFeet(null,{},sourceRecord),null,'Bare supplied variant must not invoke the pad assembler');
  assert.notEqual(DIMS.heightMm,BARE_DIMS.heightMm);close(DIMS.heightMm-BARE_DIMS.heightMm,BODY_LIFT_M*1000,1e-12);
  observations.push({case:'bare versus installed cabinet',bareHeightMm:BARE_DIMS.heightMm,installedHeightMm:DIMS.heightMm,
    bareTopMm:BARE_TOP_MM,installedTopMm:TOP_MM,bodyLiftM:BODY_LIFT_M,padCount:4,padManufacturerCAD:false,
    scope:'Descriptor, source routing and producer separation only. Profile, bore and placement are reference estimates; residual U1 foot gaps, load, threads and physical mounting remain unqualified.'});
});
await test('BIQU preview discovery follows native layouts/clipboard/groups without downloading or invoking accessors',async()=>{
  assert(sourceModule,'Source module unavailable');const preview=await import(binding('layout-equipment-preview.mjs'));
  const state=plan(),template=C.captureLayoutClipboard(state,['biqu'],catalog),group=G.createGroup(state,{id:'preview-group',name:'BIQU',memberIds:['biqu']},catalog);
  for(const value of [state,{kind:TYPE},{type:SOURCE_TYPE},{template},group,G.captureGroupTemplate(group,'preview-group',catalog)]){
    assert.equal(sourceModule.needsBiquPreview(value),true);assert.equal(preview.needsEquipmentPreview(value),true);
  }
  assert.equal(sourceModule.needsBiquPreview({id:SOURCE_ID}),true,'Source helper recognizes its immutable source record');
  assert.equal(preview.needsEquipmentPreview({id:SOURCE_ID}),false,'Source ID alone is not a Layout DTO; do not scan catalog records as placed furniture');
  assert.equal(sourceModule.needsBiquPreview({type:'desk'}),false);assert.equal(sourceModule.needsBiquPreview(S.createDefaultLayout()),false);
  const cycle={};cycle.self=cycle;Object.defineProperty(cycle,'trap',{enumerable:true,get(){throw Error('Saved data getter must not execute');}});
  assert.equal(sourceModule.needsBiquPreview(cycle),false);assert.equal(sourceModule.isBiquPreviewPrepared(),false);
  assert.deepEqual(sourceRecord.proxy.parts,[],'State/UI tests must not download or fabricate mesh parts');
});
await test('constructor is fixed-size, detached from caller input and floor normalized',()=>{
  const input=pose(123.125,-234.375,37.5),f=cabinet('biqu',input);fixed(f);
  assert.deepEqual(f,S.createPopStation({id:'biqu',pose:input}),'Compatibility constructor must alias the canonical constructor');
  input.xMm=999;assert.equal(f.pose.xMm,123.125);assert(Object.isFrozen(f));assert(Object.isFrozen(f.pose));
  const state=plan({furniture:[f]}),world=S.worldTransform(state,f.id,catalog);
  fixed(world);assert.equal(world.positionM.y,0);assert.deepEqual(world.verticalRangeMm,[0,DIMS.heightMm]);
  assert.equal(world.positionM.x,.123125);assert.equal(world.positionM.z,-.234375);finiteTree(S.deriveScene(state,catalog));clean(state);
  assert.equal(world.equipmentVariant,INSTALLED_VARIANT);assert.deepEqual(S.getPopStationMigrations(state),[]);
});
await test('both accepted placement kinds create the same canonical cabinet instead of a second furniture product',()=>{
  for(const kind of [TYPE,SOURCE_TYPE]){
    const result=P.proposePlacement(S.createDefaultLayout({},catalog),{kind,id:'canonical-add',...pose(123.125,-234.375,37.5),snapMm:0},catalog);
    assert.equal(result.valid,true);assert.equal(result.state.furniture.length,1);fixed(result.state.furniture[0]);
    assert.equal(S.deriveScene(result.state,catalog).furniture[0].equipmentVariant,INSTALLED_VARIANT);
    const text=encode(result.state);assert(!text.includes(SOURCE_TYPE));assert.equal(encode(S.parseLayout(text,catalog)),text);
  }
});
await test('old bare-kind copies and direct ADD_FURNITURE normalize before placement sizing without changing their input',()=>{
  for(const record of [{id:'bare-copy',type:SOURCE_TYPE,...BARE_DIMS,pose:pose(123.125,-234.375,37.5)},
    {...clone(legacyFixture.furniture[0]),id:'legacy-copy'}]){
    const destination=S.createDefaultLayout({},catalog),saved=encode(destination),original=JSON.stringify(record);
    const added=S.applyAction(destination,{type:'ADD_FURNITURE',furniture:record},catalog);fixed(added.furniture[0]);
    assert.equal(added.furniture[0].id,record.id);assert.deepEqual(added.furniture[0].pose,record.pose);clean(added);
    assert.equal(S.deriveScene(added,catalog).furniture[0].equipmentVariant,INSTALLED_VARIANT);
    const proposed=P.proposePlacement(destination,{kind:record.type,id:'proposed-copy',copy:record,...pose(800,-500,-90),snapMm:0},catalog);
    assert.equal(proposed.valid,true);fixed(proposed.state.furniture[0]);assert.deepEqual(proposed.sizeMm,{width:DIMS.widthMm,depth:DIMS.depthMm,height:DIMS.heightMm});
    assert.deepEqual(proposed.state.furniture[0].pose,pose(800,-500,-90));assert.equal(S.deriveScene(proposed.state,catalog).furniture[0].equipmentVariant,INSTALLED_VARIANT);
    assert.equal(JSON.stringify(record),original);assert.equal(encode(destination),saved);
    record.pose.xMm=999;assert.notEqual(added.furniture[0].pose.xMm,999);assert.equal(encode(S.parseLayout(encode(added),catalog)),encode(added));
  }
  const bad={id:'invalid-bare-copy',type:SOURCE_TYPE,...BARE_DIMS,heightMm:BARE_DIMS.heightMm+.001,pose:pose()};
  const empty=S.createDefaultLayout({},catalog),original=encode(empty);
  reject(()=>S.applyAction(empty,{type:'ADD_FURNITURE',furniture:bad},catalog));
  const invalid=P.proposePlacement(empty,{kind:SOURCE_TYPE,id:bad.id,copy:bad,...pose(),snapMm:0},catalog);
  assert.equal(invalid.valid,false);assert.equal(invalid.state,null);assert.equal(encode(empty),original);
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
await test('canonical cabinet retains one fixed U1 planning surface without adding procedural solids or inventory',()=>{
  const state=plan(),scene=S.deriveScene(state,catalog),world=scene.furniture[0];
  assert.equal(scene.surfaces.filter(s=>s.parentId==='biqu').length,1);const top=S.getSurface(state,'biqu','top');
  assert.equal(top.heightMm,TOP_MM);assert.equal(top.fixedMount,true);assert.equal(top.capacity,1);
  assert.equal(world.boards.length,1);assert.equal(world.boards[0].thicknessM,0);close(world.boards[0].topYM,TOP_MM/1000,1e-15);
  for(const id of ['floor','level-1'])reject(()=>S.getSurface(state,'biqu',id));
  assert.equal(state.printers.length,0);assert.equal(scene.printers.length,0,'No invented printer/spool inventory');
  assert.equal(world.equipmentVariant,INSTALLED_VARIANT);
  const priorKind={...state,furniture:[{...state.furniture[0],...BARE_DIMS,type:SOURCE_TYPE}]};
  assert.equal(S.validateState(priorKind,catalog).ok,true);assert.equal(S.deriveScene(priorKind,catalog).furniture[0].equipmentVariant,'supplied');
  const normalized=S.parseLayout(JSON.stringify(priorKind),catalog);fixed(normalized.furniture[0]);assert.deepEqual(S.getPopStationMigrations(normalized),['biqu']);
  observations.push({case:'fixed U1 support reference',topMm:TOP_MM,scope:'Numerical planning surface only. Small noncoplanar foot gaps remain open; no manufacturer fit, attachment or load certification.'});
});
await test('valid fixed U1 attachment survives every state and clipboard ingress with unchanged docked reference',()=>{
  const state=plan({printers:[floorPrinter('printer')]}),attachment={parentId:'biqu',surfaceId:'top',...pose()},mounted={...floorPrinter('printer'),attachment};
  const fromParse=clone(state);fromParse.printers[0]=mounted;
  const template={format:'3d-print-rig-layout-set',version:1,name:'U1 reference',furniture:clone(state.furniture),printers:[mounted]};
  const decoded=C.decodeLayoutClipboard(JSON.stringify(template),catalog);fixed(decoded.furniture[0]);assert.deepEqual(decoded.printers,[mounted]);
  const accepted=[S.applyAction(state,{type:'SET_ATTACHMENT',id:'printer',attachment},catalog),
    S.applyAction(state,{type:'UPDATE_PRINTER',id:'printer',patch:{attachment}},catalog),
    S.applyAction(plan(),{type:'ADD_PRINTER',printer:mounted},catalog),S.parseLayout(JSON.stringify(fromParse),catalog),S.createDefaultLayout(fromParse,catalog)];
  for(const next of accepted){clean(next);assert.deepEqual(next.printers[0].attachment,attachment);assert.equal(S.resolvePrinterEquipment(next,'printer',catalog).equipmentVariant,'docked');
    assert.equal(S.deriveScene(next,catalog).furniture[0].equipmentVariant,INSTALLED_VARIANT);close(S.worldTransform(next,'printer',catalog).positionM.y,TOP_MM/1000,1e-15);}
  const instantiated=G.instantiateGroupTemplate(S.createDefaultLayout({},catalog),template,{id:'u1-set',...pose(1000,-300,90)},catalog);clean(instantiated);
  assert.equal(instantiated.printers.length,1);assert.equal(S.resolvePrinterEquipment(instantiated,instantiated.printers[0],catalog).equipmentVariant,'docked');
  const proposed=P.proposePlacement(plan(),{kind:'printer',id:'placed-u1',machineId:S.U1_LAYOUT_MACHINE_ID,parentId:'biqu',surfaceId:'top',xMm:1000,zMm:1000,yawDeg:90,snapMm:0},catalog);
  assert.equal(proposed.valid,true);assert.deepEqual(proposed.state.printers[0].attachment,{parentId:'biqu',surfaceId:'top',...pose()});
});
await test('ordinary printers, invalid surfaces and nonfixed U1 attachments fail atomically at every ingress',()=>{
  const ordinary=registry.machines[0].id;
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,ordinary]){
    const state=plan({printers:[floorPrinter('printer',machineId)]}),saved=encode(state);
    for(const surfaceId of machineId===S.U1_LAYOUT_MACHINE_ID?['floor','level-1']:['top','floor','level-1']){
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
    if(machineId===S.U1_LAYOUT_MACHINE_ID)for(const change of [{xMm:.001},{zMm:-.001},{yawDeg:90}]){
      const attachment={parentId:'biqu',surfaceId:'top',...pose(),...change},hostile=clone(state);hostile.printers[0].attachment=attachment;
      reject(()=>S.applyAction(state,{type:'SET_ATTACHMENT',id:'printer',attachment},catalog));
      reject(()=>S.applyAction(state,{type:'UPDATE_PRINTER',id:'printer',patch:{attachment}},catalog));
      reject(()=>S.applyAction(plan(),{type:'ADD_PRINTER',printer:{...floorPrinter('injected'),attachment}},catalog));
      assert.equal(S.validateState(hostile,catalog).ok,false);reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));
      const template={format:'3d-print-rig-layout-set',version:1,name:'Invalid fixed reference',furniture:clone(state.furniture),printers:hostile.printers};
      reject(()=>C.decodeLayoutClipboard(JSON.stringify(template),catalog));reject(()=>G.instantiateGroupTemplate(S.createDefaultLayout({},catalog),template,{id:'injected-set',...pose()},catalog));
    }
    assert.equal(encode(state),saved);
  }
  const occupied=S.parseLayout(migratedBytes,catalog),second={...floorPrinter('second'),attachment:{parentId:'legacy-pop',surfaceId:'top',...pose()}};
  reject(()=>S.applyAction(occupied,{type:'ADD_PRINTER',printer:second},catalog));
  const hostile=clone(occupied);hostile.printers.push(second);reject(()=>S.parseLayout(JSON.stringify(hostile),catalog));
});
await test('migrated and fresh cabinets share one canonical type without U1 variant contamination',()=>{
  const legacy=S.parseLayout(legacyBytes,catalog),state=S.applyAction(legacy,{type:'ADD_FURNITURE',furniture:cabinet('biqu',pose(1500,-600,-90))},catalog);
  clean(state);assert.deepEqual(state.furniture[0],migratedFixture.furniture[0]);assert.deepEqual(state.printers,legacyFixture.printers);
  for(const f of state.furniture)fixed(f);for(const f of S.deriveScene(state,catalog).furniture)assert.equal(f.equipmentVariant,INSTALLED_VARIANT);
  assert.equal(digest(S.resolvePrinterEquipment(state,'legacy-u1',catalog)),'7e599137fe7e31b86b51b27a1783800b27f31db97c20d57b561269fb9ef78eae');
  assert.equal(encode(S.parseLayout(encode(state),catalog)),encode(state));
  assert.equal(encode(S.applyAction(state,{type:'REMOVE_FURNITURE',id:'biqu'},catalog)),migratedBytes);
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
await test('legacy clipboard and saved group templates normalize both cabinet kinds without dropping the U1 child',()=>{
  const original=C.captureLayoutClipboard(S.parseLayout(legacyBytes,catalog),['legacy-pop'],catalog,{name:'Saved U1 set'});
  for(const type of [TYPE,SOURCE_TYPE]){
    const template=clone(original);Object.assign(template.furniture[0],type===TYPE?{type,widthMm:422,depthMm:456,heightMm:428}:{type,...BARE_DIMS});
    const text=JSON.stringify(template),decoded=C.decodeLayoutClipboard(text,catalog);fixed(decoded.furniture[0]);
    assert.deepEqual(decoded.printers,template.printers);assert.equal(decoded.furniture[0].id,template.furniture[0].id);assert.deepEqual(decoded.furniture[0].pose,template.furniture[0].pose);
    assert.equal(JSON.stringify(template),text);const encoded=C.encodeLayoutClipboard(decoded,catalog);assert(!encoded.includes(SOURCE_TYPE));
    const library=G.parseGroupLibrary(JSON.stringify([{id:'saved-u1-unit',template}]),catalog);fixed(library[0].template.furniture[0]);
    assert.deepEqual(library[0].template.printers,template.printers);const source=G.validateGroupTemplate(template,catalog);fixed(source.furniture[0]);
    const next=G.instantiateGroupTemplate(S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000})},catalog),decoded,{id:'pasted',...pose(1000,-500,90)},catalog);
    clean(next);assert.equal(next.printers.length,1);assert.equal(next.printers[0].attachment.parentId,next.furniture[0].id);
    assert.notEqual(next.furniture[0].id,template.furniture[0].id);assert.equal(S.resolvePrinterEquipment(next,next.printers[0],catalog).equipmentVariant,'docked');
    assert.equal(encode(S.parseLayout(encode(next),catalog)),encode(next));
  }
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
  assert.deepEqual([...I.supportedLanguages],['en','ja','es','ko','ru','de']);
  for(const language of I.supportedLanguages){
    const t=I.createLayoutTranslator(language),r=uiFixture(S.createDefaultLayout({},catalog),null,undefined,language),b=r.command('layout.addBiquPopStation');
    assert.equal(r.container.querySelectorAll('[data-layout-command="layout.addBiquPopStation"]').length,1);
    assert.equal(r.container.querySelectorAll('[data-layout-command="layout.addPopStation"]').length,0,'Old selectable approximate cabinet removed');
    assert.equal(b.tagName,'BUTTON');assert(b.className.split(/\s+/).includes('layout-button-label'));
    assert.notEqual(t('layout.addBiquPopStation'),'layout.addBiquPopStation');assert.equal(b.getAttribute('aria-label'),t('layout.addBiquPopStation'));
    assert(!/\p{Extended_Pictographic}/u.test(b.textContent),'No emoji UI icon');b.click();assert.deepEqual(r.actions,[{type:'add',kind:TYPE}]);
    r.ui.setStatus({busy:true});b.click();assert.equal(r.actions.length,1);r.ui.setStatus({busy:false});
    r.ui.dispose();
  }
});
await test('all six locales distinguish the source body, four photo-reference pads, absent inventory and unqualified fit',()=>{
  const evidence={
    en:[/BIQU.*CAD/i,/four.*photo-based.*references/i,/No spools, holders or feeders/i,/placement.*pad details.*fastening.*load.*unverified/i],
    ja:[/BIQU.*CAD/,/写真.*参考.*パッド4個/,/スプール.*ホルダー.*フィーダー.*含みません/,/配置.*固定.*耐荷重.*未検証/],
    es:[/CAD.*BIQU/i,/cuatro.*referencia.*fotos/i,/Sin bobinas.*soportes.*alimentadores/i,/colocación.*fijación.*carga.*no.*verificados/i],
    ko:[/BIQU.*CAD/,/사진.*패드.*참고.*4개/,/스풀.*홀더.*피더.*없/,/배치.*고정.*하중.*미검증/],
    ru:[/CAD.*BIQU/,/четырьмя.*условными.*фото/i,/Без катушек.*держателей.*податчиков/i,/Размещение.*крепление.*нагрузка.*не проверены/i],
    de:[/BIQU.*CAD/i,/vier.*Referenzen.*Fotos/i,/Ohne Spulen.*Halter.*Zuführungen/i,/U1-Platzierung.*Befestigung.*Tragfähigkeit.*ungeprüft/i]
  };
  for(const language of I.supportedLanguages){
    const t=I.createLayoutTranslator(language),r=uiFixture(plan(),undefined,undefined,language);
    const dimensions=r.find('[data-layout-popstation-dimensions]');assert.equal(dimensions.textContent,t('layout.machineSize',{width:'423.1',depth:'478.3',height:'428.0'}));
    for(const key of ['layout.biquPopStationHelp','layout.popStationHelp','layout.popStationReplaced','layout.u1Mounted']){
      assert.notEqual(t(key),key,`${language}: ${key}`);assert(t(key).trim().length>20);assert(t(key).includes('BIQU'),`${language}: manufacturer identity in ${key}`);
    }
    assert(r.container.textContent.includes(t('layout.popStationHelp')));assert(!/\p{Extended_Pictographic}/u.test(t('layout.popStationReplaced')));
    for(const pattern of evidence[language])assert.match(t('layout.popStationHelp'),pattern,`${language}: truthful installed-reference help`);
    if(language==='en'){
      assert.match(t('layout.popStationReplaced'),/replaced/i);assert.match(t('layout.popStationReplaced'),/placement.*retained/i);
    }else assert.notEqual(t('layout.popStationReplaced'),I.createLayoutTranslator('en')('layout.popStationReplaced'),'No English fallback for migration');
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
await test('support chooser offers canonical cabinets only to U1, retaining normal desks and one-printer capacity',()=>{
  const state=plan({furniture:[cabinet(),S.createPopStation({id:'second',pose:pose(-1200)}),S.createDesk({id:'desk',pose:pose(0,1800)})],printers:[floorPrinter()]});
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,registry.machines[0].id]){
    const current={...state,printers:[floorPrinter('u1',machineId)]},r=uiFixture(current,'u1'),options=r.field('support').options.map(o=>JSON.parse(o.value));
    assert(options.some(([id,surface])=>id===null&&surface==='floor'));assert(options.some(([id,surface])=>id==='desk'&&surface==='top'));
    for(const id of ['biqu','second'])assert.equal(options.some(([parent,surface])=>parent===id&&surface==='top'),machineId===S.U1_LAYOUT_MACHINE_ID);
    if(machineId===S.U1_LAYOUT_MACHINE_ID){
      r.change(r.field('support'),JSON.stringify(['biqu','top']));assert.deepEqual(r.actions,[{type:'SET_ATTACHMENT',id:'u1',attachment:{parentId:'biqu',surfaceId:'top',...pose()}}]);
      const occupied={...current,printers:[...current.printers,{...floorPrinter('seated'),attachment:{parentId:'biqu',surfaceId:'top',...pose()}}]},chooser=uiFixture(occupied,'u1');
      assert(!chooser.field('support').options.some(o=>JSON.parse(o.value)[0]==='biqu'));assert(chooser.field('support').options.some(o=>JSON.parse(o.value)[0]==='second'));
    }
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
function startupIngressFixture(savedText) {
  // Execute the actual saved-state -> readiness -> renderer -> notice/store
  // segment. Replace only the renderer-module import with its synthetic port;
  // no WebGL, preview fetch, recovery UI or unrelated startup handlers run.
  const startBody=section('  state=startEmpty?createDefaultLayout():makeDefault();',"  for(const e of document.querySelectorAll('[data-layout-view]'))");
  const imports=startBody.match(/const \{createLayoutRenderer\}=await import\('[^']+'\);/g);
  assert.equal(imports?.length,1,'One production startup renderer import');
  const controlled=startBody.replace(imports[0],'const {createLayoutRenderer}=deps;');
  const document=new TestDocument(),sidebar=document.createElement('aside');sidebar.id='layout-sidebar';document.body.append(sidebar);
  document.querySelectorAll=selector=>document.body.querySelectorAll(selector);document.addEventListener=()=>{};
  const events=[],writes=[],messages=[],storage=new Map([['3d-print-rig-layout-v2',savedText]]);
  const factory=Function('deps',`"use strict";
    const {document,rows,catalog,createDefaultLayout,parseLayout,serializeLayout,getPopStationMigrations,parseGroupLibrary,t}=deps;
    const localStorage={getItem:key=>deps.storage.get(key)??null,setItem:(key,value)=>{deps.events.push('store');deps.writes.push({key,value});deps.storage.set(key,value);}};
    ${section('const storageKey=','const $=')}
    let state,ui,view,disposed=false,mode='ready',startEmpty=false,buildTools=null,panelLayout=null,activeOpeningTool=null,interactionGeneration=0,selected=null;
    const window={},language={t},$=selector=>document.body.querySelector(selector),noop=()=>{};
    const act=noop,select=noop,pick=noop,selectOpening=noop,changeOpening=noop,worldMove=noop,constrainMove=noop,worldRotate=noop,constrainRotate=noop,previewPlacement=noop,placeProposal=noop;
    const historyKey=noop,placementKey=noop,copyEvent=noop,pasteEvent=noop,refreshGroupLibrary=noop;
    const createLayoutUI=()=>({setStatus:noop}),setupLayoutPanel=()=>({}),makeDefault=()=>createDefaultLayout({},catalog);
    const message=(value,error=false)=>{deps.events.push('notice');deps.messages.push({text:typeof value==='function'?value():value,error});};
    const sync=()=>deps.events.push('sync');
    const updateViewPresentation=()=>{deps.events.push('presentation');if(mode==='presentation-error')throw Error('fixture presentation failure');};
    async function ensureEquipmentPreview(){deps.events.push('preview');if(mode==='preview-error')throw Error('fixture preview failure');if(mode==='disposed')disposed=true;return mode!=='preview-false';}
    ${section('function store(){','function message(')}
    async function start(){${controlled}return {ready:true};}
    deps.createLayoutRenderer=()=>{deps.events.push('renderer');if(mode==='renderer-error')throw Error('fixture renderer failure');return {view:value=>deps.events.push('view:'+value),getView:()=>({mode:'perspective'})};};
    return {run:async fault=>{mode=fault;disposed=false;ui=view=null;return start();},state:()=>state};`);
  const engine=factory({...S,...G,document,rows,catalog,t:I.createLayoutTranslator('en'),storage,events,writes,messages});
  return {...engine,events,writes,messages,saved:()=>storage.get('3d-print-rig-layout-v2')};
}
await test('actual startup preserves saved bytes across preview/readiness/renderer failure and explains migration before saving on retry',async()=>{
  for(const kind of [TYPE,SOURCE_TYPE])for(const fault of ['preview-false','preview-error','disposed','renderer-error','presentation-error']){
    const fixture=clone(legacyFixture);if(kind===SOURCE_TYPE)Object.assign(fixture.furniture[0],BARE_DIMS,{type:SOURCE_TYPE});
    const original=JSON.stringify(fixture),r=startupIngressFixture(original);
    if(fault.endsWith('-error'))await assert.rejects(r.run(fault),/fixture .* failure/);else assert.equal(await r.run(fault),undefined);
    assert.equal(r.saved(),original,`${kind}/${fault}: failed startup must preserve exact recovery bytes`);assert.deepEqual(r.writes,[]);
    assert.deepEqual(S.getPopStationMigrations(r.state()),['legacy-pop']);fixed(r.state().furniture[0]);
    assert.deepEqual(r.state().furniture[0].pose,fixture.furniture[0].pose);assert.deepEqual(r.state().printers,fixture.printers);
    const retryAt=r.events.length,noticeAt=r.messages.length;assert.deepEqual(await r.run('ready'),{ready:true});
    assert.equal(r.writes.length,1);assert.equal(r.saved(),migratedBytes);assert.deepEqual(S.getPopStationMigrations(r.state()),['legacy-pop']);
    const retryEvents=r.events.slice(retryAt);
    assert.deepEqual(retryEvents,['preview','renderer','sync','notice','view:perspective','presentation','store']);
    assert.deepEqual(r.messages.slice(noticeAt),[{text:I.createLayoutTranslator('en')('layout.popStationReplaced'),error:false}]);
    assert.equal(encode(S.parseLayout(r.saved(),catalog)),migratedBytes);
  }
  observations.push({case:'RR-01 startup recovery',faults:['preview-false','preview-error','disposed','renderer-error','presentation-error'],savedKinds:[TYPE,SOURCE_TYPE],
    scope:'Actual start segment with a synthetic readiness boundary and renderer/UI ports; exact save-byte preservation, migration WeakMap and retry ordering only, not complete startup or recovery-button/browser coverage.'});
});
function appFixture(initial) {
  const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p'),canvas=document.createElement('canvas');
  status.id='layout-status';document.body.append(status,container,canvas);
  const writes=[],downloads=[],views=[],placements=[],messages=[];
  const factory=new Function('deps',`"use strict";
    const {document,container,canvas,localStorage,catalog,rows,t,createLayoutUI,needsEquipmentPreview,isLayoutEquipmentPreviewPrepared,
      createBiquPopStation,createPopStation,createDesk,createShelf,createDefaultLayout,applyAction,applyWorldMove,worldTransform,validatePlacement,serializeLayout,parseLayout,getPopStationMigrations,
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
    ui=createLayoutUI({container,catalog:rows,t,onAction:act});
    ${section('sync();if(getPopStationMigrations(state).length)',"document.addEventListener('keydown',historyKey)")}
    return {act,ui,select,sync,previewPlacement,placeProposal,beginPlacement,pasteSelection,copySelection,worldRotate,
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
await test('actual private placement initialization and later proposal commit canonical installed cabinets from old bare copies',()=>{
  const r=appFixture(S.createDefaultLayout({},catalog)),copy={id:'old-bare-source',type:SOURCE_TYPE,...BARE_DIMS,pose:pose(123.125,-234.375,37.5)},original=JSON.stringify(copy);
  // createPlacementInitial is the fixture port for the app's private
  // beginPlacement body; the real proposePlacement is the canonical size gate.
  const createPlacementInitial=value=>{r.beginPlacement({kind:value.type,copy:clone(value)});return r.placement();};
  const initial=createPlacementInitial(copy);assert(initial);assert.equal(initial.kind,SOURCE_TYPE);assert.equal(r.state().furniture.length,0);
  const proposed=r.previewPlacement({xMm:800,zMm:-500,yawDeg:-90,altKey:true});assert.equal(proposed.valid,true);
  assert.deepEqual(proposed.sizeMm,{width:DIMS.widthMm,depth:DIMS.depthMm,height:DIMS.heightMm});fixed(proposed.state.furniture[0]);
  r.placeProposal(proposed);assert.equal(r.state().furniture.length,1);fixed(r.state().furniture[0]);assert.equal(r.state().furniture[0].id,initial.id);
  assert.equal(S.deriveScene(r.state(),catalog).furniture[0].equipmentVariant,INSTALLED_VARIANT);assert.equal(JSON.stringify(copy),original);
  assert.equal(r.history().past,1);assert.equal(r.writes.length,1);assert.equal(r.messages.filter(m=>m.error).length,0);clean(r.state());
  observations.push({case:'RR-02 old bare copy',ingresses:['actual private beginPlacement -> proposePlacement -> app commit','proposePlacement(copy)','applyAction ADD_FURNITURE'],
    expectedType:TYPE,equipmentVariant:INSTALLED_VARIANT,heightMm:DIMS.heightMm,scope:'State/placement and synthetic app transaction ports; no physical pad or U1 fit claim.'});
});
await test('actual app U1 add with cabinet selected uses fixed docked reference and rejects other machines',async()=>{
  const actual=[];
  for(const machineId of [S.U1_LAYOUT_MACHINE_ID,registry.machines[0].id]){
    const r=appFixture(plan());r.select('biqu');await r.act({type:'add',kind:'printer',machineId});
    const spec=r.placement(),proposal=r.previewPlacement({xMm:2000,zMm:0,yawDeg:0,altKey:true});
    actual.push({machineId,parentId:spec.parentId,surfaceId:spec.surfaceId,valid:proposal.valid,issues:proposal.issues.map(i=>i.code)});
    assert.equal(spec.parentId,'biqu');assert.equal(spec.surfaceId,'top');
    if(machineId===S.U1_LAYOUT_MACHINE_ID){assert.equal(proposal.valid,true);r.placeProposal(proposal);
      assert.deepEqual(r.state().printers[0].attachment,{parentId:'biqu',surfaceId:'top',...pose()});assert.equal(S.resolvePrinterEquipment(r.state(),r.state().printers[0],catalog).equipmentVariant,'docked');clean(r.state());
    }else{assert.equal(proposal.valid,false);assert.equal(proposal.state,null);assert(proposal.issues.some(e=>e.code==='POPSTATION_U1_ONLY'));assert.equal(r.history().past,0);assert.equal(r.state().printers.length,0);}
  }
  observations.push({case:'printer add with BIQU selected',actual});
});
await test('actual furniture preview keeps the source body rigidly lifted and uses the separate four-pad reference producer',()=>{
  const renderer=fs.readFileSync(path.join(site,'layout/layout-renderer.mjs'),'utf8'),start=renderer.indexOf('function cabinetRow('),end=renderer.indexOf('function catalogMachine(',start);
  assert(start>=0&&end>start,'Actual cabinet rendering functions missing');
  assert(feetModule);const rendered=[],resolved=[],padCalls=[],geometryCalls=[],materialCalls=[];
  class NodePort {
    constructor(){this.userData={};this.children=[];this.position={x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}};this.scale={x:1,y:1,z:1};}
    add(...nodes){this.children.push(...nodes);}
  }
  const THREE={Group:NodePort,Mesh:class extends NodePort {constructor(geometry,material){super();this.geometry=geometry;this.material=material;}},
    MeshStandardMaterial:class {constructor(options){materialCalls.push(options);Object.assign(this,options);}}};
  const makeFurniture=Function('getLayoutEquipment','THREE','furnitureGroup','record','previewPart','box','POPSTATION_STANDARD_FEET','createPopStationFootGeometry','addPopStationFootPads',
    `let popStationFootGeometry=null,popStationFootMaterial=null;${renderer.slice(start,end)};return makeFurniture;`)(
    (id,variant)=>{resolved.push({id,variant});return E.getLayoutEquipment(id,variant);},
    THREE,{add:g=>rendered.push(g)},()=>{},
    ()=>assert.fail('Unprepared synthetic-port test must not load or fabricate source mesh parts'),
    ()=>assert.fail('No generic cabinet boards, legs, internal spools or cues may render'),feetModule.POPSTATION_STANDARD_FEET,
    three=>{assert.equal(three,THREE);geometryCalls.push(true);return {fixtureResource:'Pad geometry port only; no vertices generated'};},
    (three,parent,resources)=>{const pads=feetModule.addPopStationFootPads(three,parent,resources);padCalls.push({parent,pads});return pads;});
  for(const type of [TYPE,SOURCE_TYPE])for(const equipmentVariant of ['supplied',INSTALLED_VARIANT,'loaded']){
    const entity={...S.deriveScene(plan(),catalog).furniture[0],type,equipmentVariant},node=makeFurniture(entity);
    assert.equal(node.userData.equipment,true);assert.equal(rendered.at(-1),node);
    assert.equal(node.children.length,5,'One lifted body carrier plus four separately produced reference pads');
    const [body,...pads]=node.children;assert.equal(body.position.y,BODY_LIFT_M);assert.deepEqual(body.scale,{x:1,y:1,z:1});
    assert.equal(body.children.length,0,'Real source preview remains unprepared; no source vertices fabricated');
    assert.equal(padCalls.at(-1).parent,node);assert.deepEqual(padCalls.at(-1).pads,pads);
    for(const [i,pad]of pads.entries()){
      assert.equal(pad.userData.layoutReferencePart,feetModule.POPSTATION_STANDARD_FEET.id);assert.equal(pad.userData.manufacturerCAD,false);
      assert.deepEqual([pad.position.x,pad.position.y,pad.position.z],[feetModule.POPSTATION_STANDARD_FEET.centersXZ[i][0],0,feetModule.POPSTATION_STANDARD_FEET.centersXZ[i][1]]);
    }
  }
  assert.equal(rendered.length,6);assert.deepEqual(resolved,Array.from({length:6},()=>({id:SOURCE_ID,variant:'supplied'})));
  assert.equal(padCalls.length,6);assert.equal(geometryCalls.length,1);assert.equal(materialCalls.length,1);
  assert.deepEqual(sourceRecord.proxy.parts,[],'This routing check must leave the real source cache unprepared');
  observations.push({case:'installed furniture preview routing',sourceBodyVariant:'supplied',bodyLiftM:BODY_LIFT_M,padsPerCabinet:4,
    scope:'Actual renderer branch and reference-pad producer with synthetic node/material/geometry ports. No pad profile tessellation or supplier model loading.'});
});
await test('cabinet-only image export selects standard-feet while keeping the original body identity and U1 docked reference',()=>{
  const state=plan(),r=uiFixture(state),render=r.command('render');assert.equal(render.disabled,false);
  render.click();assert.deepEqual(r.actions,[{type:'render'}]);
  const renderer=fs.readFileSync(path.join(site,'layout/layout-renderer.mjs'),'utf8');
  // Execute the current production inventory statement, not a reimplementation
  // of its cabinet filter. This only proves admission into streamed export.
  const inventoryLines=renderer.split(/\r?\n/).filter(line=>/^\s*const snapshot=/.test(line));
  assert.equal(inventoryLines.length,1,'One actual streamed-image inventory');
  const snapshot=Function('derived',`${inventoryLines[0]} return snapshot;`),inventory=snapshot(S.deriveScene(state,catalog));
  assert.equal(inventory.length,1);assert.equal(inventory[0].id,'biqu');assert.equal(inventory[0].machineId,SOURCE_ID);
  assert.equal(inventory[0].equipmentVariant,INSTALLED_VARIANT);assert.equal(inventory[0].positionM.y,0);fixed(inventory[0]);
  const row=E.getLayoutEquipment(inventory[0].machineId,inventory[0].equipmentVariant);assert.equal(row.id,SOURCE_ID);
  assert.equal(row.proxy.appendGenericPrinterCues,false);assert.equal(row.model.sha256,sourceRecord.model.sha256);assert.equal(row.manufacturerCAD,false);
  assert.equal(row.manufacturerBodyCAD,true);assert.equal(row.footReference.count,4);assert.equal(row.dimensionsMm.height,DIMS.heightMm);
  const priorKind={...state,furniture:[{...state.furniture[0],...BARE_DIMS,type:SOURCE_TYPE}]},previous=snapshot(S.deriveScene(priorKind,catalog));
  assert.equal(previous.length,1);assert.equal(previous[0].machineId,SOURCE_ID);assert.equal(previous[0].equipmentVariant,INSTALLED_VARIANT);
  const mounted=S.parseLayout(legacyBytes,catalog),mountedInventory=snapshot(S.deriveScene(mounted,catalog));
  assert.equal(mountedInventory.length,2);const printer=mountedInventory.find(e=>e.type==='printer'),cabinet=mountedInventory.find(e=>e.type===TYPE);
  assert.equal(printer.machineId,S.U1_LAYOUT_MACHINE_ID);assert.equal(printer.equipmentVariant,'docked');
  assert.equal(cabinet.machineId,SOURCE_ID);assert.equal(cabinet.equipmentVariant,INSTALLED_VARIANT);
  inventory[0].positionM.x=999;assert.equal(S.worldTransform(state,'biqu',catalog).positionM.x,0);
  observations.push({case:'detailed image export inventory',machineId:SOURCE_ID,equipmentVariant:INSTALLED_VARIANT,entries:inventory.length,
    scope:'Actual inventory expression and equipment resolution; streaming, GPU pixels and actual geometry remain separate gates.'});
});
await test('actual app announces migrated startup once, imports old kinds and saves only canonical furniture',async()=>{
  assert(!section('function sync(){','function selectOpening(').includes('getPopStationMigrations('),'Migration notice belongs to ingress, not ordinary sync');
  const initial=S.parseLayout(legacyBytes,catalog),r=appFixture(initial),notice=I.createLayoutTranslator('en')('layout.popStationReplaced');
  assert.equal(r.messages.filter(m=>m.text===notice).length,1);r.sync();r.select('legacy-pop');r.sync();
  assert.equal(r.messages.filter(m=>m.text===notice).length,1);assert.equal(r.writes.length,0);assert.deepEqual(r.history(),{past:0,future:0});
  for(const type of [TYPE,SOURCE_TYPE]){
    const fixture=clone(legacyFixture);if(type===SOURCE_TYPE)Object.assign(fixture.furniture[0],BARE_DIMS,{type});
    const text=JSON.stringify(fixture),app=appFixture(S.createDefaultLayout({},catalog));
    await app.act({type:'import',file:{size:Buffer.byteLength(text),text:async()=>text}});
    assert.equal(encode(app.state()),migratedBytes);assert.deepEqual(S.getPopStationMigrations(app.state()),['legacy-pop']);
    assert.equal(app.messages.at(-1).text,notice);assert.equal(app.messages.filter(m=>m.error).length,0);assert.deepEqual(app.history(),{past:1,future:0});
    assert.equal(app.writes.length,1);assert.equal(app.writes[0].value,migratedBytes);
    assert(!app.writes[0].value.includes(SOURCE_TYPE));assert(!app.writes[0].value.includes('popStationMigrations'));
    await app.act({type:'export'});assert.equal(await app.downloads[0].blob.text(),migratedBytes);
    await app.act({type:'undo'});assert.equal(app.state().furniture.length,0);await app.act({type:'redo'});assert.equal(encode(app.state()),migratedBytes);
    assert.equal(S.resolvePrinterEquipment(app.state(),'legacy-u1',catalog).equipmentVariant,'docked');
  }
});
await test('actual app switches U1 floor-to-reference-to-floor with exact undo, redo and parent rotation reversal',async()=>{
  const initial=plan({printers:[floorPrinter()]}),saved=encode(initial),r=appFixture(initial);
  await r.act({type:'SET_ATTACHMENT',id:'u1',attachment:{parentId:'biqu',surfaceId:'top',...pose()}});
  const mounted=encode(r.state());assert.notEqual(mounted,saved);assert.equal(S.resolvePrinterEquipment(r.state(),'u1',catalog).equipmentVariant,'docked');
  await r.act({type:'rotate-world',id:'biqu',deltaDeg:90});await r.act({type:'rotate-world',id:'biqu',deltaDeg:-90});assert.equal(encode(r.state()),mounted);
  await r.act({type:'SET_ATTACHMENT',id:'u1',attachment:clone(initial.printers[0].attachment)});assert.equal(encode(r.state()),saved);
  assert.equal(S.resolvePrinterEquipment(r.state(),'u1',catalog).equipmentVariant,'standalone');
  await r.act({type:'undo'});assert.equal(encode(r.state()),mounted);await r.act({type:'redo'});assert.equal(encode(r.state()),saved);
  assert.equal(r.messages.filter(m=>m.error).length,0);clean(r.state());
});
await test('actual app rejects injected attachment/resize without history, then exports/imports/reset/undo',async()=>{
  const initial=plan({printers:[floorPrinter()]}),saved=encode(initial),r=appFixture(initial);
  await r.act({type:'SET_ATTACHMENT',id:'u1',attachment:{parentId:'biqu',surfaceId:'top',...pose(.001,0,0)}});
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
const report={revision:3,status:results.every(r=>r.passed)?'PASS':'FAIL',cases:results.length,failures:results.filter(r=>!r.passed),results,
  sourceInputs:before,test:{sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))},
  identity:{furnitureType:TYPE,previousSuppliedType:SOURCE_TYPE,sourceId:SOURCE_ID,bareVariant:'supplied',installedVariant:INSTALLED_VARIANT,
    bareDimensionsMm:BARE_DIMS,dimensionsMm:DIMS,bareTopMm:BARE_TOP_MM,topMm:TOP_MM,bodyLiftM:BODY_LIFT_M,padCount:4},registeredMachineCount:registry.machines.length,
  observations,limits:{nativeJobs:0,mathWorkers:0,geometryWorkers:0,concurrentTests:1,nodeHeapRequestedMiB:384,execArgv:process.execArgv},
  run:{createdUTC:new Date().toISOString(),elapsedMs:performance.now()-started,peakRssKiB:process.resourceUsage().maxRSS},
  historicalEvidence:['STATE_TEST_WORK.private.json (41-pass prior revision)','STATE_TEST_WORK_V2.private.json (42-pass prior revision)','RUNTIME_REVIEW.private.json (static findings RR-01/RR-02/RR-03)'],
  reviewerAddendum:{findingsAddressed:['RR-01','RR-02','RR-03'],scope:'Focused execution of the real startup ingress control segment, old-kind state/copy normalization and truthful pad-aware help in six locales. Runtime fixes belong to the parent; this work edits only scripts/test_layout_biqu_state.mjs. Prior reports are historical and are not overwritten.'},
  scope:'Real layout-state, clipboard/group/placement and UI modules plus unchanged app ingress/transaction and furniture-rendering bodies. Synthetic DOM/storage/preview-ready/node/material/geometry ports. Source and array receipt pins only; no actual supplier bytes/arrays, pad tessellation, CAD or exported assets loaded. No geometry/contact rerun, load/thread/physical mounting, GPU/browser pixels, full startup or complete-machine fit coverage. Pad profile/bore/placement are reference estimates; four residual U1 foot gaps remain open. Room finish reversal checks state/source metadata only; rendered materials and detailed PNG pixels remain separate gates.'};
const output=option('--report');if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:results.length,failures:report.failures.map(r=>({name:r.name,error:r.error.split('\n')[0]})),registeredMachineCount:registry.machines.length,scope:report.scope}));
if(report.failures.length)process.exitCode=1;
