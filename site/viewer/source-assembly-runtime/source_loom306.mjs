// Genuine source endpoints, constant-length illustrative rounded arch; no CAD or rigid source edits.
import * as THREE from'three';
const Y=new THREE.Vector3(0,1,0);
export function loomCurve(route,hosts,segments=route.segments??192){
 const a=hosts[0].position,d=hosts[1].position,L=route.display_constant_length_m,R=route.corner_radius_m;
 const span=d.clone().sub(a);span.y=0;const D=span.length(),u=span.clone().normalize();
 if(!(D>2*R&&R>route.display_diameter_mm*.0005))throw Error('Source endpoint span cannot carry a finite6mm rounded arch');
 const H=(L+a.y+d.y-D-(Math.PI-4)*R)/2,A=H-R-a.y,B=D-2*R,C=H-R-d.y,Q=Math.PI*R/2;
 if(!(A>0&&B>0&&C>0))throw Error('Source illustration arc reserve is insufficient for positive tangent lengths');
 function at(s){
  if(s<=A)return{p:a.clone().addScaledVector(Y,s),t:Y.clone()};s-=A;
  if(s<=Q){const theta=Math.PI-s/R,c=a.clone().addScaledVector(u,R);c.y=H-R;return{p:c.addScaledVector(u,R*Math.cos(theta)).addScaledVector(Y,R*Math.sin(theta)),t:u.clone().multiplyScalar(Math.sin(theta)).addScaledVector(Y,-Math.cos(theta))};}s-=Q;
  if(s<=B){const p=a.clone().addScaledVector(u,R+s);p.y=H;return{p,t:u.clone()};}s-=B;
  if(s<=Q){const theta=Math.PI/2-s/R,c=d.clone().addScaledVector(u,-R);c.y=H-R;return{p:c.addScaledVector(u,R*Math.cos(theta)).addScaledVector(Y,R*Math.sin(theta)),t:u.clone().multiplyScalar(Math.sin(theta)).addScaledVector(Y,-Math.cos(theta))};}s-=Q;
  return{p:d.clone().addScaledVector(Y,C-s),t:Y.clone().negate()};
 }
 const points=[],tangents=[];for(let i=0;i<=segments;i++){const q=at(L*i/segments);points.push(q.p);tangents.push(q.t.normalize());}
 points[0]=a.clone();points[segments]=d.clone();return{points,tangents,actual_length_m:L,polyline_length_m:points.slice(1).reduce((s,p,i)=>s+p.distanceTo(points[i]),0),minimum_analytic_radius_m:R,minimum_derivative_norm:1,arch_height_m:H,origin:a.clone()};
}
function float32AtOrBelow(x,upper){const a=new Float32Array([x]);if(a[0]>upper){const u=new Uint32Array(a.buffer);u[0]+=a[0]>=0?-1:1;}return a[0];}
export function tubeGeometry(points,radius,radial=12,tangents,origin=points[0]){
 if(!tangents||points.length!==tangents.length)throw Error('Analytic positive source path tangents required');
 const vs=[],ns=[],ix=[];let u=new THREE.Vector3(1,0,0),previous=tangents[0].clone();u.addScaledVector(previous,-u.dot(previous)).normalize();let maxRepresentationRound_m=0;
 for(let j=0;j<points.length;j++){
  const t=tangents[j];if(Math.abs(t.length()-1)>1e-10||previous.dot(t)<0)throw Error('Nonfinite/antipodal source path tangent');
  if(j){u.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(previous,t));u.addScaledVector(t,-u.dot(t)).normalize();}
  const w=t.clone().cross(u).normalize(),local=points[j].clone().sub(origin);
  for(let k=0;k<radial;k++){
   const n=u.clone().multiplyScalar(Math.cos(2*Math.PI*k/radial)).addScaledVector(w,Math.sin(2*Math.PI*k/radial)),v=local.clone().addScaledVector(n,radius);
   // At the straight head exit, round the exact source-floor tangent inward by <=1 float32 ULP.
   // No geometric offset/rigid edit. Nominal centre/radius remain unchanged; record representation error.
   if(j===0||Math.abs(local.x)<1e-14&&Math.abs(local.z)<1e-14){if(Math.abs(v.z-radius)<1e-13){const value=float32AtOrBelow(v.z,radius);maxRepresentationRound_m=Math.max(maxRepresentationRound_m,Math.abs(value-v.z));v.z=value;}}
   vs.push(...v.toArray());ns.push(...n.toArray());
  }
  previous=t.clone();
 }
 for(let j=0;j<points.length-1;j++)for(let k=0;k<radial;k++){const a=j*radial+k,b=j*radial+(k+1)%radial,c=b+radial,d=a+radial;ix.push(a,b,c,a,c,d);}
 for(const j of[0,points.length-1]){const centre=vs.length/3,n=tangents[j].clone().multiplyScalar(j===0?-1:1),p=points[j].clone().sub(origin);vs.push(...p.toArray());ns.push(...n.toArray());const ring=vs.length/3;for(let k=0;k<radial;k++){vs.push(...vs.slice(3*(j*radial+k),3*(j*radial+k)+3));ns.push(...n.toArray());}for(let k=0;k<radial;k++)ix.push(...(j===0?[centre,ring+(k+1)%radial,ring+k]:[centre,ring+k,ring+(k+1)%radial]));}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(ns,3));g.setIndex(ix);g.computeBoundingBox();g.computeBoundingSphere();g.userData={maximum_source_floor_float32_representation_adjustment_m:maxRepresentationRound_m,nominal_radius_m:radius,rotation_minimizing_quaternion_transport:true};return g;
}
export function createHeadLoom306(a,route,ownedGeometries){
 const root=a.parts.get(route.key)?.node;if(!root)throw Error('Missing declared corrected actual loom');let loom=null;root.traverse(n=>{if(n.isMesh){if(loom)throw Error('Duplicate loom mesh');loom=n;}});if(!loom)throw Error('Missing complete loom mesh');
 const original=loom.geometry,originalLocal=loom.matrix.clone();ownedGeometries.add(original);let current=null;
 function update(nativeReset=false){a.root.updateMatrixWorld(true);const hosts=route.hosts.map(h=>{const p=a.parts.get(h.key);if(!p||p.record.source_id!==h.source_id)throw Error('Changed original source loom endpoint');return{position:new THREE.Vector3(...h.local_native_mm).applyMatrix4(p.node.matrixWorld)};});current=loomCurve(route,hosts);const world=new THREE.Matrix4().makeTranslation(...current.origin.toArray()),local=(loom.parent?.matrixWorld.clone().invert()??new THREE.Matrix4()).multiply(world),old=loom.geometry;loom.geometry=nativeReset?original:tubeGeometry(current.points,route.display_diameter_mm*.0005,route.radial_segments,current.tangents,current.origin);loom.matrix.copy(nativeReset?originalLocal:local);loom.matrixAutoUpdate=false;loom.updateWorldMatrix(false,true);if(old!==original&&old!==loom.geometry){ownedGeometries.delete(old);old.dispose();}ownedGeometries.add(loom.geometry);return current;}
 return{update,loom,get curve(){return current},scope:'Source endpoint anchored6mm illustration; sampled triangle clearance, not continuous/physical cable stress certificate.'};
}
