// Planning footprints only. Never alters a source model or certifies CAD fit.
import {orient,polygonContains,transformPolygon,triangulatePolygon,rotateXZ} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

function hull(points){
 const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 const half=values=>{const result=[];for(const p of values){while(result.length>1&&orient(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p)}return result;};
 const a=half(sorted),b=half(sorted.slice().reverse());return [...a.slice(0,-1),...b.slice(0,-1)];
}

// The extrusion of each source triangle is exactly its six-point convex hull.
// This covers every intermediate translation, not just a finite pose grid.
export function translationStaysInside(outer,polygon,dx,dz){
 if(!polygonContains(outer,polygon))return false;
 if(dx===0&&dz===0)return true;
 const end=polygon.map(([x,z])=>[x+dx,z+dz]);if(!polygonContains(outer,end))return false;
 return triangulatePolygon(polygon).every(triangle=>polygonContains(outer,hull([...triangle,...triangle.map(([x,z])=>[x+dx,z+dz])])));
}

const shortYaw=(a,b)=>{const d=b-a;let value=((d+180)%360+360)%360-180;if(value===-180&&d>0)value=180;return value;};
// A finite tangent-triangle subdivision cannot prove an interior arc that
// touches a wall exactly. A disk enclosing the local footprint supplies an
// independent continuous proof when its swept capsule fits a convex room.
// Compare squared half-plane distances as exact binary64 dyadics: rounding a
// radius/distance or adding a tolerance could accept a genuinely smaller room.
const diskScratch=new DataView(new ArrayBuffer(8));
function diskCoordinate(value){
 if(value===0)return [0n,0];
 diskScratch.setFloat64(0,value,false);
 const bits=diskScratch.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n);
 return [(bits>>63n?-1n:1n)*((bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n)),exponent?exponent-1075:-1074];
}
function sweptDiskStaysInside(outer,local,start,end){
 const turns=outer.map((p,i)=>orient(p,outer[(i+1)%outer.length],outer[(i+2)%outer.length]));
 const winding=turns.find(Boolean);
 if(!winding||turns.some(turn=>turn&&turn!==winding))return false;
 const exact=[...outer,...local,[start.xMm,start.zMm],[end.xMm,end.zMm]].map(p=>p.map(diskCoordinate));
 const power=Math.min(0,...exact.flat().map(([,exponent])=>exponent));
 const points=exact.map(p=>p.map(([n,exponent])=>n<<BigInt(exponent-power)));
 const walls=points.slice(0,outer.length),centres=points.slice(-2);
 let radiusSquared=0n;
 for(const [x,z]of points.slice(outer.length,-2)){
  const squared=x*x+z*z;if(squared>radiusSquared)radiusSquared=squared;
 }
 for(let i=0;i<walls.length;i++){
  const a=walls[i],b=walls[(i+1)%walls.length],dx=b[0]-a[0],dz=b[1]-a[1];
  const required=radiusSquared*(dx*dx+dz*dz);
  for(const p of centres){
   const cross=dx*(p[1]-a[1])-dz*(p[0]-a[0]);
   if(cross*BigInt(winding)<0n||cross*cross<required)return false;
  }
 }
 // A disk is convex, so it covers every footprint triangle; each wall's
 // signed distance is linear along the centre's translation segment.
 return true;
}
// A circular arc shorter than 180deg lies inside its endpoint/tangent triangle.
// Minkowski addition of the translation segment encloses the entire rigid path.
// Subdivision tightens that enclosure. An unproved cell is rejected, never waived.
export function rigidMotionStaysInside(outer,local,start,end){
 const from=transformPolygon(local,start),to=transformPolygon(local,end);
 if(!polygonContains(outer,from)||!polygonContains(outer,to))return false;
 const yaw=shortYaw(start.yawDeg,end.yawDeg),dx=end.xMm-start.xMm,dz=end.zMm-start.zMm;
 if(yaw===0)return translationStaysInside(outer,from,dx,dz);
 let budget=256;
 const enclosure=(triangle,a,b)=>{
  const angleA=start.yawDeg+yaw*a,angleB=start.yawDeg+yaw*b,angleM=(angleA+angleB)/2;
  const cosine=Math.cos((angleB-angleA)*Math.PI/360),points=[];
  for(const p of triangle){
   const mid=rotateXZ(p,angleM),arc=[rotateXZ(p,angleA),rotateXZ(p,angleB),[mid[0]/cosine,mid[1]/cosine]];
   for(const q of arc)for(const t of [a,b])points.push([q[0]+start.xMm+dx*t,q[1]+start.zMm+dz*t]);
  }
  return hull(points);
 };
 const inside=(triangle,a,b,depth)=>{
  if(--budget<0)return false;
  if(polygonContains(outer,enclosure(triangle,a,b)))return true;
  if(depth===8)return false;
  const middle=(a+b)/2;return inside(triangle,a,middle,depth+1)&&inside(triangle,middle,b,depth+1);
 };
 const parts=Math.ceil(Math.abs(yaw)/90);
 const enclosed=triangulatePolygon(local).every(triangle=>{
  for(let i=0;i<parts;i++)if(!inside(triangle,i/parts,(i+1)/parts,0))return false;
  return true;
 });
 return enclosed||sweptDiskStaysInside(outer,local,start,end);
}

// Contact tolerance selects candidate wall tangents only. It never waives a
// containment test: the complete subsequent swept path must still be inside.
export function boundaryTangents(outer,polygon){
 const pointDistance=(p,a,b)=>{
  const x=b[0]-a[0],z=b[1]-a[1],length=x*x+z*z;
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*z)/length));
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*z);
 };
 const scale=Math.max(1,...outer.flat().map(Math.abs),...polygon.flat().map(Math.abs));
 const tolerance=Math.max(1e-7,scale*Number.EPSILON*64),result=[];
 for(let i=0;i<outer.length;i++){
  const a=outer[i],b=outer[(i+1)%outer.length];
  if(!polygon.some((p,j)=>{
   const q=polygon[(j+1)%polygon.length];
   return Math.min(pointDistance(p,a,b),pointDistance(q,a,b),pointDistance(a,p,q),pointDistance(b,p,q))<=tolerance;
  }))continue;
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  result.push([(b[0]-a[0])/length,(b[1]-a[1])/length]);
 }
 return result;
}
