import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {v24BeltCircles,v24BeltRoute,createV24Belts} from '../site/viewer/v24-belts.mjs';
import {monolithBeltGeometry} from '../site/viewer/monolith-belts.mjs';
import {v24FlexibleState} from '../site/viewer/v24-flexible.mjs';
const fixture=JSON.parse(await readFile(new URL('fixtures/v24-belt-contacts.json',import.meta.url),'utf8'));
const near=(a,b,t=1e-5)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
let routes=0,maximumLengthChange=0;
for(const row of fixture.records){
 const circles=v24BeltCircles(row.size,row.name),rest=v24BeltRoute(row.size,row.name,0,0,row.z);
 near(row.width,6);assert.equal(circles.length,7);
 for(const c of circles){const source=row.contacts.find(p=>Math.hypot(c.x-p.center[0],c.y-p.center[1])<.001);assert(source,'Native pulley datum missing');near(c.r,source.radius)}
 for(let y=0;y<=row.size;y++){
  const dy=y-(row.size/2+4.1),dx=(y/row.size-.5)*row.size,route=v24BeltRoute(row.size,row.name,dx,dy,row.z);
  assert(route.points.flat().every(Number.isFinite));assert(route.normals.flat().every(Number.isFinite));assert.equal(route.arcs.length,7);
  for(const [i,s]of route.spans.entries()){
   const a=route.arcs[i],b=route.arcs[i+1];near(Math.hypot(s.from[0]-a.center[0],s.from[1]-a.center[1]),a.radius);near(Math.hypot(s.to[0]-b.center[0],s.to[1]-b.center[1]),b.radius);
   near((s.to[0]-s.from[0])*s.normal[0]+(s.to[1]-s.from[1])*s.normal[1],0);
  }
  const mirror=row.name==='A Belt'?1:-1;near(route.points[0][0],-10*mirror+dx);near(route.points.at(-1)[0],10*mirror+dx);
  for(const [i,a]of route.arcs.entries()){near(a.radius,rest.arcs[i].radius);near(a.center[0],rest.arcs[i].center[0]);near(a.center[1],rest.arcs[i].center[1]+(circles[i].moving?dy:0))}
  maximumLengthChange=Math.max(maximumLengthChange,Math.abs(route.length-rest.length));
  if(y%50===0||y===row.size){
   const g=monolithBeltGeometry(route),p=g.attributes.position,edges=new Map();
   for(let i=0;i<p.count;i+=4){near(Math.hypot(p.getX(i+1)-p.getX(i),p.getZ(i+1)-p.getZ(i))*1000,1.38,4e-5);near((p.getY(i+2)-p.getY(i+1))*1000,6,4e-5)}
   const indices=g.index.array;for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const k=[indices[i+j],indices[i+(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(k,(edges.get(k)||0)+1)}assert([...edges.values()].every(n=>n===2),'Open belt solid has a seam');g.dispose();
  }
  routes++;
 }
}
assert(maximumLengthChange<.02,maximumLengthChange);assert.equal(createV24Belts(new Map(),{parts:[]},{}).entries.length,0);
assert.throws(()=>v24BeltRoute(300,'A Belt',500),/clamp outside/);
assert.equal(v24FlexibleState({name:'A Belt'},[50,80,120],true).visible,true);
assert.deepEqual(v24FlexibleState({name:'Z Belt (2)'},[50,80,120],true),{visible:true,z:0});
assert.equal(v24FlexibleState({name:'B Belt'},[50,80,120],false).visible,false);
console.log(`V2.4 belts: 42 independent native pulley datums, ${routes} moving routes, 6 mm width, 1.38 mm thickness, tangent contacts, cut clamp ends and manifold caps passed (length change ${maximumLengthChange.toFixed(6)} mm).`);
