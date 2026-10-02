import assert from 'node:assert/strict';
import {circleBeltRoute, beltGeometry, v0BeltCircles, BELT_THICKNESS, BELT_WIDTH} from '../site/viewer/v0-belts.mjs';
import {v24FlexibleState} from '../site/viewer/v24-flexible.mjs';
import {tridentBeltCircles} from '../site/viewer/trident-belts.mjs';
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
// Independent fixture dimensions from the V0.2r1 bearing/pulley bounds.
const positions=[[-107.5,-1.1105056288,true],[96.12,-12.4905056288,true],
 [107.5,-107.5,false],[107.5,87.5,false],[107.5,107.5,false],[-107.5,107.5,false]];
const parts=[];
for(const mirror of [-1,1]){
 for(const [x,y,moving]of positions)parts.push({name:'F623-RS',motion:moving?'y':'fixed',bounds_mm:[[x*mirror-5.85,y-5.85,208],[x*mirror+5.85,y+5.85,216]]});
 parts.push({name:'Pulley',motion:'fixed',bounds_mm:[[82.5*mirror-8,87.5,207.35],[82.5*mirror+8,103.5,223.35]]});
}
const manifest={parts};
export function checkRoute(route) {
  for(let i=0;i<route.spans.length;i++){
    const s=route.spans[i],a=route.arcs[i],b=route.arcs[(i+1)%route.arcs.length];
    const dx=s.to[0]-s.from[0],dy=s.to[1]-s.from[1],length=Math.hypot(dx,dy);
    assert(length>1);near(dx*s.normal[0]+dy*s.normal[1],0);
    near(Math.hypot(s.from[0]-a.center[0],s.from[1]-a.center[1]),a.radius);
    near(Math.hypot(s.to[0]-b.center[0],s.to[1]-b.center[1]),b.radius);
  }
  assert(route.points.flat().every(Number.isFinite));
}
export function checkGeometry(geometry) {
  const attr=geometry.attributes.position,indices=geometry.index.array,edges=new Map();
  assert([...attr.array].every(Number.isFinite));
  for(let i=0;i<attr.count;i+=4){
    near(Math.hypot(attr.getX(i+1)-attr.getX(i),attr.getZ(i+1)-attr.getZ(i))*1000,BELT_THICKNESS,3e-5);
    near((attr.getY(i+2)-attr.getY(i+1))*1000,BELT_WIDTH,3e-5);
  }
  for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
    const a=indices[i+j],b=indices[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
    edges.set(key,(edges.get(key)||0)+1);
  }
  assert([...edges.values()].every(n=>n===2),'Belt has an open or nonmanifold seam');
}
export function checkNoCrossing(points) {
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
  if(i===0&&j===points.length-1)continue;
  const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
  assert(!(cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10),'Belt route crosses itself');
 }
}
for(const name of ['A Belt','B Belt']){
 const baseline=circleBeltRoute(v0BeltCircles(manifest,name));
 for(let y=0;y<=120;y+=.5){
  const route=circleBeltRoute(v0BeltCircles(manifest,name,y-67.28974685749));
  checkRoute(route);near(route.length,baseline.length);
  if(y%30===0){checkNoCrossing(route.points);const geometry=beltGeometry(route,name==='A Belt'?212:221);checkGeometry(geometry);geometry.dispose()}
 }
}
assert.deepEqual(v24FlexibleState({name:'Z Belt (2)'},[100,100,100],true),{visible:true,z:0});
assert.deepEqual(v24FlexibleState({name:'A Belt'},[0,0,100],true),{visible:true,z:100});
assert.equal(v24FlexibleState({name:'A Belt'},[1,0,0],true).visible,false);
assert.equal(v24FlexibleState({name:'Z Belt'},[0,0,0],false).visible,false);
assert.throws(()=>v0BeltCircles({parts:[]},'A Belt'),/registration/);
assert.throws(()=>circleBeltRoute([{x:0,y:0,r:10,turn:1},{x:1,y:0,r:10,turn:-1}]),/tangent/);
console.log('Belt checks passed: 482 routes, constant length, tangency, width, thickness, closed seams and V2.4 axis dependencies.');
const tridentParts=[];
for(const mirror of [-1,1])for(const [x,y,moving,name]of [[-226,-.5,true,'F695'],[212.76,-13.74,true,'GT2 20T Idler'],[226,-220.25,false,'M5x16 BHCS'],[226,216.5,false,'F695'],[196,231,false,'GT2 20T Pulley'],[192,247.5,false,'F695'],[-192,247.5,false,'F695'],[-226,216.5,false,'F695']]){
 tridentParts.push({name,motion:moving?'y':'fixed',bounds_mm:[[x*mirror-1,y-1,350],[x*mirror+1,y+1,356]]});
}
const trident={id:'trident_r2_gantry_350',belt_width_mm:6,parts:tridentParts};
for(const name of ['A_Belt','B_Belt']){
 const baseline=circleBeltRoute(tridentBeltCircles(trident,name));
 for(let dy=-180;dy<=180;dy+=.5){
  const circles=tridentBeltCircles(trident,name,dy),route=circleBeltRoute(circles);
  checkRoute(route);near(route.length,baseline.length,1e-6);
  assert.equal(circles.filter(c=>c.moving).length,2);
  circles.filter(c=>!c.moving).forEach(c=>assert(tridentBeltCircles(trident,name).some(b=>!b.moving&&b.x===c.x&&b.y===c.y)));
  if(dy%30===0){checkNoCrossing(route.points);const g=beltGeometry(route,365.05);checkGeometry(g);g.dispose()}
 }
}
assert.throws(()=>tridentBeltCircles({...trident,belt_width_mm:9},'A_Belt'),/profile/);
assert.throws(()=>tridentBeltCircles({...trident,parts:[]},'A_Belt'),/registration/);
console.log('Trident R2 belt checks passed: 1,442 routes, CAD envelope radii, fixed axes, tangency, length, closed seams and crossings.');
