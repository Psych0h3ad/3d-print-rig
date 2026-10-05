import * as THREE from './vendor/three.module.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const placed=(p,size,dx,dy)=>[p[0]+(Math.abs(p[0])>75?Math.sign(p[0])*(size-250)/2:dx),p[1]+(Math.abs(p[1])>100?Math.sign(p[1])*(size-250)/2:dy)];

// Keep each straight span in its native direction. Rail travel alone can put
// a head clamp beyond an idler and reverse the belt at the edge of travel.
export function monolithBeltTravelLimits(sources,size,cut){
 const limits=[[-Infinity,Infinity],[-Infinity,Infinity]],minimum=.01;
 for(const source of sources)for(const [index,segment]of source.segments.entries()){
  if(segment.kind!=='line')continue;
  const a=segment.points[0],b=segment.points[2],length=distance(a,b),direction=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  const span=(dx,dy)=>{
   const p=placed(a,size,dx,dy),q=placed(b,size,dx,dy);
   if(cut&&index===0)p[0]=(a[0]<0?cut.x_mm[0]:cut.x_mm[1])+dx;
   if(cut&&index===source.segments.length-1)q[0]=(b[0]<0?cut.x_mm[0]:cut.x_mm[1])+dx;
   return (q[0]-p[0])*direction[0]+(q[1]-p[1])*direction[1];
  };
  const rest=span(0,0),slope=[span(1,0)-rest,span(0,1)-rest];
  if(slope.filter(v=>Math.abs(v)>1e-8).length>1)throw Error('Monolithの斜めベルト制限は未登録です');
  for(const [axis,value]of slope.entries())if(Math.abs(value)>1e-8){
   const bound=(minimum-rest)/value;
   if(value>0)limits[axis][0]=Math.max(limits[axis][0],bound);else limits[axis][1]=Math.min(limits[axis][1],bound);
  }
 }
 return {x_delta_limits_mm:limits[0],y_delta_limits_mm:limits[1]};
}

// The source has open ends at the head and Y-moving idlers. Only straight
// spans change length; pulley arcs remain rigid and retain their native radii.
export function monolithBeltRoute(source,size,dx=0,dy=0,cut){
 const points=[],normals=[],segments=[];let length=0;
 for(const [i,segment] of source.segments.entries()){
  const p=segment.points.map(v=>placed(v,size,dx,dy));
  if(cut&&i===0)p[0][0]=(segment.points[0][0]<0?cut.x_mm[0]:cut.x_mm[1])+dx;
  if(cut&&i===source.segments.length-1)p[2][0]=(segment.points[2][0]<0?cut.x_mm[0]:cut.x_mm[1])+dx;
  if(segment.kind==='line'){
   const len=distance(p[0],p[2]);if(len<.001)throw Error('Monolithのベルト直線長が範囲外です');
   const normal=[-(p[2][1]-p[0][1])/len,(p[2][0]-p[0][0])/len];
   points.push(p[0],p[2]);normals.push(normal,normal);length+=len;segments.push({...segment,points:p,length:len});
  }else{
   const center=placed(segment.center,size,0,dy),angle=Math.atan2(p[0][1]-center[1],p[0][0]-center[0]),steps=Math.max(2,Math.ceil(segment.sweep*segment.radius/.65));
   for(let j=0;j<=steps;j++){const a=angle+segment.turn*segment.sweep*j/steps,c=Math.cos(a),s=Math.sin(a);points.push([center[0]+segment.radius*c,center[1]+segment.radius*s]);normals.push([-c*segment.turn,-s*segment.turn])}
   length+=segment.sweep*segment.radius;segments.push({...segment,center,points:p});
  }
 }
 // A line and the next arc share an endpoint. Average the duplicate's normal
 // and keep one ring so joins remain watertight without zero-area quads.
 const clean=[],n=[];
 for(let i=0;i<points.length;i++)if(clean.length&&distance(clean.at(-1),points[i])<.00001){const a=n.at(-1),b=normals[i],l=Math.hypot(a[0]+b[0],a[1]+b[1]);if(l<1.9)throw Error('Monolithのベルト接線が連続していません');n[n.length-1]=[(a[0]+b[0])/l,(a[1]+b[1])/l]}else{clean.push(points[i]);n.push(normals[i])}
 return {points:clean,normals:n,length,segments,z:source.z,width:source.width,thickness:source.thickness};
}

export function monolithBeltGeometry(route){
 const vertices=[],indices=[];
 // Routes may supply either a left or a right tangent normal. Both describe
 // the same belt, but their ring orders require opposite triangle winding.
 let handedness=0;
 for(let i=0;i<route.points.length-1&&Math.abs(handedness)<1e-9;i++){
  const a=route.points[i],b=route.points[i+1],n=route.normals[i];
  handedness=(b[0]-a[0])*n[1]-(b[1]-a[1])*n[0];
 }
 if(!Number.isFinite(handedness)||Math.abs(handedness)<1e-9)throw Error('Belt route has no oriented span');
 for(let i=0;i<route.points.length;i++)for(const [side,height] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
  const p=route.points[i],n=route.normals[i];vertices.push((p[0]+side*n[0]*route.thickness/2)/1000,(route.z+height*route.width/2)/1000,-(p[1]+side*n[1]*route.thickness/2)/1000);
 }
 for(let i=0;i<route.points.length-1;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=b+4,d=a+4;indices.push(a,b,c,a,c,d)}
 const end=(route.points.length-1)*4;indices.push(0,2,1,0,3,2,end,end+1,end+2,end,end+2,end+3);
 if(handedness<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
