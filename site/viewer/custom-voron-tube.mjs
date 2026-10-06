import * as THREE from './vendor/three.module.js';
const world=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
export function customTubeCurve(spec,dx=0,dy=0){
 const points=spec.controls_mm.map((p,i)=>world([p[0]+(i<2?dx:0),p[1]+(i<2?dy:0),p[2]]));
 const path=new THREE.CurvePath();
 if(spec.start_mm)path.add(new THREE.LineCurve3(world([spec.start_mm[0]+dx,spec.start_mm[1]+dy,spec.start_mm[2]]),points[0]));
 path.add(new THREE.CubicBezierCurve3(...points.slice(0,4)));
 path.add(new THREE.LineCurve3(points[3],points[4]));
 path.add(new THREE.CubicBezierCurve3(...points.slice(4)));
 if(spec.end_mm)path.add(new THREE.LineCurve3(points.at(-1),world(spec.end_mm)));
 return path;
}
// Use the same hollow route at rest, during motion and after reset. Swapping a
// native sweep for a differently tessellated solid tube on the first XY input
// caused a visible pop and lost the 3 mm filament passage.
export function customTubeGeometry(spec,dx=0,dy=0){
 const curve=customTubeCurve(spec,dx,dy),segments=256,sides=16;
 const frames=curve.computeFrenetFrames(segments,false),positions=[],normals=[],indices=[];
 const radii=[spec.radius_mm/1000,spec.inner_radius_mm/1000];
 const stride=sides+1,layer=(segments+1)*stride;
 for(const [shell,radius]of radii.entries())for(let i=0;i<=segments;i++){
  const p=curve.getPointAt(i/segments);
  for(let j=0;j<=sides;j++){
   const angle=2*Math.PI*j/sides,n=frames.normals[i].clone().multiplyScalar(-Math.cos(angle)).addScaledVector(frames.binormals[i],Math.sin(angle));
   positions.push(p.x+radius*n.x,p.y+radius*n.y,p.z+radius*n.z);
   normals.push(...n.multiplyScalar(shell?-1:1).toArray());
  }
 }
 for(let shell=0;shell<2;shell++)for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
  const a=shell*layer+i*stride+j,b=a+stride,c=b+1,d=a+1;
  indices.push(...(shell?[a,d,b,b,d,c]:[a,b,d,b,c,d]));
 }
 // Annular end faces have their own normals, so the rims stay crisp.
 for(const end of [0,segments]){
  const start=positions.length/3,tangent=curve.getTangentAt(end/segments).multiplyScalar(end?1:-1);
  for(let shell=0;shell<2;shell++)for(let j=0;j<=sides;j++){
   const index=(shell*layer+end*stride+j)*3;
   positions.push(...positions.slice(index,index+3));normals.push(...tangent.toArray());
  }
  for(let j=0;j<sides;j++){
   const a=start+j,b=a+stride,c=b+1,d=a+1;
   indices.push(...(end?[a,b,d,b,c,d]:[a,d,b,b,d,c]));
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function createCustomTube(root,manifest){
 const spec=manifest.custom_ptfe;if(!spec)return null;
 let mesh;root.traverse(n=>{if(n.isMesh&&n.userData?.part_key===spec.part_key)mesh=n});
 if(!mesh)throw Error('Missing custom PTFE source');
 const native=mesh.geometry;let preview=null,last=[];
 return {update(dx=0,dy=0,visible=true){
  if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Non-finite PTFE pose');
  mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.visible=visible;mesh.frustumCulled=false;
  if(last[0]===dx&&last[1]===dy)return;
  preview?.dispose();preview=customTubeGeometry(spec,dx,dy);mesh.geometry=preview;last=[dx,dy];
 },dispose(){mesh.geometry=native;preview?.dispose();preview=null}};
}
