// Integration regressions against actual planner exports. No native CAD claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const site=path.resolve(option('--site')??path.join(root,'site')),dir=path.join(site,'layout');
const S=await import(pathToFileURL(path.join(dir,'layout-state.mjs')));
const G=await import(pathToFileURL(path.join(dir,'layout-groups.mjs')));
const P=await import(pathToFileURL(path.join(dir,'layout-placement.mjs')));
const files=['layout-state.mjs','layout-geometry.mjs','layout-groups.mjs','layout-placement.mjs','layout-collision.mjs','layout-constraints.mjs','layout-catalog.json'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')]));
const inputs=hashes(),cases=[],coverage=[],timings={};
const C=S.createCatalog([{id:'small',widthMm:100,depthMm:100,heightMm:200},{id:'long',widthMm:600,depthMm:40,heightMm:200}]);
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const shelf=(id,x=0,z=0,widthMm=100,depthMm=600,heightMm=1000,yaw=0)=>S.createShelf({id,widthMm,depthMm,heightMm,levels:[{id:'board',topMm:heightMm}],pose:pose(x,z,yaw)});
const desk=(id,x=0,z=0,widthMm=200,depthMm=200,heightMm=500)=>S.createDesk({id,widthMm,depthMm,heightMm,pose:pose(x,z)});
const printer=(id,x=0,z=0,parentId=null,surfaceId=parentId?'top':'floor',machineId='small')=>({id,machineId,configurationId:null,attachment:{parentId,surfaceId,...pose(x,z)}});
const layout=(furniture=[],printers=[])=>S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000,wallHeightMm:10000}),furniture,printers},C);
const warnings=s=>S.validatePlacement(s,C).filter(e=>e.code==='ENVELOPE_OVERLAP');
const reject=fn=>assert.throws(fn,e=>e.errors?.some(p=>p.code==='ENVELOPE_OVERLAP'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const move=(s,id,x,z)=>{const r=S.resolveWorldMove(s,{id,x,z},C,{snapMm:0});assert(r);return r;};
const turn=(s,id,yawDeg)=>{const r=S.resolveWorldRotation(s,{id,yawDeg},C,{snapDeg:0});assert(r);return r;};
const group=s=>G.createGroup(s,{id:'g',name:'Cell',memberIds:s.furniture.map(f=>f.id).filter(id=>id!=='obstacle')},C);
function test(name,run){try{run();cases.push({name,status:'PASS'});}catch(e){cases.push({name,status:'FAIL',error:e.stack});}}

test('new furniture, copy and floor printer reject support envelope interference; exact face touch allowed',()=>{
  const s=layout([shelf('obstacle')]);
  for(const kind of ['desk','shelf','printer']){
    const common={kind,id:'new',machineId:'small',xMm:0,zMm:0,yawDeg:0,snapMm:0};
    const r=P.proposePlacement(s,common,C);assert.equal(r.valid,false);assert(r.issues.some(e=>e.code==='ENVELOPE_OVERLAP'));
    const copy=kind==='printer'?printer('source'):kind==='desk'?desk('source'):shelf('source');
    assert.equal(P.proposePlacement(s,{...common,copy},C).valid,false);
  }
  const r=P.proposePlacement(s,{kind:'printer',id:'p',machineId:'small',xMm:100,zMm:0,yawDeg:0,snapMm:0},C);assert(r.valid);
  reject(()=>S.applyAction(s,{type:'ADD_FURNITURE',furniture:desk('new')},C));
  reject(()=>S.applyAction(s,{type:'ADD_PRINTER',printer:printer('p')},C));
});
test('numeric movement, resize and height changes reject new overlaps atomically',()=>{
  const s=layout([desk('moving',-300),shelf('obstacle')]),before=S.serializeLayout(s,C);
  reject(()=>S.applyAction(s,{type:'UPDATE_FURNITURE',id:'moving',patch:{pose:{xMm:300}}},C));
  reject(()=>S.applyAction(s,{type:'UPDATE_FURNITURE',id:'moving',patch:{widthMm:600}},C));
  assert.equal(S.serializeLayout(s,C),before);
  const elevated=layout([desk('support',0,0,300,300,500),shelf('obstacle',300,0,100,600,500)],[printer('on',0,0,'support')]);
  assert.equal(warnings(elevated).length,0);
  // A separate floor object below the supported printer is checked in height.
  const raw=structuredClone(elevated);raw.furniture[1].pose.xMm=100;
  raw.furniture[1].widthMm=50;raw.furniture[0].widthMm=100;
  raw.printers[0].attachment.xMm=0;
  const stacked=S.parseLayout(JSON.stringify(raw),C);
  assert.equal(warnings(stacked).length,0);
  reject(()=>S.applyAction(stacked,{type:'UPDATE_FURNITURE',id:'obstacle',patch:{heightMm:800,pose:{xMm:50}}},C));
});
test('fast translation cannot tunnel through thin shelf, from either side or along either axis',()=>{
  for(const axis of ['x','z'])for(const direction of [-1,1]){
    const obstacle=axis==='x'?shelf('obstacle',0,0,30,1500):shelf('obstacle',0,0,1500,30);
    const s=layout([obstacle],[printer('p',axis==='x'?-1000*direction:0,axis==='z'?-1000*direction:0)]);
    const x=axis==='x'?1000*direction:0,z=axis==='z'?1000*direction:0;
    reject(()=>S.applyWorldMove(s,{id:'p',xMm:x,zMm:z},C));
    const r=move(s,'p',x,z);assert(r.boundaryLimited);near(axis==='x'?r.x:r.z,-65*direction);assert.deepEqual(warnings(r.state),[]);
    const reversed=move(r.state,'p',axis==='x'?-1000*direction:0,axis==='z'?-1000*direction:0);assert.deepEqual(reversed.state,s);
  }
});
test('translation min/max/intermediate/reversed, room limits, and exact A-B-A stay pure',()=>{
  const s=layout([shelf('obstacle',1500,1500)],[printer('p',-1200,-1200)]),encoded=S.serializeLayout(s,C);
  let state=s;
  for(const [x,z]of [[-4950,-4950],[4950,-4950],[200,300],[-400,500],[-1200,-1200]])state=move(state,'p',x,z).state;
  assert.deepEqual(state,s);assert.equal(S.serializeLayout(s,C),encoded);
  assert.deepEqual(S.parseLayout(S.serializeLayout(state,C),C),s);
});
test('collision stop and furniture-face slide reach diagonal target component without sticking on touch',()=>{
  const s=layout([shelf('obstacle',0,0,100,3000)],[printer('p',-500,0)]);
  const contact=move(s,'p',500,800);assert(contact.boundaryLimited);near(contact.x,-100);near(contact.z,800);
  const along=move(contact.state,'p',-100,1100);near(along.x,-100);near(along.z,1100);
  const away=move(along.state,'p',-300,1100);near(away.x,-300);assert.deepEqual(warnings(away.state),[]);
});
test('slanted furniture face slides in its own tangent and reverses',()=>{
  const yaw=37,rad=yaw*Math.PI/180,c=Math.cos(rad),sn=Math.sin(rad);
  const world=(x,z)=>[x*c+z*sn,-x*sn+z*c];
  const [sx,sz]=world(-500,0),[tx,tz]=world(500,500),s=layout([shelf('obstacle',0,0,100,3000,1000,yaw)],[printer('p',sx,sz)]);
  const r=move(s,'p',tx,tz);assert(r.boundaryLimited);assert.deepEqual(warnings(r.state),[]);
  // The world-square footprint's support radius along the rotated normal.
  const expected=-50-50*(c+sn);near(r.x*c-r.z*sn,expected);near(r.x*sn+r.z*c,500);
  const reversed=move(r.state,'p',sx,sz);near(reversed.x,sx);near(reversed.z,sz);
});
test('clear rotation endpoints cannot cross furniture on intermediate arc, including signed full turns',()=>{
  const s=layout([shelf('obstacle',0,-220,80,40)],[printer('p',0,0,null,'floor','long')]);
  for(const yawDeg of [180,-180,360,-360]){
    reject(()=>S.applyAction(s,{type:'UPDATE_PRINTER',id:'p',patch:{attachment:{yawDeg}}},C));
    const r=turn(s,'p',yawDeg);assert(r.boundaryLimited);assert(Math.abs(r.yawDeg)<90&&Math.abs(r.yawDeg)>0);assert.deepEqual(warnings(r.state),[]);
    const back=turn(r.state,'p',0);assert.deepEqual(back.state,s);
  }
});
test('own attached support is allowed; unrelated supports reject; vertically stacked printers stay independent',()=>{
  const shelfA=S.createShelf({id:'support',widthMm:400,depthMm:400,heightMm:1100,levels:[{id:'low',topMm:300},{id:'high',topMm:900}]}),
    s=layout([shelfA],[printer('low',0,0,'support','low'),printer('high',0,0,'support','high')]);
  assert.deepEqual(warnings(s),[]);assert.deepEqual(warnings(move(s,'low',50,0).state),[]);
  const raw=structuredClone(s);raw.furniture.push(shelf('obstacle',180,0,100,300,1100));
  const overlap=S.parseLayout(JSON.stringify(raw),C);assert(warnings(overlap).some(e=>e.entityIds.includes('support')));
  assert(warnings(overlap).some(e=>e.entityIds.includes('obstacle')&&e.entityIds.includes('low'))===false);
});
test('children are included in parent sweep above low external furniture',()=>{
  const s=layout([desk('support',-500,0,200,200,500),shelf('obstacle',0,0,100,600,800)],[printer('child',0,0,'support')]);
  const r=move(s,'support',500,0);assert(r.boundaryLimited);near(r.x,-150);assert.deepEqual(r.state.printers[0].attachment,s.printers[0].attachment);
  assert.deepEqual(warnings(r.state),[]);
});
test('group external collisions include supported children, preserve local parenting and reverse exactly',()=>{
  const s=group(layout([desk('a',-600,-200),desk('b',-600,200),shelf('obstacle',0,0,30,3000)],[printer('child',0,0,'a')]));
  const origin=s.groups[0].pose;
  reject(()=>G.transformGroup(s,'g',{xMm:600},C));
  const r=G.resolveGroupMove(s,{id:'g',x:600,z:600},C,{snapMm:0});assert(r.boundaryLimited);near(r.x,-115);near(r.z,600);
  assert.deepEqual(warnings(r.state),[]);assert.deepEqual(r.state.printers[0].attachment,s.printers[0].attachment);
  const back=G.resolveGroupMove(r.state,{id:'g',x:origin.xMm,z:origin.zMm},C,{snapMm:0});assert.deepEqual(back.state,s);
});
test('sparse group empty-space gap never collides as a filled group box',()=>{
  const s=group(layout([desk('left',-800,0),desk('right',800,0),shelf('obstacle',0,0,100,100)]));
  let next=G.transformGroup(s,'g',{zMm:200},C);assert.deepEqual(warnings(next),[]);
  next=G.transformGroup(next,'g',s.groups[0].pose,C);assert.deepEqual(next,s);
});
test('group rotation tests intermediate members, not just endpoints',()=>{
  const s=group(layout([desk('root',500,0,600,40),shelf('obstacle',500,-220,80,40)]));
  for(const yawDeg of [-180,180,-360,360]){
    reject(()=>G.transformGroup(s,'g',{yawDeg},C));
    const r=G.resolveGroupRotation(s,{id:'g',yawDeg},C,{snapDeg:0});assert(r.boundaryLimited);assert(Math.abs(r.yawDeg)<90);assert.deepEqual(warnings(r.state),[]);
    assert.deepEqual(G.transformGroup(r.state,'g',s.groups[0].pose,C),s);
  }
});
test('duplicate/template placement rejects external and internal furniture overlaps without mutation',()=>{
  const source=group(layout([desk('a',-400),desk('b',400)],[printer('child',0,0,'a')])),template=G.captureGroupTemplate(source,'g',C),saved=JSON.stringify(template);
  const target=layout([shelf('obstacle',400,0,200,200)]),before=S.serializeLayout(target,C);
  reject(()=>G.instantiateGroupTemplate(target,template,{id:'copy',xMm:0,zMm:0},C));
  assert.equal(G.proposeGroupPlacement(target,{id:'copy',template,xMm:0,zMm:0,yawDeg:0,snapMm:0},C).valid,false);
  const valid=G.instantiateGroupTemplate(target,template,{id:'copy',xMm:0,zMm:1000},C);assert.deepEqual(warnings(valid),[]);
  assert.equal(S.serializeLayout(target,C),before);assert.equal(JSON.stringify(template),saved);
  const bad=structuredClone(template);bad.furniture[1].pose={...bad.furniture[0].pose};
  reject(()=>G.instantiateGroupTemplate(layout(),bad,{id:'bad',xMm:0,zMm:0},C));
});
test('old overlap load/save is exact; partial moves out work, inward moves reject, new obstacles still block',()=>{
  const s=layout([desk('moving',-80,0,100,100),shelf('obstacle',0,0,100,100)]),encoded=S.serializeLayout(s,C);
  const loaded=S.parseLayout(encoded,C);assert.equal(S.serializeLayout(loaded,C),encoded);assert.equal(warnings(loaded).length,1);
  reject(()=>S.applyWorldMove(loaded,{id:'moving',xMm:-60,zMm:0},C));
  const part=move(loaded,'moving',-90,0);near(part.x,-90);assert.equal(warnings(part.state).length,1);
  const clear=move(part.state,'moving',-100,0);near(clear.x,-100);assert.deepEqual(warnings(clear.state),[]);
  const raw=structuredClone(loaded);raw.furniture.push(shelf('wall',-300,0,30,1000));
  const r=move(S.parseLayout(JSON.stringify(raw),C),'moving',-500,0);assert(r.boundaryLimited);near(r.x,-235);
  const shrunk=S.applyAction(loaded,{type:'UPDATE_FURNITURE',id:'moving',patch:{widthMm:40}},C);assert.deepEqual(warnings(shrunk),[]);
});
test('overlapping imported groups can move apart a little at a time',()=>{
  const s=G.createGroup(layout([desk('moving',-80,0,100,100),shelf('obstacle',0,0,100,100)]),{id:'g',name:'Legacy',memberIds:['moving']},C);
  let next=s;
  for(const x of [-90,-100,-200]){const r=G.resolveGroupMove(next,{id:'g',x,z:0},C,{snapMm:0});assert(r);near(r.x,x);next=r.state;}
  assert.deepEqual(warnings(next),[]);assert.equal(warnings(s).length,1);
});
test('angled old overlaps recover incrementally without vertex-rounding traps',()=>{
  const angle=37*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),world=x=>[c*x,-sn*x];
  const [x,z]=world(-80),a=S.createShelf({id:'moving',widthMm:100,depthMm:200,heightMm:1000,pose:pose(x,z,37)}),b=S.createShelf({id:'obstacle',widthMm:100,depthMm:200,heightMm:1000,pose:pose(0,0,37)});
  const initial=layout([a,b]);let next=initial;
  for(const distance of [-90,-101,-200]){const [x,z]=world(distance),r=move(next,'moving',x,z);near(r.x,x);near(r.z,z);next=r.state;}
  assert.deepEqual(warnings(next),[]);assert.equal(warnings(initial).length,1);
  let g=G.createGroup(initial,{id:'g',name:'Angled repair',memberIds:['moving']},C);
  const dx=world(-10),r=G.resolveGroupMove(g,{id:'g',x:g.groups[0].pose.xMm+dx[0],z:g.groups[0].pose.zMm+dx[1]},C,{snapMm:0});assert(r);near(r.x,g.groups[0].pose.xMm+dx[0]);
});
test('separate catalogs, mutable imports and successive group edits cannot reuse stale motion geometry',()=>{
  const small=S.createCatalog([{id:'m',widthMm:100,depthMm:100,heightMm:200}]),large=S.createCatalog([{id:'m',widthMm:800,depthMm:100,heightMm:200}]);
  const raw=structuredClone(layout([],[printer('p')]));raw.printers[0].machineId='m';
  const s=S.parseLayout(JSON.stringify(raw),small);
  assert.equal(S.deriveScene(s,small).printers[0].widthMm,100);assert.equal(S.deriveScene(s,large).printers[0].widthMm,800);assert.equal(S.deriveScene(s,small).printers[0].widthMm,100);
  Object.freeze(raw);assert.equal(S.deriveScene(raw,small).printers[0].xMm,0);raw.printers[0].attachment.xMm=321;assert.equal(S.deriveScene(raw,small).printers[0].xMm,321);
  const first=group(layout([desk('moving',-600),shelf('obstacle',0,0,30,3000)]));
  const contact=G.resolveGroupMove(first,{id:'g',x:600,z:0},C,{snapMm:0});near(contact.x,-115);
  const edited=S.applyAction(first,{type:'UPDATE_FURNITURE',id:'obstacle',patch:{pose:{xMm:1000}}},C);
  const free=G.resolveGroupMove(edited,{id:'g',x:600,z:0},C,{snapMm:0});near(free.x,600);assert.deepEqual(warnings(free.state),[]);
  assert.deepEqual(G.transformGroup(G.transformGroup(first,'g',{xMm:-900,yawDeg:17},C),'g',first.groups[0].pose,C),first);
});
test('maximum 64-support/128-printer fleet records full collision stop and group resolve timings',()=>{
  const furniture=Array.from({length:64},(_,i)=>desk(`d${i}`,(i%8)*1000-3500,Math.floor(i/8)*1000-3500,400,400));
  const printers=furniture.flatMap(f=>[printer(`${f.id}:left`,-100,0,f.id),printer(`${f.id}:right`,100,0,f.id)]);
  const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:12000,depthMm:12000}),furniture,printers},C);
  const grouped=G.createGroup(initial,{id:'g',name:'Large fleet',memberIds:['d0']},C);
  timings.individual=[];timings.group=[];
  for(let i=0;i<4;i++){
    let now=performance.now();const r=move(initial,'d0',-2000,-3200);timings.individual.push(performance.now()-now);assert(r.boundaryLimited);assert.deepEqual(warnings(r.state),[]);
    now=performance.now();const g=G.resolveGroupMove(grouped,{id:'g',x:-2000,z:-3200},C,{snapMm:0});timings.group.push(performance.now()-now);assert(g.boundaryLimited);assert.deepEqual(warnings(g.state),[]);
  }
});
test('every production registered footprint rejects furniture overlap and has finite thin-obstacle stop',()=>{
  const raw=JSON.parse(fs.readFileSync(path.join(dir,'layout-catalog.json'),'utf8'));
  const indexed=JSON.parse(fs.readFileSync(path.join(site,'assets/machines/index.json'),'utf8'));
  const entries=raw.machines.map(m=>({...m,widthMm:m.dimensionsMm.width,depthMm:m.dimensionsMm.depth,heightMm:m.dimensionsMm.height}));
  assert.deepEqual(new Set(entries.map(e=>e.id)),new Set(indexed.machines.map(e=>e.id)));
  const catalog=S.createCatalog(entries);
  for(const m of entries){
    const obstacle=shelf('obstacle',0,0,30,4000,9000),initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:20000,depthMm:20000,wallHeightMm:20000}),furniture:[obstacle],printers:[printer('p',-3000,0,null,'floor',m.id)]},catalog);
    const blocked=P.proposePlacement(initial,{kind:'printer',id:'copy',machineId:m.id,xMm:0,zMm:0,yawDeg:0,snapMm:0},catalog);assert.equal(blocked.valid,false,m.id);
    const r=S.resolveWorldMove(initial,{id:'p',x:3000,z:0},catalog,{snapMm:0});assert(r?.boundaryLimited,m.id);assert(r.x<0,m.id);
    assert.deepEqual(S.validatePlacement(r.state,catalog).filter(e=>e.code==='ENVELOPE_OVERLAP'),[],m.id);
    coverage.push({machineId:m.id,widthMm:m.widthMm,depthMm:m.depthMm,heightMm:m.heightMm,status:'PASS'});
  }
});
assert.deepEqual(hashes(),inputs,'Tested source changed during the run');
const report={schema:'layout-collision-integration-v1',testedAt:new Date().toISOString(),caseWorkers:1,passed:cases.every(c=>c.status==='PASS'),cases,coverage,inputs,timingsMs:timings,
  scope:'Production numerical planner footprints and vertical ranges plus synthetic furniture. Continuous envelope policy; no browser, GPU, native models or real solid clearance certification.'};
if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify(report,null,2)+'\n');
for(const c of cases.filter(c=>c.status==='FAIL'))console.error(JSON.stringify(c));
console.log(JSON.stringify({passed:report.passed,cases:cases.length,machines:coverage.length,failures:cases.filter(c=>c.status==='FAIL').map(c=>c.name)}));
if(!report.passed)process.exitCode=1;
