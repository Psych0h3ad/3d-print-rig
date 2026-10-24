import assert from 'node:assert/strict';
import * as S from '../site/layout/layout-state.mjs';
import * as G from '../site/layout/layout-groups.mjs';
import * as C from '../site/layout/layout-clipboard.mjs';
import {equipmentRows,getLayoutEquipment} from '../site/layout/layout-equipment.mjs';
const U=S.U1_LAYOUT_MACHINE_ID,rows=equipmentRows.map(r=>({...r,widthMm:r.dimensionsMm.width,depthMm:r.dimensionsMm.depth,heightMm:r.dimensionsMm.height}));
const catalog=S.createCatalog(rows),attachment=(parentId=null,xMm=1000)=>({parentId,surfaceId:parentId?'top':'floor',xMm:parentId?0:xMm,zMm:0,yawDeg:0});
const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:6000,depthMm:5000}),furniture:[S.createPopStation({id:'pop'})],
  printers:[{id:'u1',machineId:U,configurationId:null,attachment:attachment()}]},catalog);
const saved=S.serializeLayout(initial,catalog),standalone=getLayoutEquipment(U,'standalone'),docked=getLayoutEquipment(U,'docked');
const profile=(s)=>S.resolvePrinterEquipment(s,'u1',catalog);
assert.deepEqual(profile(initial).footprintMm,standalone.footprintMm);
assert.equal(profile(initial).heightMm,standalone.dimensionsMm.height);
let mounted=S.applyAction(initial,{type:'SET_ATTACHMENT',id:'u1',attachment:attachment('pop')},catalog);
assert.deepEqual(profile(mounted).footprintMm,docked.footprintMm);
assert.equal(profile(mounted).widthMm,docked.dimensionsMm.width);
assert.equal(profile(mounted).heightMm,docked.dimensionsMm.height);
assert.equal(S.worldTransform(mounted,'u1',catalog).verticalRangeMm[1],417.4+730);
assert.deepEqual(S.validatePlacement(mounted,catalog),[]);
assert.equal(S.worldTransform(mounted,'u1',catalog).positionM.y,.4174);
const template=C.decodeLayoutClipboard(C.encodeLayoutClipboard(C.captureLayoutClipboard(mounted,['pop'],catalog),catalog),catalog);
assert.equal(template.furniture.length,1);assert.equal(template.printers.length,1);
assert.equal(template.printers[0].attachment.parentId,template.furniture[0].id);
const grouped=C.regroupLayoutSelection(mounted,{id:'group',name:'Fixture',selectionIds:['pop']},catalog);
const origin=S.serializeLayout(grouped,catalog);
let moved=G.transformGroup(grouped,'group',{xMm:100,yawDeg:37},catalog);
moved=G.transformGroup(moved,'group',grouped.groups[0].pose,catalog);
assert.equal(S.serializeLayout(moved,catalog),origin);
assert.equal(profile(moved).equipmentVariant,'docked');
const restored=S.applyAction(mounted,{type:'SET_ATTACHMENT',id:'u1',attachment:attachment()},catalog);
assert.equal(S.serializeLayout(restored,catalog),saved);
assert.equal(profile(restored).equipmentVariant,'standalone');
const supported=S.createDefaultLayout({room:S.createRoomRect({widthMm:2000,depthMm:2000}),
  furniture:[S.createDesk({id:'desk',widthMm:450,depthMm:450})],
  printers:[{id:'u1',machineId:U,configurationId:null,attachment:attachment('desk')}]},catalog);
assert.deepEqual(S.validatePlacement(supported,catalog),[]);
const limited=S.resolveWorldMove(supported,{id:'u1',x:100,z:0},catalog,{snapMm:0});
assert(limited&&limited.x>30&&limited.x<31,'Foot contact must reach the support edge despite harmless spool overhang');
assert.deepEqual(S.validatePlacement(limited.state,catalog),[]);
const reversed=S.resolveWorldMove(limited.state,{id:'u1',x:0,z:0},catalog,{snapMm:0});
assert(reversed);assert.equal(S.serializeLayout(reversed.state,catalog),S.serializeLayout(supported,catalog));
const lowRoom=S.applyAction(initial,{type:'SET_ROOM',room:S.createRoomRect({widthMm:6000,depthMm:5000,wallHeightMm:700})},catalog);
assert(S.validatePlacement(lowRoom,catalog).some(w=>w.code==='ROOM_HEIGHT_EXCEEDED'&&w.entityIds.includes('u1')));
const shelf=S.createShelf({id:'rack',widthMm:1200,depthMm:700,heightMm:1800,levels:[{id:'low',topMm:20},{id:'middle',topMm:600},{id:'top',topMm:1800}]});
const underShelf=S.createDefaultLayout({furniture:[shelf],printers:[{id:'u1',machineId:U,configurationId:null,attachment:{parentId:'rack',surfaceId:'low',xMm:0,zMm:0,yawDeg:0}}]},catalog);
assert(S.validatePlacement(underShelf,catalog).some(w=>w.code==='SHELF_BOARD_INTERSECTION'&&w.params.levelId==='middle'));
assert.equal(S.worldTransform(underShelf,'u1',catalog).heightMm,standalone.dimensionsMm.height,'Space reservation must never stretch the mesh');
// F2: detaching a lone U1 widens its planning footprint before clipboard normalization.
for (const xMm of [-750,750]) {
  const edge = S.createDefaultLayout({room:S.createRoomRect({widthMm:2000,depthMm:2000}),
    furniture:[S.createPopStation({id:'pop',pose:{xMm,zMm:0,yawDeg:0}})],
    printers:[{id:'u1',machineId:U,configurationId:'saved:u1?profile=layout',attachment:attachment('pop')}]},catalog);
  const before = S.serializeLayout(edge,catalog);
  assert.deepEqual(S.validatePlacement(edge,catalog),[]);
  const lone = C.decodeLayoutClipboard(C.encodeLayoutClipboard(C.captureLayoutClipboard(edge,['u1'],catalog),catalog),catalog);
  assert.equal(lone.furniture.length,0);assert.equal(lone.printers.length,1);
  assert.equal(lone.printers[0].configurationId,'saved:u1?profile=layout');
  assert.equal(lone.printers[0].attachment.parentId,null);
  assert.equal(profile(G.validateGroupTemplate(lone,catalog)).equipmentVariant,'standalone');
  const stack = C.captureLayoutClipboard(edge,['pop'],catalog);
  assert.equal(stack.furniture.length,1);assert.equal(stack.printers.length,1);
  assert.equal(stack.printers[0].attachment.parentId,stack.furniture[0].id);
  assert.equal(profile(G.validateGroupTemplate(stack,catalog)).equipmentVariant,'docked');
  const input = {template:lone,id:'copy',xMm:0,zMm:0,yawDeg:0,snapMm:0};
  assert.equal(G.proposeGroupPlacement(edge,input,catalog).valid,true);
  const wall = G.proposeGroupPlacement(edge,{...input,xMm},catalog);
  assert.equal(wall.valid,false);assert(wall.issues.some(issue=>issue.code==='ROOM_OUT_OF_BOUNDS'));
  const occupied = S.createDefaultLayout({room:edge.room,furniture:[S.createPopStation({id:'occupied'})]},catalog);
  const blocked = G.proposeGroupPlacement(occupied,input,catalog);
  assert.equal(blocked.valid,false);assert(blocked.issues.some(issue=>issue.code==='ENVELOPE_OVERLAP'));
  assert.equal(S.serializeLayout(edge,catalog),before);assert.equal(profile(edge).equipmentVariant,'docked');
}
console.log(JSON.stringify({passed:true,cases:25,scope:'Current final equipment metadata, PopStation parenting, reference body dimensions, published U1 operating height, ABA, support-contact edge/reversal and farm clipboard/group transactions, including detached-only near-wall copies and destination bounds/overlap rejection. Planning envelopes only; no native-solid or browser fit certification.'}));
