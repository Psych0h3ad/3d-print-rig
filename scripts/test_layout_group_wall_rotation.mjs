// Focused group wall-assist regressions on source planning footprints only.
// No actual model decode, browser or native-clearance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),siteAt=process.argv.indexOf('--site');
const site=siteAt<0?path.join(root,'site'):path.resolve(process.argv[siteAt+1]),dir=path.join(site,'layout');
const groupURL=pathToFileURL(path.join(dir,'layout-groups.mjs'));
const source=fs.readFileSync(groupURL,'utf8');
const stateImport=source.match(/from\s*(['"])(\.\/layout-state\.mjs(?:\?[^'"]*)?)\1/)[2];
const S=await import(new URL(stateImport,groupURL)),G=await import(groupURL);
const files=['layout-groups.mjs','layout-wall-rotation.mjs','layout-geometry.mjs','layout-constraints.mjs','layout-collision.mjs','layout-state.mjs'];
const hashes=()=>Object.fromEntries(files.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')]));
const before=hashes(),cases=[],C=S.createCatalog([{id:'small',widthMm:100,depthMm:60,heightMm:100}]);
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const room=S.createRoomPolygon({polygonMm:[[0,0],[1000,0],[1000,1000],[0,1000]]});
const desk=(id,x,z,w=600,d=400)=>S.createDesk({id,widthMm:w,depthMm:d,heightMm:700,pose:pose(x,z)});
const printer=(id,parentId,x=0,z=0)=>({id,machineId:'small',configurationId:'saved:keep/exact',attachment:{parentId,surfaceId:parentId?'top':'floor',...pose(x,z)}});
function unit({x=300,z=500,width=600,depth=400,outer=room,peer=null,loose=false}={}){
  const furniture=[desk('bench',x,z,width,depth),...(peer?[peer]:[])];
  const printers=[printer('on','bench',0,0),...(loose?[printer('loose',null,x,z+depth/2+80)]:[])];
  return G.createGroup(S.createDefaultLayout({room:outer,furniture,printers},C),
    {id:'cell',name:'Wall test',memberIds:['bench',...(loose?['loose']:[])]},C);
}
const encode=s=>S.serializeLayout(s,C),near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
function test(name,run){try{run();cases.push({name,passed:true});}catch(error){cases.push({name,passed:false,error:error.stack});}}
function turn(state,yaw,options={}){
  const text=encode(state),r=G.resolveGroupRotation(state,{id:'cell',yawDeg:yaw},C,{snapDeg:0,...options});
  assert(r);assert.equal(encode(state),text,'input state mutated');
  const p=r.state.groups[0].pose;near(r.x,p.xMm);near(r.z,p.zMm);near(r.yawDeg,p.yawDeg);
  assert.equal(S.validatePlacement(r.state,C).length,0,JSON.stringify(S.validatePlacement(r.state,C)));
  return r;
}
function directBlocked(state,yaw){assert.throws(()=>G.transformGroup(state,'cell',{yawDeg:yaw},C),e=>e instanceof S.LayoutValidationError);}

test('flush wall: retreat, signed rotation, and return original anchor',()=>{
  for(const yaw of [90,-90,180,-180,270,-270,360,-360]){
    const s=unit();directBlocked(s,yaw);const r=turn(s,yaw);
    near(r.yawDeg,yaw);near(r.x,300);near(r.z,500);assert.equal(r.wallAdjusted,true);assert(!r.boundaryLimited);
    assert.deepEqual(r.state.printers[0].attachment,s.printers[0].attachment);
  }
});
test('corner: full yaw succeeds while strict return stops at the rotated wall',()=>{
  const s=unit({z:200}),r=turn(s,90);
  near(r.yawDeg,90);near(r.x,300);near(r.z,300);assert.equal(r.wallAdjusted,true);assert(!r.boundaryLimited);
});
test('gesture stable anchor restores after intermediate assistance and reverses exactly',()=>{
  const s=unit(),anchorPointMm={xMm:300,zMm:500};
  const middle=turn(s,45,{anchorPointMm,snapOrigin:0});assert(middle.x>300);assert(middle.wallAdjusted);
  const end=turn(middle.state,90,{anchorPointMm,snapOrigin:0});near(end.x,300);near(end.z,500);near(end.yawDeg,90);
  const back=turn(end.state,0,{anchorPointMm,snapOrigin:0});assert.deepEqual(back.state,s);
});
test('multiple roots and attached children keep rigid identities and local attachment',()=>{
  const s=unit({z:450,loose:true}),from=s.groups[0].pose,r=turn(s,90);
  near(r.yawDeg,90);assert.equal(r.wallAdjusted,true);
  assert.deepEqual(r.state.printers.find(p=>p.id==='on').attachment,s.printers.find(p=>p.id==='on').attachment);
  assert.equal(r.state.printers.find(p=>p.id==='loose').configurationId,'saved:keep/exact');
  const a=s.printers.find(p=>p.id==='loose').attachment,b=r.state.printers.find(p=>p.id==='loose').attachment;
  near(b.xMm-r.x,a.zMm-from.zMm);near(b.zMm-r.z,-(a.xMm-from.xMm));
});
test('peer-only interior sweep block never triggers automatic translation',()=>{
  const s=unit({x:500,peer:desk('peer',840,500,60,60)});directBlocked(s,90);
  const r=turn(s,90);assert(r.boundaryLimited);assert(r.yawDeg<90);near(r.x,500);near(r.z,500);assert(!r.wallAdjusted);
});
test('peer blocks retreat: no farther wall centre or endpoint-only shortcut',()=>{
  const s=unit({peer:desk('peer',640,500,40,40)}),r=turn(s,90);
  assert(r.boundaryLimited);assert(Math.abs(r.yawDeg)<1e-6);near(r.x,300);near(r.z,500);assert(!r.wallAdjusted);
});
test('peer blocks assisted rotation after a clear retreat: every leg remains swept',()=>{
  const s=unit({peer:desk('peer',710,500,40,40)}),r=turn(s,90);
  assert(r.boundaryLimited);assert(Math.abs(r.yawDeg)<1e-6);near(r.x,300);near(r.z,500);assert(!r.wallAdjusted);
});
test('explicit stable anchor cannot drag the rotated footprint through a wall',()=>{
  const r=turn(unit(),90,{anchorPointMm:{xMm:100,zMm:500}});
  near(r.yawDeg,90);near(r.x,200);near(r.z,500);assert(r.wallAdjusted);
});
test('infeasible opposite walls retain limited signed-prefix fallback',()=>{
  const outer=S.createRoomRect({widthMm:1600,depthMm:700});
  const s=unit({x:0,z:0,width:1400,depth:400,outer}),r=turn(s,360);
  assert(r.boundaryLimited);assert(r.yawDeg<90);near(r.x,0);near(r.z,0);assert(!r.wallAdjusted);
});
test('concave corridor: proposal still passes actual polygon sweep acceptance',()=>{
  const outer=S.createRoomPolygon({polygonMm:[[0,0],[1000,0],[1000,400],[400,400],[400,1000],[0,1000]]});
  const r=turn(unit({x:700,z:50,width:200,depth:100,outer}),90);
  near(r.yawDeg,90);near(r.x,700);near(r.z,100);assert(r.wallAdjusted);
});
test('direct free-space turn returns x/z without spurious adjustment',()=>{
  const s=unit({x:500}),r=turn(s,90);near(r.x,500);near(r.z,500);near(r.yawDeg,90);assert(!r.wallAdjusted);
  const noOp=turn(s,0);assert.deepEqual(noOp.state,s);assert(!noOp.wallAdjusted);
});
test('invalid anchors, unknown options and malformed input reject without mutation',()=>{
  const s=unit(),text=encode(s);
  for(const anchorPointMm of [{},{xMm:0},{xMm:NaN,zMm:0},{xMm:0,zMm:Infinity},{xMm:0,zMm:0,extra:1},
    {xMm:1000001,zMm:0},[],true,'anchor']){
    assert.equal(G.resolveGroupRotation(s,{id:'cell',yawDeg:90},C,{snapDeg:0,anchorPointMm}),false);
  }
  for(const options of [null,[],true,{unknown:true},{snapDeg:2},{snapOrigin:NaN},{snapOrigin:'0'}])
    assert.equal(G.resolveGroupRotation(s,{id:'cell',yawDeg:90},C,options),false);
  for(const input of [null,[],{id:'cell',yawDeg:90,extra:true},{id:'cell',yawDeg:NaN}])assert.equal(G.resolveGroupRotation(s,input,C),false);
  assert.equal(G.resolveGroupRotation(s,{id:'cell',yawDeg:361},C,{snapDeg:0}),false);
  assert.equal(encode(s),text);
});
assert.deepEqual(hashes(),before,'source changed during focused test');
console.log(JSON.stringify({passed:cases.every(c=>c.passed),cases,source_sha256:before,
  scope:'Source group wall-assist and strict planning-envelope sweeps only; no browser/native/model qualification.'},null,2));
if(cases.some(c=>!c.passed))process.exitCode=1;
