// Execute production furniture/box/record functions with real Three geometry.
// CPU procedural geometry only; no printer asset decode or GPU pixel claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const option=process.argv.indexOf('--site');
const site=option<0?path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site'):path.resolve(process.argv[option+1]);
const rendererURL=pathToFileURL(path.join(site,'layout/layout-renderer.mjs'));
const source=fs.readFileSync(rendererURL,'utf8');
const binding=name=>{
  const match=source.match(new RegExp(`from ['"]([^'"]*${name.replaceAll('.','\\.')}[^'"]*)['"]`));
  assert(match,'Production renderer binding: '+name);return new URL(match[1],rendererURL);
};
const files=[rendererURL,binding('layout-state.mjs'),binding('layout-equipment.mjs'),binding('layout-popstation-feet.mjs'),binding('three.module.js')];
const hashes=()=>Object.fromEntries(files.map(url=>[path.relative(site,fileURLToPath(url)),createHash('sha256').update(fs.readFileSync(url)).digest('hex')]));
const before=hashes();
const THREE=await import(binding('three.module.js'));
const S=await import(binding('layout-state.mjs'));
const {getLayoutEquipment}=await import(binding('layout-equipment.mjs'));
const {POPSTATION_STANDARD_FEET,createPopStationFootGeometry,addPopStationFootPads}=await import(binding('layout-popstation-feet.mjs'));
const section=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'Production function boundary: '+start);return source.slice(a,b);
};
const mm=source.match(/const MM = [^;]+;/);assert(mm,'Production length unit');
const factory=new Function('THREE','getLayoutEquipment','POPSTATION_STANDARD_FEET','createPopStationFootGeometry','addPopStationFootPads',`
  ${mm[0]}
  const furnitureGroup=new THREE.Group(),objects=new Map(),palette=new Map();
  const boxGeometry=new THREE.BoxGeometry(1,1,1),previewCalls=[];
  let popStationFootGeometry,popStationFootMaterial;
  const previewPart=(parent,part)=>{previewCalls.push(part);parent.add(new THREE.Group());};
  ${section('const material=(color,opacity=1,doubleSided=false)=>','function previewPart(')}
  ${section('function record(e,g){','function catalogMachine(')}
  return {makeFurniture,objects,previewCalls,dispose(){boxGeometry.dispose();popStationFootGeometry?.dispose();popStationFootMaterial?.dispose();for(const m of palette.values())m.dispose();}};
`);
const furnitureFixture=()=>factory(THREE,getLayoutEquipment,POPSTATION_STANDARD_FEET,createPopStationFootGeometry,addPopStationFootPads);

const catalog=[{id:'contact-printer',widthMm:10,depthMm:10,heightMm:10,baseOffsetMm:0}];
const angles=[-S.LIMITS.maxYawDeg,-180,-90,-37,0,37,90,180,S.LIMITS.maxYawDeg];
const results=[];
function verifyDesk(widthMm,depthMm,heightMm,yawDeg){
  const desk=S.createDesk({id:'desk',widthMm,depthMm,heightMm,pose:{xMm:125.5,zMm:-237.25,yawDeg}});
  const state=S.createDefaultLayout({furniture:[desk],printers:[{id:'printer',machineId:'contact-printer',configurationId:null,attachment:{parentId:'desk',surfaceId:'top',xMm:0,zMm:0,yawDeg:0}}]},catalog);
  const saved=S.serializeLayout(state,catalog),scene=S.deriveScene(state,catalog),e=scene.furniture[0];
  assert.equal(e.boards.length,1,'Desk has exactly one production board');
  const fixture=furnitureFixture();
  try{
    const group=fixture.makeFurniture(e),[board,...legs]=group.children;
    assert.equal(legs.length,4);assert.equal(fixture.objects.get(desk.id),group);
    assert.deepEqual(group.position.toArray(),[e.positionM.x,0,e.positionM.z]);
    assert.equal(group.rotation.y,e.yawRad);
    assert.deepEqual(board.scale.toArray(),[e.boards[0].widthM,e.boards[0].thicknessM,e.boards[0].depthM]);
    assert.deepEqual(board.position.toArray(),[0,e.boards[0].localCenterYM,0]);
    const boardLocal=new THREE.Box3().setFromObject(board),underside=boardLocal.min.y;
    assert.equal(underside,e.boards[0].localCenterYM-e.boards[0].thicknessM/2);
    assert.equal(boardLocal.max.y,heightMm/1000,'Actual board top keeps support datum');
    const expectedXZ=[-1,1].flatMap(x=>[-1,1].map(z=>[x*(e.widthMm*.001-.045)/2,z*(e.depthMm*.001-.045)/2]));
    for(const [i,leg]of legs.entries()){
      const bounds=new THREE.Box3().setFromObject(leg);
      assert.equal(bounds.min.y,0,'Leg remains on floor, with no gap');
      assert.equal(bounds.max.y,underside,'Leg touches exact underside, with no gap/offset');
      assert.notEqual(bounds.max.y,boardLocal.max.y,'Leg top cannot share tabletop plane');
      assert.deepEqual([leg.scale.x,leg.scale.z],[.045,.045]);
      assert.deepEqual([leg.position.x,leg.position.z],expectedXZ[i],'Horizontal leg placement unchanged');
      assert.equal(leg.material.color.getHexString(),'535d61');
      assert.equal(leg.castShadow,true);assert.equal(leg.receiveShadow,true);
      const contact=bounds.clone().intersect(boardLocal);
      assert.equal(contact.isEmpty(),false,'Each leg contacts the board');
      assert.equal(contact.min.y,contact.max.y,'Board and leg only share a contact plane');
    }
    assert.equal(board.material.color.getHexString(),'c7bda9');
    group.updateMatrixWorld(true);
    const worldBoard=new THREE.Box3().setFromObject(board);
    for(const leg of legs){
      const worldLeg=new THREE.Box3().setFromObject(leg);
      assert.equal(worldLeg.min.y,0,'Yaw/translation preserve floor contact');
      assert.equal(worldLeg.max.y,worldBoard.min.y,'Yaw/translation preserve exact underside contact');
      assert.notEqual(worldLeg.max.y,worldBoard.max.y);
      assert([...worldLeg.min.toArray(),...worldLeg.max.toArray()].every(Number.isFinite));
    }
    assert.equal(e.heightMm,heightMm);assert.equal(e.boards[0].topYM,heightMm/1000);
    const support=S.getSurface(state,'desk','top');
    assert.equal(support.heightMm,heightMm);assert.equal(support.positionM.y,heightMm/1000);
    assert.equal(scene.printers[0].supportYM,heightMm/1000,'Attached printer keeps tabletop datum');
    assert.equal(S.serializeLayout(state,catalog),saved,'Rendering cannot mutate layout');
    results.push({widthMm,depthMm,heightMm,yawDeg});
  }finally{fixture.dispose();}
}
for(const widthMm of [30,1200,S.LIMITS.maxDimensionMm])
  for(const depthMm of [30,600,S.LIMITS.maxDimensionMm])
    for(const heightMm of [30,750,S.LIMITS.maxDimensionMm])
      for(const yawDeg of angles)verifyDesk(widthMm,depthMm,heightMm,yawDeg);

// Shelf boards/legs stay authored; canonical and migrated PopStation inputs
// use the supplied preview port plus the production exterior pad helpers.
{
  const state=S.createDefaultLayout({furniture:[S.createShelf({id:'shelf',pose:{xMm:0,zMm:0,yawDeg:37}})]});
  const e=S.deriveScene(state).furniture[0],fixture=furnitureFixture();
  try{
    const group=fixture.makeFurniture(e),legs=group.children.slice(e.boards.length);
    assert.equal(legs.length,4);
    for(const leg of legs){assert.deepEqual(leg.scale.toArray(),[.035,e.heightMm*.001,.035]);assert.equal(leg.position.y,e.heightMm*.001/2);}
    for(const [i,board]of e.boards.entries()){
      assert.deepEqual(group.children[i].scale.toArray(),[board.widthM,board.thicknessM,board.depthM]);
      assert.equal(group.children[i].position.y,board.localCenterYM);
    }
  }finally{fixture.dispose();}
}
const supplied=getLayoutEquipment('biqu_popstation_mini_cad_v1','supplied');
for(const furniture of [S.createPopStation(),{...S.createPopStation(),type:supplied.type,
  widthMm:supplied.dimensionsMm.width,depthMm:supplied.dimensionsMm.depth,heightMm:supplied.dimensionsMm.height}]){
  const state=S.createDefaultLayout({furniture:[furniture]}),e=S.deriveScene(state).furniture[0];
  assert.equal(e.type,'popstation_mini','Input aliases normalize before live rendering');
  const fixture=furnitureFixture();
  try{
    const group=fixture.makeFurniture(e),[body,...pads]=group.children;
    assert.equal(group.userData.equipment,true);assert.deepEqual(fixture.previewCalls,supplied.proxy.parts);
    assert.equal(body.position.y,.0106,'The source cabinet receives only the specified rigid lift');
    assert.equal(body.children.length,supplied.proxy.parts.length);assert(body.children.every(child=>!child.isMesh),'Source preview port does not synthesize cabinet boxes');
    assert.equal(pads.length,4,'Only the four exterior pad references accompany the source cabinet');
    for(const [index,pad]of pads.entries()){
      assert(pad.isMesh);assert.equal(pad.geometry.type,'LatheGeometry');
      assert.equal(pad.userData.layoutReferencePart,POPSTATION_STANDARD_FEET.id);assert.equal(pad.userData.manufacturerCAD,false);
      assert.deepEqual(pad.position.toArray(),[POPSTATION_STANDARD_FEET.centersXZ[index][0],0,POPSTATION_STANDARD_FEET.centersXZ[index][1]]);
    }
  }finally{fixture.dispose();}
}
assert.deepEqual(hashes(),before,'Desk geometry inputs changed during focused run');
const report={status:'PASS',deskCases:results.length,legsChecked:results.length*4,nonDeskControls:3,sourceSHA256:before,
  cases:results,scope:'Production makeFurniture/box/record and state descriptors with real Three boxes. All dimension endpoint combinations plus representative dimensions and yaw endpoints/intermediate/reversed poses. Exact floor/underside contact; no geometry epsilon. Canonical and migrated cabinet controls replay the supplied-preview recording port with actual exterior pad helpers and the exact rigid body lift. Supplied triangles are not decoded. No copied-group preview, PNG/WebGL/pixel, printer model, physical fit or full-build claim.'};
const output=process.argv.indexOf('--report');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,cases:undefined}));
