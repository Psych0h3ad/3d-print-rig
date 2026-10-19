// Proposed private consumer extension. CPU/browser portable; no CAD/native dependency.
import * as THREE from 'three';
const M=x=>new THREE.Matrix4().fromArray(x),V=x=>new THREE.Vector3(...x);
const maxError=(a,b)=>Math.max(...a.elements.map((x,i)=>Math.abs(x-b.elements[i])));
export function rotationAboutAxis(entry,travel){
 if(!Number.isFinite(travel))throw Error('Nonfinite source travel');
 // Reduce turns BEFORE trigonometry; use an absolute source pose, never accumulated deltas.
 const turns=travel/entry.travel_mm_per_turn*entry.phase_sign;
 const theta=(turns-Math.round(turns))*2*Math.PI,p=V(entry.axis_origin_world_m),axis=V(entry.axis_unit_world).normalize();
 return new THREE.Matrix4().makeTranslation(...p.toArray()).multiply(new THREE.Matrix4().makeRotationAxis(axis,theta)).multiply(new THREE.Matrix4().makeTranslation(...p.clone().negate().toArray()));
}
export function createSourceDriveController(a,spec){
 if(a.packet.id!==spec.assembly_id||a.packet.model.sha256!==spec.model.sha256)throw Error('Changed actual source model; fresh binding required');
 const caches=spec.entries.map(e=>{
  if(e.key==='donor-09'||!e.key.startsWith('Z-source300')&&!e.key.startsWith('Z40T')&&!e.key.startsWith('source-original-Z20T'))throw Error('Motor housing/proxy is not a rotating source part');
  const p=a.parts.get(e.key);if(!p||p.record.source_id!==e.source_id||p.record.kind!==e.kind||p.record.material_role!==e.material_role)throw Error('Changed rotating source identity/role');
  if(maxError(p.node.matrixWorld,M(e.actual_baseline_world_m))>1e-12)throw Error('Changed finite source axis baseline');
  return {entry:e,node:p.node,local:p.node.matrix.clone(),world:p.node.matrixWorld.clone()};
 });
 for(const x of caches)for(let p=x.node.parent;p;p=p.parent)if(caches.some(c=>c.node===p))throw Error('Rotating descendant would receive source transform twice');
 function update(travel){
  for(const c of caches){
   const n=c.node;if(travel===0)n.matrix.copy(c.local);
   else n.matrix.multiplyMatrices(n.parent?.matrixWorld.clone().invert()??new THREE.Matrix4(),rotationAboutAxis(c.entry,travel).multiply(c.world));
   n.matrixAutoUpdate=false;n.updateWorldMatrix(false,true);
  }
  return {travel,parts:caches.length,lead_turns:travel/8,motor_turns:travel/4};
 }
 return {update,reset:()=>update(0),caches,scope:'Exact provided shafts/pulleys/grubs rotate. Fused original motor case/shaft stays fixed; no housing proxy, no thread-flank certificate.'};
}
export function loomCurve(route,hosts,segments=128){
 const a=hosts[0],d=hosts[1],L=route.display_constant_length_m;
 function sample(h){const p=a.position,q=p.clone().addScaledVector(a.outward,h),r=d.position.clone().addScaledVector(d.outward,h),s=d.position;
  const pts=[];for(let j=0;j<=segments;j++){const t=j/segments,u=1-t;pts.push(p.clone().multiplyScalar(u*u*u).addScaledVector(q,3*u*u*t).addScaledVector(r,3*u*t*t).addScaledVector(s,t*t*t));}return pts;
 }
 const length=p=>p.slice(1).reduce((v,x,i)=>v+x.distanceTo(p[i]),0);
 if(a.position.distanceTo(d.position)>=L)throw Error('Source loom illustration has insufficient stated slack');
 let lo=0,hi=L*2;for(let i=0;i<48;i++){const h=(lo+hi)/2;if(length(sample(h))<L)lo=h;else hi=h;}
 const pts=sample((lo+hi)/2);return {points:pts,actual_length_m:length(pts),control_height_m:(lo+hi)/2};
}
export function tubeGeometry(points,radius,radial=12){
 // Parallel transported cross sections keep finite profiles through reversed poses.
 const vs=[],ns=[],ix=[],ts=[];let u=null;
 for(let j=0;j<points.length;j++){
  const t=(j===0?points[1].clone().sub(points[0]):j===points.length-1?points[j].clone().sub(points[j-1]):points[j+1].clone().sub(points[j-1])).normalize();
  if(t.lengthSq()<.99)throw Error('Collapsed source route tangent');ts.push(t);
  if(!u){const seed=Math.abs(t.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);u=seed.addScaledVector(t,-seed.dot(t)).normalize();}
  else{u.addScaledVector(t,-u.dot(t));if(u.lengthSq()<1e-12){u=(Math.abs(t.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).addScaledVector(t,-(Math.abs(t.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).dot(t));}u.normalize();}
  const w=t.clone().cross(u).normalize();
  for(let k=0;k<radial;k++){const n=u.clone().multiplyScalar(Math.cos(2*Math.PI*k/radial)).addScaledVector(w,Math.sin(2*Math.PI*k/radial));vs.push(...points[j].clone().addScaledVector(n,radius).toArray());ns.push(...n.toArray());}
 }
 for(let j=0;j<points.length-1;j++)for(let k=0;k<radial;k++){const a=j*radial+k,b=j*radial+(k+1)%radial,c=b+radial,d=a+radial;ix.push(a,b,c,a,c,d);}
 // Real displayed cut ends: separate cap vertices/normals, no fake connector body.
 for(const j of [0,points.length-1]){const centre=vs.length/3,n=ts[j].clone().multiplyScalar(j===0?-1:1);vs.push(...points[j].toArray());ns.push(...n.toArray());const ring=vs.length/3;
  for(let k=0;k<radial;k++){vs.push(...vs.slice(3*(j*radial+k),3*(j*radial+k)+3));ns.push(...n.toArray());}
  for(let k=0;k<radial;k++){const a=ring+k,b=ring+(k+1)%radial;ix.push(...(j===0?[centre,b,a]:[centre,a,b]));}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(ns,3));g.setIndex(ix);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function createSourceCompanions(a,spec,ownedGeometries){
 const row=spec.models.find(p=>p.id===a.packet.id);if(!row||row.model.sha256!==a.packet.model.sha256)throw Error('PTFE/current source hash changed');
 const ptfe=a.parts.get(spec.PTFE.key)?.node;
 if(!ptfe)throw Error('Missing actual finite PTFE mesh');
 a.root.updateMatrixWorld(true);
 const sourcePTFEworld=ptfe.matrixWorld.clone(),sourcePTFElocal=ptfe.matrix.clone();let host=a.parts.get('E3D-original-Revo-Voron-reference');if(!host)throw Error('Missing original hotend tube host');
 const sourceHost=host.node.matrixWorld.clone();let loom=null,lastCurve=null;
 if(!a.packet.source_loom305&&!a.packet.source_loom306&&spec.loom.hosts.every(h=>a.parts.has(h.key))){const root=a.parts.get(spec.loom.key)?.node;if(!root)throw Error('Missing declared source loom illustration');root.traverse(n=>{if(n.isMesh){if(loom)throw Error('Aliased source loom mesh');loom=n;}});if(!loom)throw Error('No actual loom mesh');}
 const originalLoomGeometry=loom?.geometry;if(originalLoomGeometry)ownedGeometries.add(originalLoomGeometry);
 function update(nativeReset=false){
  a.root.updateMatrixWorld(true);const currentHost=host.node.matrixWorld,relative=currentHost.clone().multiply(sourceHost.clone().invert());
  if(nativeReset)ptfe.matrix.copy(sourcePTFElocal);else ptfe.matrix.multiplyMatrices(ptfe.parent.matrixWorld.clone().invert(),relative.multiply(sourcePTFEworld));ptfe.matrixAutoUpdate=false;ptfe.updateWorldMatrix(false,true);
  if(loom){
   const hosts=spec.loom.hosts.map(h=>{const node=a.parts.get(h.key).node;return {position:V(h.local_native_mm).applyMatrix4(node.matrixWorld),outward:V(h.outward_unit_world)};});
   lastCurve=loomCurve(spec.loom,hosts);const inverse=loom.parent.matrixWorld.clone().invert(),local=lastCurve.points.map(x=>x.clone().applyMatrix4(inverse));
   const old=loom.geometry;loom.geometry=nativeReset?originalLoomGeometry:tubeGeometry(local,spec.loom.display_diameter_mm*.0005);
   if(old!==originalLoomGeometry&&old!==loom.geometry){ownedGeometries.delete(old);old.dispose();}
   ownedGeometries.add(loom.geometry);loom.visible=loom.visible&&host.node.visible;loom.updateWorldMatrix(false,true);
  }
  return {PTFE_world:ptfe.matrixWorld.toArray(),loom_length_m:lastCurve?.actual_length_m??null};
 }
 return {update,ptfe,loom,get curve(){return lastCurve},scope:'Finite short PTFE source-BOM reference; loom is an explicit channel-attached illustration. Native body clearance and measured wire slack remain open.'};
}
