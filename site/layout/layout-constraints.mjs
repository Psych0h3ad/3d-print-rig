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
 return triangulatePolygon(local).every(triangle=>{
  for(let i=0;i<parts;i++)if(!inside(triangle,i/parts,(i+1)/parts,0))return false;
  return true;
 });
}
