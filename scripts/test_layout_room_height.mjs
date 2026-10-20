// Portable source test: scripts/test_layout_room_height.mjs [state-module] [report].
// Planning envelope only. No model/DOM/GPU/native ceiling/clearance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const modulePath=process.argv[2]?path.resolve(process.argv[2]):fileURLToPath(new URL('../site/layout/layout-state.mjs',import.meta.url));
const S=await import(pathToFileURL(modulePath));
const cases=[];
function test(id,fn){try{fn();cases.push({id,status:'PASS'})}catch(e){cases.push({id,status:'FAIL',error:e.message})}}
const atFloor=(id,machineId)=>({id,machineId,configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}});
const on=(id,machineId,parentId,surfaceId)=>({...atFloor(id,machineId),attachment:{parentId,surfaceId,xMm:0,zMm:0,yawDeg:0}});
const cat=[{id:'h500',widthMm:200,depthMm:100,heightMm:500,baseOffsetMm:25},{id:'h2400',widthMm:200,depthMm:100,heightMm:2400}];
const room=h=>S.createRoomRect({widthMm:6000,depthMm:5000,wallHeightMm:h});
const build=({h=2400,furniture=[],printers=[]}={},catalog=cat)=>S.createDefaultLayout({room:room(h),furniture,printers},catalog);
const desk=h=>S.createDesk({id:'desk',widthMm:1600,depthMm:800,heightMm:h});
const shelf=h=>S.createShelf({id:'shelf',widthMm:1600,depthMm:800,heightMm:h,levels:[{id:'bottom',topMm:20},{id:'upper',topMm:h}]});
const heightWarnings=(state,catalog=cat)=>S.validatePlacement(state,catalog).filter(w=>w.code==='ROOM_HEIGHT_EXCEEDED');
function expect(state,expected,catalog=cat){
 const w=heightWarnings(state,catalog);assert.deepEqual(w.map(v=>v.entityIds[0]).sort(),[...expected].sort());
 assert.equal(new Set(w.map(v=>v.entityIds[0])).size,w.length);
 const scene=S.deriveScene(state,catalog),all=[...scene.furniture,...scene.printers];
 for(const issue of w){const e=all.find(e=>e.id===issue.entityIds[0]);assert.deepEqual(issue.params,{topMm:e.verticalRangeMm[1],roomHeightMm:state.room.wallHeightMm});assert.equal(e.verticalRangeMm[1]>state.room.wallHeightMm,true);assert.ok(Object.isFrozen(issue)&&Object.isFrozen(issue.entityIds)&&Object.isFrozen(issue.params))}
}
function adjacent(x,direction){const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,x);v.setBigUint64(0,v.getBigUint64(0)+(direction>0?1n:-1n));return v.getFloat64(0)}
test('furniture-above-room',()=>expect(build({furniture:[desk(2500)]}),['desk']));
test('shelf-above-room',()=>expect(build({furniture:[shelf(2500)]}),['shelf']));
test('floor-printer-above-room',()=>{const c=[{id:'tall',widthMm:200,depthMm:100,heightMm:2500}];expect(build({printers:[atFloor('p','tall')]},c),['p'],c)});
test('desk-child-includes-surface-height',()=>{const s=build({furniture:[desk(2000)],printers:[on('p','h500','desk','top')]});assert.deepEqual(S.worldTransform(s,'p',cat).verticalRangeMm,[2000,2500]);expect(s,['p'])});
test('shelf-child-includes-surface-height',()=>{const s=build({furniture:[shelf(2000)],printers:[on('p','h500','shelf','upper')]});expect(s,['p'])});
test('parent-and-child-each-warn-once',()=>expect(build({furniture:[shelf(2500)],printers:[on('p','h500','shelf','upper')]}),['shelf','p']));
test('exact-boundary-furniture-no-warning',()=>expect(build({furniture:[desk(2400)]}),[]));
test('exact-boundary-floor-printer-no-warning',()=>expect(build({printers:[atFloor('p','h2400')]}),[]));
test('exact-boundary-desk-child-no-warning',()=>expect(build({furniture:[desk(1900)],printers:[on('p','h500','desk','top')]}),[]));
test('exact-boundary-shelf-child-no-warning',()=>expect(build({furniture:[shelf(1900)],printers:[on('p','h500','shelf','upper')]}),[]));
test('one-binary64-step-above-room-warns-no-epsilon',()=>expect(build({furniture:[desk(adjacent(2400,1))]}),['desk']));
test('one-binary64-step-below-room-no-warning',()=>expect(build({furniture:[desk(adjacent(2400,-1))]}),[]));
test('one-binary64-step-floor-printer-warns',()=>{const c=[{id:'tall',widthMm:200,depthMm:100,heightMm:adjacent(2400,1)}];expect(build({printers:[atFloor('p','tall')]},c),['p'],c)});
test('room-height-reverse-ABA-does-not-move-entities',()=>{
 let s=build({h:2600,furniture:[desk(2000)],printers:[on('p','h500','desk','top')]}),initial=S.serializeLayout(s,cat),scene=S.deriveScene(s,cat);
 expect(s,[]);for(const h of [2400,2600]){s=S.applyAction(s,{type:'SET_ROOM',room:{...s.room,wallHeightMm:h}},cat);expect(s,h===2400?['p']:[]);assert.deepEqual(S.deriveScene(s,cat),scene)}assert.equal(S.serializeLayout(s,cat),initial);
});
test('desk-height-reverse-ABA-recomputes-child-top',()=>{
 let s=build({furniture:[desk(1500)],printers:[on('p','h500','desk','top')]}),initial=S.serializeLayout(s,cat);
 expect(s,[]);for(const h of [2000,1500]){s=S.applyAction(s,{type:'UPDATE_FURNITURE',id:'desk',patch:{heightMm:h}},cat);expect(s,h===2000?['p']:[]);assert.deepEqual(s.printers[0].attachment,on('p','h500','desk','top').attachment)}assert.equal(S.serializeLayout(s,cat),initial);
});
test('shelf-height-reverse-ABA-recomputes-child-top',()=>{
 let s=build({furniture:[shelf(2000)],printers:[on('p','h500','shelf','upper')]}),initial=S.serializeLayout(s,cat);
 expect(s,['p']);for(const h of [1600,2000]){s=S.applyAction(s,{type:'UPDATE_FURNITURE',id:'shelf',patch:{heightMm:h}},cat);expect(s,h===2000?['p']:[])}assert.equal(S.serializeLayout(s,cat),initial);
});
test('horizontal-rotation-does-not-change-height-warning',()=>{
 let s=build({furniture:[desk(2000)],printers:[on('p','h500','desk','top')]});for(const yawDeg of [90,180,-90,0]){s=S.applyAction(s,{type:'UPDATE_FURNITURE',id:'desk',patch:{pose:{yawDeg}}},cat);expect(s,['p']);assert.deepEqual(S.worldTransform(s,'p',cat).verticalRangeMm,[2000,2500])}
});
test('warning-not-placement-rejection-JSON-roundtrip',()=>{const s=build({furniture:[desk(2000)],printers:[on('p','h500','desk','top')]}),text=S.serializeLayout(s,cat);const loaded=S.parseLayout(text,cat);expect(loaded,['p']);assert.equal(S.serializeLayout(loaded,cat),text)});
test('XZ-and-surface-warnings-retained-with-height',()=>{
 const d=S.createDesk({id:'desk',widthMm:500,depthMm:500,heightMm:2000,pose:{xMm:2600,zMm:0,yawDeg:0}}),p=on('p','h500','desk','top');p.attachment.xMm=1000;
 const s=build({furniture:[d],printers:[p]}),warnings=S.validatePlacement(s,cat);expect(s,['p']);assert.ok(warnings.some(w=>w.code==='ROOM_OUT_OF_BOUNDS'));assert.ok(warnings.some(w=>w.code==='SURFACE_OVERHANG'));
});
test('invalid-machine-still-rejects',()=>assert.throws(()=>build({printers:[atFloor('p','unknown')]}),S.LayoutValidationError));
const bytes=fs.readFileSync(modulePath),result={schema:'layout-room-height-source-regression-v1',status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',source:{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},cases,
 scope:'Strict planning-room height warning against derived verticalRangeMm; fixture catalog, no actual models/native ceiling certificate.',GPU:false,native:0};
if(process.argv[3])fs.writeFileSync(path.resolve(process.argv[3]),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,cases:cases.length,failed:cases.filter(c=>c.status==='FAIL').map(c=>c.id),source:result.source}));if(result.status!=='PASS')process.exitCode=1;
