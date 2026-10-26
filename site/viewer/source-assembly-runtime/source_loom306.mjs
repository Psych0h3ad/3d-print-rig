// Source-attached flexible preview. Display slack is not a measured cable cut length.
import * as THREE from'three';
const Y=new THREE.Vector3(0,1,0);
const gaussX=[.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const gaussW=[.1894506104550685,.1826034150449236,.16915651939500254,.14959598881657673,.12462897125553387,.09515851168249278,.062253523938647894,.027152459411754095];
export const loomPreviewPolicy=Object.freeze({straight_exit_m:.015,shoulder_spread_m:.07,minimum_bend_radius_m:.03,radius_scope:'Display review threshold for a 6 mm illustrated loom; not a manufacturer rating.'});
function bowAt(v,u,H,B,t){
 const w=1-t,q=t*t*t*(10+t*(-15+6*t)),q1=30*t*t*w*w,q2=60*t*w*(1-2*t),f=3*t*w,f1=3*(1-2*t);
 const G=64*t*t*t*w*w*w,G1=192*t*t*w*w*(1-2*t),G2=384*t*w*(1-5*t+5*t*t),g=G*(2*t-1),g1=G1*(2*t-1)+2*G,g2=G2*(2*t-1)+4*G1;
 return {position:[v.x*q+u.x*B*g,v.y*q+H*f,v.z*q+u.z*B*g],first:[v.x*q1+u.x*B*g1,v.y*q1+H*f1,v.z*q1+u.z*B*g1],second:[v.x*q2+u.x*B*g2,v.y*q2-6*H,v.z*q2+u.z*B*g2]};
}
function bowLength(v,u,H,B){let length=0;for(let panel=0;panel<4;panel++)for(let i=0;i<gaussX.length;i++)for(const sign of[-1,1])length+=gaussW[i]*Math.hypot(...bowAt(v,u,H,B,(panel+(1+sign*gaussX[i])/2)/4).first)/8;return length;}
export function loomCurve(route,hosts,segments=route.segments??192){
 const a=hosts[0]?.position,d=hosts[1]?.position,L=route.display_constant_length_m,lead=loomPreviewPolicy.straight_exit_m,B=loomPreviewPolicy.shoulder_spread_m;
 if(!a||!d||![...a.toArray(),...d.toArray(),L,route.display_diameter_mm].every(Number.isFinite)||!Number.isInteger(segments)||segments<32||segments>8192)throw Error('Finite source loom endpoints and bounded sample count required');
 for(const h of hosts)if(h.outward&&(!h.outward.toArray().every(Number.isFinite)||h.outward.clone().normalize().dot(Y)<1-1e-10))throw Error('Fresh source loom exit-axis binding required');
 const start=a.clone().addScaledVector(Y,lead),end=d.clone().addScaledVector(Y,lead),v=end.clone().sub(start),span=new THREE.Vector3(v.x,0,v.z),D=span.length(),target=L-2*lead;
 if(!(D>.01&&route.display_diameter_mm>0&&target>v.length()))throw Error('Source loom span or display slack is insufficient');
 const u=span.normalize();let low=0,high=L;
 if(bowLength(v,u,low,B)>=target||bowLength(v,u,high,B)<=target)throw Error('Source loom length does not bracket a smooth bow');
 for(let i=0;i<40;i++){const mid=(low+high)/2;if(bowLength(v,u,mid,B)<target)low=mid;else high=mid;}
 const H=(low+high)/2,points=[a.clone()],tangents=[Y.clone()];let minimumRadius=Infinity,minimumDerivative=Infinity,minimumRadiusAt=0;
 for(let i=0;i<=segments;i++){
  const t=i/segments,q=bowAt(v,u,H,B,t),first=new THREE.Vector3(...q.first),second=new THREE.Vector3(...q.second),speed=first.length(),cross=first.clone().cross(second).length(),radius=cross>1e-16?speed**3/cross:Infinity;
  if(!(speed>1e-8))throw Error('Collapsed smooth source loom tangent');
  if(radius<minimumRadius){minimumRadius=radius;minimumRadiusAt=t;}
  minimumDerivative=Math.min(minimumDerivative,speed);points.push(start.clone().add(new THREE.Vector3(...q.position)));tangents.push(first.normalize());
 }
 if(minimumRadius+1e-6<loomPreviewPolicy.minimum_bend_radius_m)throw Error('Source loom bend falls below the preview radius threshold');
 points.push(d.clone());tangents.push(Y.clone().negate());
 return{points,tangents,actual_length_m:2*lead+bowLength(v,u,H,B),polyline_length_m:points.slice(1).reduce((s,p,i)=>s+p.distanceTo(points[i]),0),minimum_sampled_radius_m:minimumRadius,minimum_radius_t:minimumRadiusAt,minimum_derivative_norm:minimumDerivative,control_height_m:H,straight_exit_m:lead,shoulder_spread_m:B,curvature_continuous_joins:true,origin:a.clone()};
}
function float32AtOrBelow(x,upper){const a=new Float32Array([x]);if(a[0]>upper){const u=new Uint32Array(a.buffer);u[0]+=a[0]>=0?-1:1;}return a[0];}
export function tubeGeometry(points,radius,radial=12,tangents,origin=points[0]){
 if(!Number.isFinite(radius)||radius<=0||!Number.isInteger(radial)||radial<3||radial>64||!origin?.toArray().every(Number.isFinite))throw Error('Finite source tube section required');
 if(!tangents||points.length<2||points.length!==tangents.length)throw Error('Analytic positive source path tangents required');
 const vs=[],ns=[],ix=[];let u=Math.abs(tangents[0].x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1),previous=tangents[0].clone();u.addScaledVector(previous,-u.dot(previous)).normalize();let maxRepresentationRound_m=0;
 for(let j=0;j<points.length;j++){
  const t=tangents[j];if(!points[j].toArray().every(Number.isFinite)||!t.toArray().every(Number.isFinite)||Math.abs(t.length()-1)>1e-10||previous.dot(t)<0)throw Error('Nonfinite/antipodal source path tangent');
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
 const original=loom.geometry;ownedGeometries.add(original);let current=null,resetGeometry=null;
 function update(nativeReset=false){a.root.updateMatrixWorld(true);const hosts=route.hosts.map(h=>{const p=a.parts.get(h.key);if(!p||p.record.source_id!==h.source_id)throw Error('Changed original source loom endpoint');const relative=p.node.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(p.record.matrix).invert());return{position:new THREE.Vector3(...h.local_native_mm).applyMatrix4(p.node.matrixWorld),outward:new THREE.Vector3(...h.outward_unit_world).transformDirection(relative)};});current=loomCurve(route,hosts);const world=new THREE.Matrix4().makeTranslation(...current.origin.toArray()),local=(loom.parent?.matrixWorld.clone().invert()??new THREE.Matrix4()).multiply(world),old=loom.geometry;
  const geometry=nativeReset&&resetGeometry?resetGeometry:tubeGeometry(current.points,route.display_diameter_mm*.0005,route.radial_segments,current.tangents,current.origin);if(nativeReset)resetGeometry=geometry;
  loom.geometry=geometry;loom.matrix.copy(local);loom.matrixAutoUpdate=false;loom.updateWorldMatrix(false,true);if(old!==original&&old!==resetGeometry&&old!==geometry){ownedGeometries.delete(old);old.dispose();}ownedGeometries.add(geometry);return current;}
 return{update,loom,get curve(){return current},scope:'Source-attached smooth constant-display-length loom; preview bend policy and sampled checks are not physical cable stress or continuous clearance certification.'};
}
