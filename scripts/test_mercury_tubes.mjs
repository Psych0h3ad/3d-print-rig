import assert from 'node:assert/strict';
import {mercuryTubeSpecs,mercuryTubeRoute,mercuryPoint} from '../site/viewer/mercury-tube-routes.mjs';
const ranges={mercury_one1_235:[[-100,100],[-100,90],[-200,100]],mercury_one1_370:[[-160,160],[-160,150],[-300,60]]};
let count=0;
for(const[id,spec]of Object.entries(mercuryTubeSpecs))for(let x=0;x<=10;x++)for(let y=0;y<=10;y++)for(const z of [ranges[id][2][0],0,ranges[id][2][1]]){
 const pose={x:ranges[id][0][0]+x*(ranges[id][0][1]-ranges[id][0][0])/10,y:ranges[id][1][0]+y*(ranges[id][1][1]-ranges[id][1][0])/10,z};
 const route=mercuryTubeRoute(id,pose),[start,end]=route.endpoints_mm;
 assert.deepEqual(start,spec.head.map((v,i)=>v+(i===0?pose.x:i===1?pose.y:0)));assert.deepEqual(end,spec.fixed);
 assert(Math.abs(route.length_mm-spec.length)<.02,'native service length changed');
 assert(route.curve.getPoint(0).distanceTo(mercuryPoint(start))<1e-12);assert(route.curve.getPoint(1).distanceTo(mercuryPoint(end))<1e-12);
 const tangent=(c,last)=>c.isCubicBezierCurve3?(last?c.v3.clone().sub(c.v2):c.v1.clone().sub(c.v0)).normalize():c.getTangent(last?1:0);
 for(let i=0;i<route.curve.curves.length-1;i++){const a=route.curve.curves[i],b=route.curve.curves[i+1];assert(a.getPoint(1).distanceTo(b.getPoint(0))<1e-12);assert(tangent(a,true).dot(tangent(b,false))>.999999999)}
 assert(route.curve.curves[0].isLineCurve3&&route.curve.curves.at(-1).isLineCurve3);
 for(let i=0;i<=256;i++)assert(route.curve.getPoint(i/256).toArray().every(Number.isFinite));count++;
}
assert.throws(()=>mercuryTubeRoute('unknown',{x:0,y:0,z:0}));
console.log('Mercury: '+count+' routes preserve both fitting axes, fixed guides, continuous tangents and native service length.');
