// Independent continuous translation oracle + conservative rotation regression.
// These are numerical planning envelopes; no native solid or browser evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const dir=path.join(path.resolve(option('--site')??path.join(root,'site')),'layout');
const C=await import(pathToFileURL(path.join(dir,'layout-collision.mjs')));
const files=['layout-collision.mjs','layout-geometry.mjs','layout-constraints.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex')]));
const inputs=hashes(),cases=[],timings=[];
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const rect=(cx,cz,w,d)=>[[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx+w/2,cz+d/2],[cx-w/2,cz+d/2]];
const entity=(id,polygon,range=[0,100])=>({id,type:'shelf',...pose(),worldEnvelopeMm:polygon,verticalRangeMm:range});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const scene=entities=>freeze({furniture:entities.filter(e=>e.type!=='printer'),printers:entities.filter(e=>e.type==='printer')});
const moving=(poly,other,range=[0,100],otherRange=[0,100])=>C.prepareCollisionMotion(scene([entity('moving',poly,range),entity('fixed',other,otherRange)]),['moving'],pose(),new Map([['moving',poly]]));
function test(name,run){try{run();cases.push({name,status:'PASS'});}catch(e){cases.push({name,status:'FAIL',error:e.stack});}}
// Independent open-interval slab intersection: positive rectangular overlap
// exists at some real t in [0,1]. No triangulation or production geometry calls.
function oracle(a,b,dx,dz){
  let low=-Infinity,high=Infinity;
  for(const [minA,maxA,minB,maxB,v]of [[a[0],a[1],b[0],b[1],dx],[a[2],a[3],b[2],b[3],dz]]){
    if(v===0){if(maxA<=minB||maxB<=minA)return false;continue;}
    const left=(minB-maxA)/v,right=(maxB-minA)/v;
    low=Math.max(low,Math.min(left,right));high=Math.min(high,Math.max(left,right));
  }
  return Math.max(low,0)<Math.min(high,1)||low<0&&high>0||low<1&&high>1;
}
let oracleCases=0;
test('independent slab oracle: 1200 seeded min/max/intermediate/reversed and large translations',()=>{
  let seed=92471;const random=()=>{seed=(seed*48271)%2147483647;return seed;};
  while(oracleCases<1200){
    const w=30+random()%500,d=30+random()%500,ow=30+random()%400,od=30+random()%400;
    const x=random()%4001-2000,z=random()%4001-2000,ox=random()%4001-2000,oz=random()%4001-2000;
    const a=[x-w/2,x+w/2,z-d/2,z+d/2],b=[ox-ow/2,ox+ow/2,oz-od/2,oz+od/2];
    if(oracle(a,b,0,0))continue;
    const dx=[-1000000,1000000,0,random()%6001-3000][random()%4],dz=[-1000000,1000000,0,random()%6001-3000][random()%4];
    const motion=moving(rect(x,z,w,d),rect(ox,oz,ow,od));
    assert.equal(motion.accepts(pose(dx,dz)),!oracle(a,b,dx,dz),JSON.stringify({a,b,dx,dz}));
    oracleCases++;
  }
});
test('exact edge and corner tangency, reversed polygon winding, and one representable overlap',()=>{
  for(const reverse of [false,true]){
    const polygon=rect(-100,0,100,100),obstacle=rect(0,0,100,100);
    const m=moving(reverse?polygon.reverse():polygon,reverse?obstacle.reverse():obstacle);
    assert(m.accepts(pose(0,1000)));assert(m.accepts(pose(-100,0)));
    assert.equal(m.accepts(pose(2**-40,0)),false);
    assert(moving(rect(-200,0,100,100),rect(0,0,100,100)).accepts(pose(200,200))); // one corner at t=0.5
  }
});
test('thin obstacle between clear endpoints cannot be missed even at submillimetre widths',()=>{
  const m=moving(rect(-500000,0,100,100),rect(123.4567,0,1e-6,1000));
  assert.equal(m.accepts(pose(1000000,0)),false);
  assert(m.accepts(pose(0,1000000)));
});
test('concave source footprint empty notch stays usable; all lobe paths remain checked',()=>{
  const poly=[[0,0],[300,0],[300,100],[100,100],[100,300],[0,300]],obstacle=rect(200,200,40,40);
  const m=moving(poly,obstacle);assert(m.accepts(pose(0,-20)));
  assert.equal(m.accepts(pose(200,0)),false);
});
test('vertical face touch is clear, positive height overlap blocks, own parent only is excluded',()=>{
  assert(moving(rect(-200,0,100,100),rect(0,0,100,100),[100,200],[0,100]).accepts(pose(400,0)));
  assert.equal(moving(rect(-200,0,100,100),rect(0,0,100,100),[100,200],[0,100+2**-40]).accepts(pose(400,0)),false);
  const parent=entity('parent',rect(0,0,500,500),[0,1000]),p={...entity('p',rect(0,0,100,100),[100,300]),type:'printer',parentId:'parent'};
  const s=scene([parent,p,entity('unrelated',rect(400,0,100,100),[0,1000])]);
  assert.deepEqual(C.envelopeOverlaps(s),[]);
  assert.equal(C.prepareCollisionMotion(s,['p'],pose()).accepts(pose(400,0)),false);
  assert(C.prepareCollisionMotion(s,['parent','p'],pose()).accepts(pose(-400,0)));
});
test('rotation endpoints clear but intermediate arc blocked, both signs and full turns',()=>{
  const poly=rect(0,0,600,40),m=moving(poly,rect(0,-220,80,40));
  for(const angle of [-360,-180,180,360])assert.equal(m.accepts(pose(0,0,angle)),false);
  assert(m.accepts(pose(0,0,15)));
  const far=moving(poly,rect(450,450,100,100));
  for(const angle of [-360,-180,90,180,360])assert(far.accepts(pose(0,0,angle)));
});
test('combined translation and signed rotation encloses intermediate obstacles and preserves sparse gap',()=>{
  const a=entity('a',rect(-500,0,100,100)),b=entity('b',rect(500,0,100,100)),fixed=entity('obstacle',rect(0,0,50,50));
  const s=scene([a,b,fixed]),m=C.prepareCollisionMotion(s,['a','b'],pose());
  assert(m.accepts(pose(0,100,90)));
  assert.equal(m.accepts(pose(500,0,360)),false);
});
test('legacy overlap can shrink its nearest separating projection incrementally, including concave shapes',()=>{
  const m=moving(rect(-80,0,100,100),rect(0,0,100,100));
  for(const dx of [-1000,-20,-10,0])assert(m.accepts(pose(dx,0)));
  assert.equal(m.accepts(pose(10,0)),false);
  const poly=[[0,0],[300,0],[300,100],[100,100],[100,300],[0,300]],n=moving(poly,rect(10,100,40,40));
  assert(n.accepts(pose(10,0)));assert(n.accepts(pose(1000,0)));
});
test('mutable scene inputs do not retain stale cached geometry',()=>{
  const s={furniture:[entity('a',rect(-500,0,100,100)),entity('b',rect(0,0,100,100))],printers:[]};
  assert.equal(C.envelopeOverlaps(s).length,0);s.furniture[0].worldEnvelopeMm=rect(0,0,100,100);assert.equal(C.envelopeOverlaps(s).length,1);
});
test('bounded fleet work reuses prepared static/moving entities across repeated prefix requests',()=>{
  const entities=Array.from({length:192},(_,i)=>entity(`e${i}`,rect((i%16)*400,Math.floor(i/16)*400,100,100)));
  const s=scene(entities),ids=entities.slice(0,8).map(e=>e.id),m=C.prepareCollisionMotion(s,ids,pose());
  assert.strictEqual(C.prepareCollisionMotion(s,ids,pose()),m);
  for(let i=0;i<20;i++){const start=performance.now();assert(m.accepts(pose(0,150)));timings.push(performance.now()-start);}
});
assert.deepEqual(hashes(),inputs,'Source changed during independent review');
const report={schema:'layout-collision-independent-sweep-v1',testedAt:new Date().toISOString(),caseWorkers:1,passed:cases.every(c=>c.status==='PASS'),cases,oracleCases,inputs,
  timingsMs:{median:timings.slice().sort((a,b)=>a-b)[Math.floor(timings.length/2)],max:Math.max(...timings)},
  scope:'Independent analytic translation slab oracle; synthetic exact touch/vertical/concave/group cases; continuous conservative rotation enclosures. No native CAD, browser, or frame-rate certification.'};
if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify(report,null,2)+'\n');
for(const c of cases.filter(c=>c.status==='FAIL'))console.error(JSON.stringify(c));
console.log(JSON.stringify({passed:report.passed,cases:cases.length,oracleCases,failures:cases.filter(c=>c.status==='FAIL').map(c=>c.name),timingsMs:report.timingsMs}));
if(!report.passed)process.exitCode=1;
