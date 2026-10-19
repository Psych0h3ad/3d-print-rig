import * as THREE from 'three';
const finitePoint=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function inspectMotionFeatures(assembly){
 const {packet:p,parts}=assembly,failures=[],measurements=[];
 function point(key,local){const part=parts.get(key);if(!part||!finitePoint(local))throw Error('Missing source mating point '+key);return new THREE.Vector3(...local).applyMatrix4(part.node.matrixWorld);}
 function vertex(key,index){const part=parts.get(key);if(!part)throw Error('Missing source geometry '+key);const meshes=[];part.node.traverse(n=>{if(n.isMesh){for(let parent=n;parent&&parent!==part.node;parent=parent.parent)if([...parts.values()].some(x=>x.node===parent))return;meshes.push(n);}});if(meshes.length!==1)throw Error('Ambiguous source feature mesh '+key);const mesh=meshes[0],a=mesh.geometry.attributes.position;if(!Number.isInteger(index)||index<0||index>=a.count)throw Error('Missing actual feature vertex '+key);return new THREE.Vector3().fromBufferAttribute(a,index).applyMatrix4(mesh.matrixWorld);}
 function measure(id,value,expected,tolerance){if(!Number.isFinite(value)||!Number.isFinite(expected)||!Number.isFinite(tolerance)||tolerance<0)throw Error('Missing source feature limit '+id);measurements.push({id,value,expected,tolerance});if(Math.abs(value-expected)>tolerance)failures.push('Source feature detached/deformed '+id+': '+value+' vs '+expected);}
 function attempt(fn){try{fn();}catch(e){failures.push(e.message);}}
 if(!p.rigid_attachments?.length)failures.push('Missing source rigid attachment datums');
 for(const a of p.rigid_attachments||[])attempt(()=>{if(!a.evidence?.sha256)throw Error('Missing native attachment evidence '+a.part_key);const first=point(a.part_key,a.part_point),second=point(a.mate_key,a.mate_point);measure('attachment:'+a.part_key+'→'+a.mate_key,first.distanceTo(second)*1000,a.source_gap_mm,a.tolerance_mm);if(a.part_axis&&a.mate_axis){if(!finitePoint(a.part_axis)||!finitePoint(a.mate_axis))throw Error('Invalid source mating axis');const n1=new THREE.Vector3(...a.part_axis).transformDirection(parts.get(a.part_key).node.matrixWorld),n2=new THREE.Vector3(...a.mate_axis).transformDirection(parts.get(a.mate_key).node.matrixWorld);measure('axis:'+a.part_key,THREE.MathUtils.radToDeg(Math.acos(Math.min(1,Math.abs(n1.dot(n2))))),0,a.angle_tolerance_deg);}});
 for(const r of p.routes||[])attempt(()=>{
  const f=r.geometry_features;if(!f?.evidence?.sha256)throw Error('Missing actual source route-fit features '+r.part_key);
  if(r.kind==='belt'){
   const width=f.belt_width;if(!width?.vertex_pairs?.length)throw Error('Missing actual belt width witnesses');for(const [i,pair]of width.vertex_pairs.entries())measure('belt-width:'+r.part_key+':'+i,vertex(r.part_key,pair[0]).distanceTo(vertex(r.part_key,pair[1]))*1000,width.expected_mm,width.tolerance_mm);
   if(!f.cut_ends?.length)throw Error('Missing actual belt cut-end clamp witnesses');for(const [i,cut]of f.cut_ends.entries()){if(!finitePoint(cut.plane_normal_local)||!cut.indices?.length)throw Error('Missing source belt cut plane');const origin=point(cut.mate_key,cut.plane_point_m),normal=new THREE.Vector3(...cut.plane_normal_local).transformDirection(parts.get(cut.mate_key).node.matrixWorld);for(const index of cut.indices)measure('belt-cut:'+r.part_key+':'+i,vertex(r.part_key,index).sub(origin).dot(normal)*1000,cut.signed_gap_mm,cut.tolerance_mm);}
   const teeth=f.teeth;if(!teeth?.vertex_pairs?.length)throw Error('Missing actual belt tooth/pitch witnesses');for(const [i,pair]of teeth.vertex_pairs.entries())measure('belt-teeth:'+r.part_key+':'+i,vertex(r.part_key,pair[0]).distanceTo(vertex(r.part_key,pair[1]))*1000,teeth.expected_pitch_mm,teeth.tolerance_mm);
  }
  if(r.kind==='chain'){
   if(!f.links?.length)throw Error('Missing actual chain joint features');for(const [i,link]of f.links.entries())measure('chain-link:'+r.part_key+':'+i,point(link.part_key,link.pin_point_m).distanceTo(point(link.next_part_key,link.next_pin_point_m))*1000,link.source_gap_mm,link.tolerance_mm);
  }
  if(['ptfe','can','cpap','water'].includes(r.kind)){
   if(!f.fittings?.length)throw Error('Missing actual tube/cable fittings');for(const [i,fit]of f.fittings.entries()){if(!fit.tangent_vertices||fit.tangent_vertices.length!==2||!finitePoint(fit.axis_local))throw Error('Missing source fitting axis/tangent');const tangent=vertex(r.part_key,fit.tangent_vertices[1]).sub(vertex(r.part_key,fit.tangent_vertices[0])).normalize(),axis=new THREE.Vector3(...fit.axis_local).transformDirection(parts.get(fit.mate_key).node.matrixWorld);measure('fitting-angle:'+r.part_key+':'+i,THREE.MathUtils.radToDeg(Math.acos(Math.min(1,Math.abs(tangent.dot(axis))))),0,fit.angle_tolerance_deg);}
  }
 });
 return {failures,measurements,scope:'Actual source feature points/vertices and attachment preservation; not native solid collision clearance'};
}

// Source181 controllers bundled here for the existing prepared-route whitelist.
// Original module hashes:700d9735dfbe8ddf6c009c3e980cc7d913f5bd40bcd7fb4f0a7a7eb6010d0ee1 /94dfb83751eb92cafc21c83d9422288f133fcaee627c3d3ea9511696cfb351c7.
// Source6298 fan is independent of this module. This adapter deforms only the
// five full original RH3D smooth belt bodies using source-bound motion weights.
// It is a display route adapter: no teeth/tension/body-clearance certification.
export function sourcePhysicalNodeMap(root,logicalKeys=null){const nodes=new Map();root.traverse(o=>{const key=o.userData?.part_key||o.userData?.partKey;if(key&&(!logicalKeys||logicalKeys.has(key))){if(nodes.has(key))throw Error('Duplicate physical flex key '+key);nodes.set(key,o)}});return nodes;}
export function createVirtuSourceBeltFlex(root,registration,nativeVectorToDisplay,logicalKeys=null){
 if(typeof nativeVectorToDisplay!=='function')throw Error('Explicit native-mm to display-vector conversion required');
 if(registration.routes?.length!==5)throw Error('VIRTU requires two XY and three Z belts');
 const nodes=sourcePhysicalNodeMap(root,logicalKeys);
 const entries=registration.routes.map(spec=>{
  const node=nodes.get(spec.key);if(!node)throw Error('Missing source belt '+spec.key);
  const meshes=[];node.traverse(o=>{if(o.isMesh)meshes.push(o)});
  if(!meshes.length)throw Error('Missing full source belt mesh');
  return {spec,node,meshes:meshes.map(mesh=>{
   // Independent moving instances must not mutate a loader-shared accessor.
   // Clone exact arrays; indices, all original source faces and styles stay.
   mesh.geometry=mesh.geometry.clone();
   const pos=mesh.geometry.getAttribute('position'),weights=mesh.geometry.getAttribute('_motion_weights')||mesh.geometry.getAttribute('_MOTION_WEIGHTS'),normal=mesh.geometry.getAttribute('normal');
   if(!weights||weights.count!==pos.count||weights.itemSize!==4)throw Error('Missing actual source-bound weights '+spec.key);
   return {mesh,pos,weights,source:new Float32Array(pos.array),sourceNormals:normal?new Float32Array(normal.array):null};
  })};
 });
 function update(axes){
  for(const k of ['x','y','z'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite VIRTU axis');
  const delta=[ [0,0,0], [axes.x||0,0,-(axes.y||0)], [0,0,-(axes.y||0)], [0,axes.z||0,0] ].map(v=>nativeVectorToDisplay(v));
  const reset=['x','y','z'].every(k=>(axes[k]||0)===0);root.updateMatrixWorld(true);
  for(const entry of entries)for(const item of entry.meshes){
   if(reset){item.pos.array.set(item.source);const normal=item.mesh.geometry.getAttribute('normal');if(normal&&item.sourceNormals){normal.array.set(item.sourceNormals);normal.needsUpdate=true}}
   else{
    const e=item.mesh.matrixWorld.clone().invert().elements;
    for(let i=0;i<item.pos.count;i++){
     const w=i*4,v=[0,0,0];for(let j=0;j<4;j++)for(let k=0;k<3;k++)v[k]+=item.weights.array[w+j]*delta[j][k];
     const local=[e[0]*v[0]+e[4]*v[1]+e[8]*v[2],e[1]*v[0]+e[5]*v[1]+e[9]*v[2],e[2]*v[0]+e[6]*v[1]+e[10]*v[2]];
     for(let k=0;k<3;k++){const q=item.source[i*3+k]+local[k];if(!Number.isFinite(q))throw Error('Nonfinite actual belt vertex');item.pos.array[i*3+k]=q}
    }
    item.mesh.geometry.computeVertexNormals();
   }
   item.pos.needsUpdate=true;item.mesh.geometry.computeBoundingBox();item.mesh.geometry.computeBoundingSphere();
  }
  return {physical_source_belts:5,actual_source_geometry_reset:reset,teeth_verified:false,native_fit_verified:false};
 }
 return {entries,update,reset:()=>update({x:0,y:0,z:0}),keys:new Set(entries.map(e=>e.spec.key))};
}

// Private May2WD source-bound flex adapter. No rigid hardware is generated.
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mul=(v,s)=>v.map(q=>q*s),unit=v=>mul(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function gaussLegendre(n){
 const t=[],w=[];
 for(let i=0;i<n;i++){
  let z=Math.cos(Math.PI*(i+.75)/(n+.5)),dp;
  for(let j=0;j<30;j++){
   let p=1,q=0;for(let k=1;k<=n;k++){const old=p;p=((2*k-1)*z*p-(k-1)*q)/k;q=old}
   dp=n*(z*p-q)/(z*z-1);const step=p/dp;z-=step;if(Math.abs(step)<1e-15)break;
  }
  t.push((z+1)/2);w.push(1/((1-z*z)*dp*dp));
 }
 return {t,w};
}
const quadrature=gaussLegendre(64);
const bezier=(t,c)=>c[0].map((v,i)=>(1-t)**3*v+3*(1-t)**2*t*c[1][i]+3*(1-t)*t*t*c[2][i]+t**3*c[3][i]);
const derivative=(t,c)=>c[0].map((v,i)=>3*(1-t)**2*(c[1][i]-v)+6*(1-t)*t*(c[2][i]-c[1][i])+3*t*t*(c[3][i]-c[2][i]));
const arcLength=c=>quadrature.t.reduce((s,t,i)=>s+quadrature.w[i]*norm(derivative(t,c)),0);
export function sourceHeadPTFERoute(spec,axes={}){
 for(const k of ['x','y'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite VIRTU PTFE axis');
 const delta=[axes.x||0,0,-(axes.y||0)],start=add(spec.head_start_mm,delta),exit=add(spec.head_exit_mm,delta),finish=spec.fixed_bay_end_mm;
 const stem=norm(sub(exit,start)),target=spec.cut_length_mm-stem;
 const controls=h=>[exit,add(exit,mul(spec.head_tangent,h)),add(finish,mul(spec.bay_reverse_tangent,h)),finish];
 let low=0,high=1000;if(!(arcLength(controls(low))<target&&target<arcLength(controls(high))))throw Error('Source PTFE length cannot reach its endpoints');
 for(let i=0;i<56;i++){const mid=(low+high)/2;if(arcLength(controls(mid))<target)low=mid;else high=mid}
 const c=controls((low+high)/2),points=[start],tangents=[unit(sub(exit,start))];
 for(let i=0;i<=spec.Bezier_segments;i++){points.push(bezier(i/spec.Bezier_segments,c));tangents.push(unit(derivative(i/spec.Bezier_segments,c)))}
 const polyline=points.slice(1).reduce((s,p,i)=>s+norm(sub(p,points[i])),0);
 return {points,tangents,controls:c,nominal_length_mm:stem+arcLength(c),rendered_polyline_length_mm:polyline,head_endpoint_mm:start,bay_endpoint_mm:finish};
}
// Endpoint-constrained planar IK; source measured link lengths remain rigid.
// The deterministic smoothness term is display kinematics, not chain stiffness.
function tridiagonalSolve(b,lambda){
 const n=b.length,d=Array.from({length:n},(_,i)=>1+lambda*((i===0||i===n-1)?1:2)),rhs=[...b];
 for(let i=1;i<n;i++){const k=-lambda/d[i-1];d[i]-=k*(-lambda);rhs[i]-=k*rhs[i-1]}
 const x=Array(n);x[n-1]=rhs[n-1]/d[n-1];for(let i=n-2;i>=0;i--)x[i]=(rhs[i]+lambda*x[i+1])/d[i];return x;
}
export function sourceTenLinkRoute(spec,z=0){
 if(!Number.isFinite(z))throw Error('Nonfinite chain Z');
 const lengths=spec.source_measured_link_lengths_mm,source=spec.links.map(l=>Math.atan2(l.to_mm[1]-l.from_mm[1],l.to_mm[0]-l.from_mm[0]));
 if(lengths.length!==10||source.length!==10)throw Error('Exact ten original chain bodies required');
 const theta=[...source],steps=Math.max(1,Math.ceil(Math.abs(z)/2));let maxIterations=0;
 for(let step=0;step<steps;step++){
  const partial=z*(step+1)/steps,target=[spec.end_mm[0],spec.end_mm[1]+partial],lambda=Math.abs(partial)*.5;
  let success=false;
  for(let iter=0;iter<80;iter++){
   const end=[...spec.start_mm],jx=[],jy=[];
   theta.forEach((a,i)=>{end[0]+=lengths[i]*Math.cos(a);end[1]+=lengths[i]*Math.sin(a);jx.push(-lengths[i]*Math.sin(a));jy.push(lengths[i]*Math.cos(a))});
   const error=sub(target,end),gradient=theta.map((a,i)=>a-source[i]+lambda*((i? a-theta[i-1]:0)+(i<9?a-theta[i+1]:0)));
   const qg=tridiagonalSolve(gradient,lambda),qx=tridiagonalSolve(jx,lambda),qy=tridiagonalSolve(jy,lambda);
   const aa=dot(jx,qx),bb=dot(jx,qy),cc=dot(jy,qy),det=aa*cc-bb*bb;if(!(det>0))throw Error('Singular source chain endpoint');
   const ex=error[0]+dot(jx,qg),ey=error[1]+dot(jy,qg),lx=(cc*ex-bb*ey)/det,ly=(aa*ey-bb*ex)/det;
   let delta=qg.map((v,i)=>-v+qx[i]*lx+qy[i]*ly);
   if(norm(error)<1e-8&&norm(delta)<1e-7){success=true;maxIterations=Math.max(maxIterations,iter+1);break}
   if(norm(delta)>.2)delta=mul(delta,.2/norm(delta));theta.forEach((_,i)=>theta[i]+=delta[i]);
  }
  if(!success)throw Error('Source chain endpoint solver did not converge');
 }
 const points=[[...spec.start_mm]];theta.forEach((a,i)=>points.push(add(points[i],[lengths[i]*Math.cos(a),lengths[i]*Math.sin(a)])));
 const joints=theta.slice(1).map((a,i)=>Math.abs(a-theta[i])),largest=Math.max(...joints),radius=Math.min(...lengths)/(2*Math.sin(largest/2));
 return {points,angles:theta,source_angles:source,endpoint_error_mm:norm(sub(points[10],[spec.end_mm[0],spec.end_mm[1]+z])),rigid_length_mm:lengths.reduce((s,v)=>s+v,0),largest_internal_joint_angle_deg:largest*180/Math.PI,geometric_hinge_radius_mm:radius,nominal_R28_internal_angle_screen:radius>=spec.nominal_bend_radius_mm,source_connector_angle_deltas_deg:[(theta[0]-source[0])*180/Math.PI,(theta[9]-source[9])*180/Math.PI],maxIterations,physical_end_stop_or_clearance_verified:false};
}
export function createVirtuCompleteFlex(root,profile,nativePointToDisplay,nativeVectorToDisplay,logicalKeys=null){
 if(typeof nativePointToDisplay!=='function'||typeof nativeVectorToDisplay!=='function')throw Error('Explicit native point and vector conversion required');
 const belts=createVirtuSourceBeltFlex(root,profile,nativeVectorToDisplay,logicalKeys),nodes=sourcePhysicalNodeMap(root,logicalKeys);root.updateMatrixWorld(true);
 const chain=profile.chain,links=chain.links.map(l=>{const node=nodes.get(l.keys[0]);if(!node)throw Error('Missing original chain link');node.matrixAutoUpdate=false;return {spec:l,node,local:node.matrix.clone(),world:node.matrixWorld.clone()}});
 const ends=chain.end_parts.map(e=>{const node=nodes.get(e.key);if(!node)throw Error('Missing original chain end');node.matrixAutoUpdate=false;return {spec:e,node,local:node.matrix.clone(),world:node.matrixWorld.clone()}});
 const tubeNode=nodes.get(profile.PTFE490.key);if(!tubeNode)throw Error('Missing actual PTFE490');const tubeMeshes=[];tubeNode.traverse(o=>{if(o.isMesh)tubeMeshes.push(o)});if(tubeMeshes.length!==1)throw Error('One full PTFE490 body required');const tube=tubeMeshes[0];tube.geometry=tube.geometry.clone();
 const pos=tube.geometry.getAttribute('position'),normal=tube.geometry.getAttribute('normal'),initialPosition=new Float32Array(pos.array),initialNormal=new Float32Array(normal.array);
 const Matrix=root.matrix.constructor,Vector=root.position.constructor,Quaternion=root.quaternion.constructor;
 function setWorld(node,world){node.parent?.updateMatrixWorld(true);const m=node.parent?node.parent.matrixWorld.clone().invert().multiply(world):world;node.matrix.copy(m);node.matrix.decompose(node.position,node.quaternion,node.scale);node.matrixWorldNeedsUpdate=true;node.updateMatrixWorld(true)}
 function restore(part){part.node.matrix.copy(part.local);part.node.matrix.decompose(part.node.position,part.node.quaternion,part.node.scale);part.node.matrixWorldNeedsUpdate=true;part.node.updateMatrixWorld(true)}
 function chainUpdate(z){
  if(z===0){links.forEach(restore);ends.forEach(restore);return {actual_source_matrices_reset:true,source_joint_precision_gap_mm:chain.native_joint_gap_mm,rigid_source_links:10}}
  const route=sourceTenLinkRoute(chain,z),normalAxis=[0,0,0];normalAxis[chain.normal_axis]=1;const axis=new Vector(...nativeVectorToDisplay(normalAxis)).normalize();
  function point(p){const out=[0,0,0];chain.plane_axes.forEach((a,i)=>out[a]=p[i]);out[chain.normal_axis]=chain.normal_station_mm;return new Vector(...nativePointToDisplay(out))}
  links.forEach((l,i)=>{const rotation=new Matrix().makeRotationAxis(axis,route.angles[i]-route.source_angles[i]);const old=point(l.spec.from_mm),next=point(route.points[i]);const transform=new Matrix().makeTranslation(...next.toArray()).multiply(rotation).multiply(new Matrix().makeTranslation(...old.negate().toArray()));setWorld(l.node,transform.multiply(l.world.clone()))});
  ends.forEach(e=>{if(e.spec.group==='fixed'){restore(e);return}const delta=nativeVectorToDisplay([0,z,0]);setWorld(e.node,new Matrix().makeTranslation(...delta).multiply(e.world.clone()))});
  return route;
 }
 function tubeUpdate(axes){
  if((axes.x||0)===0&&(axes.y||0)===0){pos.array.set(initialPosition);normal.array.set(initialNormal);pos.needsUpdate=true;normal.needsUpdate=true;tube.geometry.computeBoundingBox();tube.geometry.computeBoundingSphere();return {actual_source_mesh_reset:true,nominal_length_mm:490}}
  const route=sourceHeadPTFERoute(profile.PTFE490,axes);tube.updateMatrixWorld(true);const inverse=tube.matrixWorld.clone().invert(),world=tube.matrixWorld.elements;let previous=[1,0,0],rows=[];
  for(let i=0;i<route.points.length;i++){
   const t=route.tangents[i],u=unit(sub(previous,mul(t,dot(previous,t)))),v=cross(t,u);previous=u;const radials=[];
   for(let j=0;j<64;j++){const a=j*2*Math.PI/64;radials.push(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))))}rows.push(radials);
  }
  let cursor=0;
  function write(p,n){
   const local=new Vector(...nativePointToDisplay(p)).applyMatrix4(inverse),nw=unit(nativeVectorToDisplay(n));const nl=unit([world[0]*nw[0]+world[1]*nw[1]+world[2]*nw[2],world[4]*nw[0]+world[5]*nw[1]+world[6]*nw[2],world[8]*nw[0]+world[9]*nw[1]+world[10]*nw[2]]);pos.array.set(local.toArray(),cursor*3);normal.array.set(nl,cursor*3);cursor++;
  }
  route.points.forEach((p,i)=>{for(const radius of [2,1])for(const radial of rows[i])write(add(p,mul(radial,radius)),mul(radial,radius===2?1:-1))});
  for(const [i,sign] of [[0,-1],[route.points.length-1,1]])for(const radius of [2,1])for(const radial of rows[i])write(add(route.points[i],mul(radial,radius)),mul(route.tangents[i],sign));
  if(cursor!==pos.count)throw Error('PTFE complete mesh count changed');if(!pos.array.every(Number.isFinite)||!normal.array.every(Number.isFinite))throw Error('Nonfinite PTFE');pos.needsUpdate=true;normal.needsUpdate=true;tube.geometry.computeBoundingBox();tube.geometry.computeBoundingSphere();return {...route,points:undefined,tangents:undefined,native_fit_verified:false};
 }
 return {belts,links,ends,tube,controlledKeys:new Set([...belts.keys,...links.map(l=>l.spec.keys[0]),...ends.map(e=>e.spec.key),profile.PTFE490.key]),update(axes={}){for(const k of ['x','y','z'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite flex axis');root.updateMatrixWorld(true);return {belts:belts.update(axes),chain:chainUpdate(axes.z||0),PTFE490:tubeUpdate(axes),native_fit_verified:false}},reset(){return this.update({x:0,y:0,z:0})}};
}

// BEGIN SOURCE191 PINNED RUNTIME
const source191=(()=>{
// CPU geometry and consumer adapter. Original source hardware is never deformed.
// Manufacturer dimension-derived 2GT family reference, not a purchased SKU claim.
const TAU=2*Math.PI;
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const len=a=>Math.hypot(...a);
const unit=a=>mul(a,1/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mod=(x,n)=>(x%n+n)%n;
const resetAxes={x:117.50000017412728,y:127.74999989915605,z:187.88624891835974};
function routeAtAxes(source,axes=resetAxes){
 if(Object.values(axes).some(x=>!Number.isFinite(x)))throw Error('Nonfinite source axes');
 const r=structuredClone(source),dx=axes.x-resetAxes.x,dy=axes.y-resetAxes.y;
 if(r.name==='Z')return r;
 const cs=r.centers.map(x=>x.slice()),N=cs.length;
 cs[0][0]+=dx;cs[0][1]+=dy;cs[N-1][0]+=dx;cs[N-1][1]+=dy;
 r.contacts.forEach((c,j)=>{if(c.source_id==='part-163'||c.source_id==='part-164')cs[j+1][1]+=dy});
 const edges=[],inside=[],outside=[],q=r.pitch_radii.map((x,i)=>x*r.signed_contacts[i]);
 for(let j=0;j<N-1;j++){
  const k=j+1,d=sub(cs[k],cs[j]),L=len(d),u=mul(d,1/L),a=(q[k]-q[j])/L;
  if(Math.abs(a)>=1)throw Error('No finite source tangent');
  const n=add(mul(u,a),mul([-u[1],u[0]],Math.sqrt(1-a*a))),p0=sub(cs[j],mul(n,q[j])),p1=sub(cs[k],mul(n,q[k]));
  outside[j]=Math.atan2(p0[1]-cs[j][1],p0[0]-cs[j][0]);inside[k]=Math.atan2(p1[1]-cs[k][1],p1[0]-cs[k][0]);
  edges.push({kind:'line',start:p0,end:p1,length_mm:len(sub(p1,p0)),contact_normal:n,from:j,to:k});
 }
 const pieces=[];
 for(let j=0;j<N-1;j++){
  if(j&&r.pitch_radii[j]){
   const s=r.signed_contacts[j],da=mod(s*(outside[j]-inside[j]),TAU)*s;
   if(Math.abs(da)>Math.PI+.25)throw Error('Source contact wraps beyond reviewed branch');
   pieces.push({kind:'arc',center:cs[j],radius_mm:r.pitch_radii[j],start_rad:inside[j],sweep_rad:da,length_mm:Math.abs(da)*r.pitch_radii[j],contact_index:j});
  }
  pieces.push(edges[j]);
 }
 r.centers=cs;r.pieces=pieces;r.length_mm=pieces.reduce((s,p)=>s+p.length_mm,0);return r;
}
function frameAt(r,s){
 s=r.closed?mod(s,r.length_mm):Math.max(0,Math.min(s,r.length_mm));
 let p=r.pieces.at(-1),v=p.length_mm;
 for(const x of r.pieces){if(s<=x.length_mm){p=x;v=s;break}s-=x.length_mm}
 let xy,t;
 if(p.kind==='line'){t=unit(sub(p.end,p.start));xy=add(p.start,mul(t,v))}
 else{const a=p.start_rad+v/p.radius_mm*Math.sign(p.sweep_rad);xy=add(p.center,[p.radius_mm*Math.cos(a),p.radius_mm*Math.sin(a)]);t=mul([-Math.sin(a),Math.cos(a)],Math.sign(p.sweep_rad))}
 const side=r.tooth_side??1;
 return {origin:[...xy,r.plane_Z_mm],t:[...t,0],n:[-t[1]*side,t[0]*side,0],w:[0,0,side]};
}
function toothFrames(r,phase=0){
 const count=r.closed?570:Math.floor(r.length_mm/2),frames=[];
 for(let k=0;k<count;k++)frames.push(frameAt(r,(r.closed?mod(2*k+1+phase,r.length_mm):2*k+1)));
 return frames;
}
function transformPoint(f,p){return add(f.origin,add(mul(f.t,p[0]),add(mul(f.n,p[1]),mul(f.w,p[2]))))}
function backingMesh(r,profile){
 const sections=[],vertices=[],triangles=[],L=r.length_mm;
 const cuts=[0];let total=0;
 for(const p of r.pieces){const n=Math.ceil(p.length_mm/.5);for(let i=1;i<=n;i++)cuts.push(total+p.length_mm*i/n);total+=p.length_mm}
 if(r.closed)cuts.pop();
 const ys=[-profile.back_distance_from_pitch_mm,profile.pitch_line_distance_PLD_mm],zs=[-3,3];
 for(const s of cuts){const f=frameAt(r,s);sections.push(f);for(const p of [[0,ys[0],zs[0]],[0,ys[1],zs[0]],[0,ys[1],zs[1]],[0,ys[0],zs[1]]])vertices.push(transformPoint(f,p))}
 for(let j=0;j<(r.closed?cuts.length:cuts.length-1);j++)for(let k=0;k<4;k++){
  const a=j*4+k,b=j*4+(k+1)%4,c=((j+1)%cuts.length)*4+(k+1)%4,d=((j+1)%cuts.length)*4+k;
  triangles.push([a,b,c],[a,c,d]);
 }
 if(!r.closed){triangles.push([0,2,1],[0,3,2]);const a=4*(cuts.length-1);triangles.push([a,a+1,a+2],[a,a+2,a+3])}
 return {vertices,triangles,arclengths_mm:cuts,section_frames:sections,open_cut_end_caps:!r.closed};
}
function polygonArea(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2}
function earclip(poly){
 const ids=poly.map((_,i)=>i),out=[];
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 if(polygonArea(poly)<0)ids.reverse();
 while(ids.length>3){let found=false;
  for(let i=0;i<ids.length;i++){
   const a=ids[(i+ids.length-1)%ids.length],b=ids[i],c=ids[(i+1)%ids.length];
   if(orient(poly[a],poly[b],poly[c])<=1e-12)continue;
   if(ids.some(k=>k!==a&&k!==b&&k!==c&&orient(poly[a],poly[b],poly[k])>=-1e-12&&orient(poly[b],poly[c],poly[k])>=-1e-12&&orient(poly[c],poly[a],poly[k])>=-1e-12))continue;
   out.push([a,b,c]);ids.splice(i,1);found=true;break;
  }
  if(!found)throw Error('Non-simple manufacturer tooth section');
 }
 out.push(ids);return out;
}
function toothMesh(profile){
 let p=profile.tooth_front_polyline_valley_coordinates_mm.map(([x,y])=>[x,profile.pitch_line_distance_PLD_mm-y]);
 if(polygonArea(p)<0)p.reverse();const n=p.length,vertices=p.map(v=>[...v,-3]).concat(p.map(v=>[...v,3])),triangles=[];
 for(const t of earclip(p)){triangles.push(t.slice().reverse(),t.map(i=>i+n))}
 for(let i=0;i<n;i++){let j=(i+1)%n;triangles.push([i,j,j+n],[i,j+n,i+n])}
 return {vertices,triangles,profile_polygon_mm:p};
}
function buildPose(contract,axes=resetAxes){
 const routes=contract.routes.map(r=>routeAtAxes(r,axes)),teeth=toothMesh(contract.profile);
 return {axes,routes:routes.map(r=>({name:r.name,route:r,backing:backingMesh(r,contract.profile),frames:toothFrames(r,r.closed?10*(axes.z-resetAxes.z):0)})),tooth_mesh:teeth};
}
// Caller supplies THREE. Runtime code has no Node-only dependency on the viewer path.
// Dynamic source geometry uses native-mm local coordinates below the supplied basis root.
function installRigidSourceBelts(root,contract,THREE){
 const belts=new Map();root.traverse(n=>{const id=n.userData?.source_id??n.userData?.part_key;if(id?.startsWith('E3NG-derived-GT2-')&&n.userData?.belt_route_root)belts.set(id.slice('E3NG-derived-GT2-'.length),n)});
 if(belts.size!==3)throw Error('All three actual source belt roots required');
 const caches=[];
 for(const [name,node] of belts){const backing=node.children.find(n=>n.userData?.belt_component==='backing'),teeth=node.children.filter(n=>n.userData?.belt_component==='rigid-tooth');if(!backing||!teeth.length)throw Error('Missing belt surfaces');backing.geometry=backing.geometry.clone();caches.push({name,node,backing,teeth})}
 function update(axes){
  const pose=buildPose(contract,axes);
  for(const c of caches){const z=pose.routes.find(x=>x.name===c.name),buf=expanded(z.backing);
   const geometry=c.backing.geometry;geometry.setAttribute('position',new THREE.Float32BufferAttribute(buf.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(buf.normals,3));geometry.setIndex(null);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   if(z.frames.length!==c.teeth.length)throw Error('Material tooth count changed through motion');
   z.frames.forEach((f,i)=>{c.teeth[i].matrix.fromArray(matrix(f));c.teeth[i].matrixAutoUpdate=false;c.teeth[i].matrixWorldNeedsUpdate=true});
  }
  return pose;
 }
 return {update,reset:()=>update(resetAxes),scope:'Source-driven flexible belt reference; no installed tooth engagement/tension/native collision approval.'};
}
function matrix(f){return [...f.t,0,...f.n,0,...f.w,0,...f.origin,1]}
function expanded(mesh){
 const positions=[],normals=[];
 for(const t of mesh.triangles){const p=t.map(i=>mesh.vertices[i]),n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));if(!Number.isFinite(n[0]))throw Error('Degenerate generated belt surface');for(const v of p){positions.push(...v);normals.push(...n)}}
 return {positions,normals};
}

return {installRigidSourceBelts,resetAxes};})();
export function createSourceBelts191(root,packet){
 const {installRigidSourceBelts,resetAxes}=source191;
 const saved=[];root.traverse(n=>{if(n.userData?.belt_component==='backing')saved.push({n,position:n.geometry.attributes.position.array.slice(),normal:n.geometry.attributes.normal.array.slice(),index:n.geometry.index?.array.slice()??null});else if(n.userData?.belt_component==='rigid-tooth')saved.push({n,matrix:n.matrix.clone()});});
 const controller=installRigidSourceBelts(root,packet.belts191B.runtime_profile,THREE);
 // Reuse WebGL attribute buffers at the same size. Release the old geometry
 // buffers before a route changes vertex count, rather than orphaning them.
 for(const s of saved)if(s.position){const geo=s.n.geometry;geo.setAttribute=function(name,value){const old=this.attributes[name];if(old&&old.count===value.count&&old.itemSize===value.itemSize&&old.array.constructor===value.array.constructor){old.array.set(value.array);old.needsUpdate=true;return this;}if(old)this.dispose();return THREE.BufferGeometry.prototype.setAttribute.call(this,name,value);};}
 function update(review){
  if(Object.values(review).every(v=>v===0)){
   for(const s of saved){if(s.matrix)s.n.matrix.copy(s.matrix);else{s.n.geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.position.slice(),3));s.n.geometry.setAttribute('normal',new THREE.Float32BufferAttribute(s.normal.slice(),3));s.n.geometry.setIndex(s.index?new THREE.BufferAttribute(s.index.slice(),1):null);s.n.geometry.computeBoundingBox();s.n.geometry.computeBoundingSphere();}s.n.matrixWorldNeedsUpdate=true;}
   return {reset_exact:true,native_fit:false};
  }
  return controller.update(Object.fromEntries(Object.keys(resetAxes).map(k=>[k,resetAxes[k]+review[k]])));
 }
 return {update,reset:()=>update({x:0,y:0,z:0}),saved};
}

// BEGIN SOURCE190 PINNED CONTROLLERS
const source190=(()=>{
const {BufferGeometry,BufferAttribute,InstancedMesh,Mesh,Matrix4}=THREE;
const feature=(()=>{// Full primary-profile FLEX rendering. Rigid purchased hardware is untouched.
// The posed source feature path is resampled in mm; teeth are rebuilt every2mm.
// Loaded phase, tension, swept body and finite clamp fit remain separate gates.

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(...a);if(!(l>0))throw Error('Singular source GT2 frame');return a.map(v=>v/l)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function posedGT2SourcePath(route,fields,axes={}){
 for(const k of ['x','y','z'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite VIRTU GT2 axis');
 const delta=[[0,0,0],[axes.x||0,0,-(axes.y||0)],[0,0,-(axes.y||0)],[0,axes.z||0,0]];
 const c=new Float64Array(route.rows*3),arc=new Float64Array(route.rows);
 for(let i=0;i<route.rows;i++){
  for(let k=0;k<3;k++){let q=fields[i*13+k];for(let j=0;j<4;j++)q+=fields[i*13+9+j]*delta[j][k];c[i*3+k]=q}
  if(i)arc[i]=arc[i-1]+Math.hypot(...[0,1,2].map(k=>c[i*3+k]-c[(i-1)*3+k]));
  if(i&&!(arc[i]>arc[i-1]))throw Error('Collapsed source GT2 centerline station');
 }
 return {c,arc,length_mm:arc.at(-1)};
}

return {posedGT2SourcePath};})();
const rigid=(()=>{const {posedGT2SourcePath}=feature;// Primary2GT rigid tooth prisms on current source-route arc frames. Only the
// backing follows the posed path. No weighted deformation of a tooth body.
// Reference phase, root/backing internal contact and loaded fit are explicit.


const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(!(n>0))throw Error('Singular source GT2 frame');return a.map(v=>v/n)};
const area=q=>q.reduce((s,a,i)=>{const b=q[(i+1)%q.length];return s+a[0]*b[1]-a[1]*b[0]},0)/2;
function clipX(q,bound,greater){
 const out=[];for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length],ia=greater?a[0]>=bound:a[0]<=bound,ib=greater?b[0]>=bound:b[0]<=bound;if(ia)out.push(a);if(ia!==ib){const t=(bound-a[0])/(b[0]-a[0]);out.push([bound,a[1]+t*(b[1]-a[1])])}}
 return out.filter((p,i)=>!i||p[0]!==out[i-1][0]||p[1]!==out[i-1][1]);
}
function triangulate(q){
 if(!(area(q)>0))throw Error('Nonpositive finite GT2 profile');
 const ids=q.map((_,i)=>i),out=[],turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 while(ids.length>3){let found=false;for(let j=0;j<ids.length;j++){
  const a=ids[(j+ids.length-1)%ids.length],b=ids[j],c=ids[(j+1)%ids.length];if(!(turn(q[a],q[b],q[c])>0))continue;
  const blocked=ids.some(i=>i!==a&&i!==b&&i!==c&&turn(q[a],q[b],q[i])>=0&&turn(q[b],q[c],q[i])>=0&&turn(q[c],q[a],q[i])>=0);if(blocked)continue;
  out.push([a,b,c]);ids.splice(j,1);found=true;break;
 }if(!found)throw Error('Finite source-profile cap triangulation did not finish')}
 if(turn(...ids.map(i=>q[i]))>0)out.push(ids);
 return out;
}
function encodedTriangles(triangles,keepNative64=false){
 const p=keepNative64?new Float64Array(triangles.length*9):new Float32Array(triangles.length*9),n=new Float32Array(p.length);let i=0;
 for(const tr of triangles){p.set(tr.flat(),i*9);const a=Array.from(p.subarray(i*9,i*9+3)),b=Array.from(p.subarray(i*9+3,i*9+6)),c=Array.from(p.subarray(i*9+6,i*9+9)),normal=unit(cross(sub(b,a),sub(c,a)));n.set([...normal,...normal,...normal],i*9);i++}
 return {positions:p,normals:n,triangle_count:triangles.length};
}
function rigidGT2ToothTemplate(spec,xmin=-.8,xmax=.8){
 let q=spec.tooth_profile_points_mm.map(p=>[...p]);q=clipX(clipX(q,xmin,true),xmax,false);
 if(q.length>1&&q[0][0]===q.at(-1)[0]&&q[0][1]===q.at(-1)[1])q.pop();
 if(q.length<3||!(area(q)>0))throw Error('Empty source cut tooth');
 // Local encoding center changes only coordinates, not physical geometry.
 const originX=(Math.min(...q.map(p=>p[0]))+Math.max(...q.map(p=>p[0])))/2;
 const original=q.map(p=>[...p]),caps=triangulate(q),v=q.map(p=>[p[0]-originX,p[1]-spec.pitch_line_above_root_mm]);
 const point=(i,z)=>[v[i][0],v[i][1],z],tri=[];
 for(const ids of caps){tri.push(ids.slice().reverse().map(i=>point(i,-3)));tri.push(ids.map(i=>point(i,3)))}
 for(let i=0;i<v.length;i++){const j=(i+1)%v.length;tri.push([point(i,-3),point(j,-3),point(i,3)],[point(j,-3),point(j,3),point(i,3)])}
 const data=encodedTriangles(tri);
 return {...data,profile_points_mm:original,local_encoding_origin_x_mm:originX,cross_section_area_mm2:area(original),volume_mm3:area(original)*6,clipped_by_actual_cut:xmin>-.8||xmax<.8,source_profile_rigid:true};
}
function sourceGT2RouteFrames(route,fields,axes={}){
 const path=posedGT2SourcePath(route,fields,axes),L=path.length_mm;
 function frame(s){
  const clamped=Math.max(0,Math.min(L,s));let low=0,high=route.rows-1;
  while(high-low>1){const mid=(low+high)>>1;if(path.arc[mid]<=clamped)low=mid;else high=mid}
  const d=path.arc[high]-path.arc[low],u=(clamped-path.arc[low])/d;
  let c=[0,1,2].map(k=>path.c[low*3+k]+u*(path.c[high*3+k]-path.c[low*3+k]));
  const t=unit([0,1,2].map(k=>path.c[high*3+k]-path.c[low*3+k]));
  let w=[0,1,2].map(k=>fields[low*13+3+k]+u*(fields[high*13+3+k]-fields[low*13+3+k]));w=unit(w.map((v,k)=>v-dot(w,t)*t[k]));
  let n=unit(cross(w,t));const old=[0,1,2].map(k=>fields[low*13+6+k]+u*(fields[high*13+6+k]-fields[low*13+6+k]));if(dot(n,old)<0)n=n.map(v=>-v);
  w=unit(cross(t,n)); // Proper rigid [t,n,w] basis, no reflected tooth profile.
  if(s!==clamped)c=c.map((v,k)=>v+(s-clamped)*t[k]);
  return {center:c,tangent:t,back_normal:n,width:w,station_mm:s};
 }
 return {path,L,frame};
}
function buildRigidGT2Route(route,fields,spec,axes={}){
 const {L,frame}=sourceGT2RouteFrames(route,fields,axes),fullTemplate=rigidGT2ToothTemplate(spec),full=[],partial=[];
 for(let center=1;center-.8<L;center+=spec.pitch_mm){
  if(center+.8<=0)continue;const xmin=Math.max(-.8,-center),xmax=Math.min(.8,L-center),f=frame(center);
  if(xmin===-.8&&xmax===.8)full.push(f);else partial.push({frame:f,template:rigidGT2ToothTemplate(spec,xmin,xmax)});
 }
 const steps=Math.ceil(L/spec.backing_max_arc_step_mm),rings=[];
 for(let i=0;i<=steps;i++){const f=frame(i*L/steps),q=[[-3,-.254],[3,-.254],[3,.376],[-3,.376]].map(([w,n])=>f.center.map((v,k)=>v+w*f.width[k]+n*f.back_normal[k]));rings.push(q)}
 const backing=[];for(let i=0;i<steps;i++)for(let k=0;k<4;k++){const j=(k+1)%4;backing.push([rings[i][k],rings[i+1][k],rings[i][j]],[rings[i][j],rings[i+1][k],rings[i+1][j]])}
 backing.push([rings[0][0],rings[0][1],rings[0][2]],[rings[0][0],rings[0][2],rings[0][3]]);const last=rings.at(-1);backing.push([last[0],last[2],last[1]],[last[0],last[3],last[2]]);
 let pitchError=0;for(let i=1;i<full.length;i++)pitchError=Math.max(pitchError,Math.abs(full[i].station_mm-full[i-1].station_mm-spec.pitch_mm));
 return {backing:encodedTriangles(backing,true),full_template:fullTemplate,full_tooth_frames:full,partial_teeth:partial,source_arc_length_mm:L,full_tooth_count:full.length,partial_tooth_count:partial.length,exact_primary_pitch_station_error_mm:pitchError,first_cut_frame:frame(0),last_cut_frame:frame(L),root_backing_internal_contact_is_intended:true,stock_cut_length_mm:route.key.includes('_159')||route.key.includes('_161')?1590:990,loaded_phase_verified:false,native_fit_verified:false};
}
function geometry(data,convert=p=>p){
 const g=new BufferGeometry(),p=new Float32Array(data.positions.length),n=new Float32Array(data.normals.length);const tr=[];
 for(let i=0;i<data.positions.length;i+=9){const triangle=[];for(let j=0;j<3;j++)triangle.push(convert(Array.from(data.positions.subarray(i+j*3,i+j*3+3))));tr.push(triangle)}
 const encoded=encodedTriangles(tr);p.set(encoded.positions);n.set(encoded.normals);g.setAttribute('position',new BufferAttribute(p,3));g.setAttribute('normal',new BufferAttribute(n,3));g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function createVirtuRigidGT2Flex(root,spec,binary,nativePointToDisplay,nativeVectorToDisplay,logicalKeys=null){
 if(typeof nativePointToDisplay!=='function'||typeof nativeVectorToDisplay!=='function'||!(binary instanceof ArrayBuffer)||spec.routes?.length!==5)throw Error('Exactfive source curves and explicitpoint/vector conversion required');
 const nodes=sourcePhysicalNodeMap(root,logicalKeys);
 const entries=spec.routes.map(route=>{const node=nodes.get(route.key);if(!node)throw Error('Missing full belt source leaf');const meshes=[];node.traverse(o=>{if(o.isMesh&&!o.userData?.flex_role)meshes.push(o)});if(meshes.length!==1)throw Error('One full source backing mesh required');const mesh=meshes[0],sourceChildren=mesh.children.filter(o=>o.userData?.physical_belt_owner===route.key);if(sourceChildren.length!==2)throw Error('Complete189rigid/cut tooth children required');return {route,node,mesh,fields:new Float64Array(binary,route.byte_offset,route.rows*13),generated:[],sourceChildren,resetGeometry:mesh.geometry.clone()}});
 function update(axes={}){
  for(const k of ['x','y','z'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite VIRTU axis');root.updateMatrixWorld(true);const reports=[];
  for(const e of entries){
   const reset=['x','y','z'].every(k=>(axes[k]||0)===0);
   if(reset){for(const child of e.generated){e.mesh.remove(child);child.geometry.dispose();child.dispose?.()}e.generated=[];if(e.mesh.geometry!==e.resetGeometry)e.mesh.geometry.dispose();e.mesh.geometry=e.resetGeometry;for(const child of e.sourceChildren)if(child.parent!==e.mesh)e.mesh.add(child);reports.push({key:e.route.key,exact189source_geometry_and_matrices_restored:true});continue}
   const body=buildRigidGT2Route(e.route,e.fields,spec,axes),inverse=e.mesh.matrixWorld.clone().invert();
   for(const child of e.sourceChildren)e.mesh.remove(child);
   for(const child of e.generated){e.mesh.remove(child);child.geometry.dispose();child.dispose?.()}e.generated=[];
   const toLocal=p=>{const q=nativePointToDisplay(p),a=inverse.elements;return [a[0]*q[0]+a[4]*q[1]+a[8]*q[2]+a[12],a[1]*q[0]+a[5]*q[1]+a[9]*q[2]+a[13],a[2]*q[0]+a[6]*q[1]+a[10]*q[2]+a[14]]};
   if(e.mesh.geometry!==e.resetGeometry)e.mesh.geometry.dispose();e.mesh.geometry=geometry(body.backing,toLocal);
   function matrix(f,originX=0){const c=f.center.map((v,k)=>v+originX*f.tangent[k]),o=toLocal(c),a=inverse.elements,cols=[f.tangent,f.back_normal,f.width].map(v=>{const q=nativeVectorToDisplay(v);return [a[0]*q[0]+a[4]*q[1]+a[8]*q[2],a[1]*q[0]+a[5]*q[1]+a[9]*q[2],a[2]*q[0]+a[6]*q[1]+a[10]*q[2]]});return new Matrix4().set(cols[0][0],cols[1][0],cols[2][0],o[0],cols[0][1],cols[1][1],cols[2][1],o[1],cols[0][2],cols[1][2],cols[2][2],o[2],0,0,0,1)}
   const tooth=new InstancedMesh(geometry(body.full_template),e.mesh.material,body.full_tooth_count);tooth.name='primary2GT complete rigid teeth';tooth.userData.rigid_source_profile_teeth=true;body.full_tooth_frames.forEach((f,i)=>tooth.setMatrixAt(i,matrix(f)));tooth.instanceMatrix.needsUpdate=true;tooth.computeBoundingBox();tooth.computeBoundingSphere();e.mesh.add(tooth);e.generated.push(tooth);
   for(const p of body.partial_teeth){const m=new Mesh(geometry(p.template),e.mesh.material);m.name='primary2GT original finite route cut';m.matrixAutoUpdate=false;m.matrix.copy(matrix(p.frame,p.template.local_encoding_origin_x_mm));e.mesh.add(m);e.generated.push(m)}
   reports.push({key:e.route.key,full_tooth_count:body.full_tooth_count,partial_cut_teeth:body.partial_tooth_count,source_arc_length_mm:body.source_arc_length_mm,exact_primary_pitch_station_error_mm:body.exact_primary_pitch_station_error_mm,rigid_profiles_preserved:true,route_exceeds_nominal_stock:body.source_arc_length_mm>body.stock_cut_length_mm,loaded_phase_verified:false,native_fit_verified:false});
  }
  root.updateMatrixWorld(true);return {physical_source_belts:5,rigid_tooth_profile_motion:true,reference_source_reset:['x','y','z'].every(k=>(axes[k]||0)===0),routes:reports,native_fit_verified:false};
 }
 return {entries,update,reset:()=>update({}),keys:new Set(entries.map(e=>e.route.key))};
}

return {createVirtuRigidGT2Flex,buildRigidGT2Route};})();
const complete=(()=>{const {createVirtuRigidGT2Flex}=rigid;// Private May2WD source-bound flex adapter. No rigid hardware is generated.

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mul=(v,s)=>v.map(q=>q*s),unit=v=>mul(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function gaussLegendre(n){
 const t=[],w=[];
 for(let i=0;i<n;i++){
  let z=Math.cos(Math.PI*(i+.75)/(n+.5)),dp;
  for(let j=0;j<30;j++){
   let p=1,q=0;for(let k=1;k<=n;k++){const old=p;p=((2*k-1)*z*p-(k-1)*q)/k;q=old}
   dp=n*(z*p-q)/(z*z-1);const step=p/dp;z-=step;if(Math.abs(step)<1e-15)break;
  }
  t.push((z+1)/2);w.push(1/((1-z*z)*dp*dp));
 }
 return {t,w};
}
const quadrature=gaussLegendre(64);
const bezier=(t,c)=>c[0].map((v,i)=>(1-t)**3*v+3*(1-t)**2*t*c[1][i]+3*(1-t)*t*t*c[2][i]+t**3*c[3][i]);
const derivative=(t,c)=>c[0].map((v,i)=>3*(1-t)**2*(c[1][i]-v)+6*(1-t)*t*(c[2][i]-c[1][i])+3*t*t*(c[3][i]-c[2][i]));
const arcLength=c=>quadrature.t.reduce((s,t,i)=>s+quadrature.w[i]*norm(derivative(t,c)),0);
function sourceHeadPTFERoute(spec,axes={}){
 for(const k of ['x','y'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite VIRTU PTFE axis');
 const delta=[axes.x||0,0,-(axes.y||0)],start=add(spec.head_start_mm,delta),exit=add(spec.head_exit_mm,delta),finish=spec.fixed_bay_end_mm;
 const stem=norm(sub(exit,start)),target=spec.cut_length_mm-stem;
 const controls=h=>[exit,add(exit,mul(spec.head_tangent,h)),add(finish,mul(spec.bay_reverse_tangent,h)),finish];
 let low=0,high=1000;if(!(arcLength(controls(low))<target&&target<arcLength(controls(high))))throw Error('Source PTFE length cannot reach its endpoints');
 for(let i=0;i<56;i++){const mid=(low+high)/2;if(arcLength(controls(mid))<target)low=mid;else high=mid}
 const c=controls((low+high)/2),points=[start],tangents=[unit(sub(exit,start))];
 for(let i=0;i<=spec.Bezier_segments;i++){points.push(bezier(i/spec.Bezier_segments,c));tangents.push(unit(derivative(i/spec.Bezier_segments,c)))}
 const polyline=points.slice(1).reduce((s,p,i)=>s+norm(sub(p,points[i])),0);
 return {points,tangents,controls:c,nominal_length_mm:stem+arcLength(c),rendered_polyline_length_mm:polyline,head_endpoint_mm:start,bay_endpoint_mm:finish};
}
// Endpoint-constrained planar IK; source measured link lengths remain rigid.
// The deterministic smoothness term is display kinematics, not chain stiffness.
function tridiagonalSolve(b,lambda){
 const n=b.length,d=Array.from({length:n},(_,i)=>1+lambda*((i===0||i===n-1)?1:2)),rhs=[...b];
 for(let i=1;i<n;i++){const k=-lambda/d[i-1];d[i]-=k*(-lambda);rhs[i]-=k*rhs[i-1]}
 const x=Array(n);x[n-1]=rhs[n-1]/d[n-1];for(let i=n-2;i>=0;i--)x[i]=(rhs[i]+lambda*x[i+1])/d[i];return x;
}
function sourceTenLinkRoute(spec,z=0){
 if(!Number.isFinite(z))throw Error('Nonfinite chain Z');
 const lengths=spec.source_measured_link_lengths_mm,source=spec.links.map(l=>Math.atan2(l.to_mm[1]-l.from_mm[1],l.to_mm[0]-l.from_mm[0]));
 if(lengths.length!==10||source.length!==10)throw Error('Exact ten original chain bodies required');
 const theta=[...source],steps=Math.max(1,Math.ceil(Math.abs(z)/2));let maxIterations=0;
 for(let step=0;step<steps;step++){
  const partial=z*(step+1)/steps,target=[spec.end_mm[0],spec.end_mm[1]+partial],lambda=Math.abs(partial)*.5;
  let success=false;
  for(let iter=0;iter<80;iter++){
   const end=[...spec.start_mm],jx=[],jy=[];
   theta.forEach((a,i)=>{end[0]+=lengths[i]*Math.cos(a);end[1]+=lengths[i]*Math.sin(a);jx.push(-lengths[i]*Math.sin(a));jy.push(lengths[i]*Math.cos(a))});
   const error=sub(target,end),gradient=theta.map((a,i)=>a-source[i]+lambda*((i? a-theta[i-1]:0)+(i<9?a-theta[i+1]:0)));
   const qg=tridiagonalSolve(gradient,lambda),qx=tridiagonalSolve(jx,lambda),qy=tridiagonalSolve(jy,lambda);
   const aa=dot(jx,qx),bb=dot(jx,qy),cc=dot(jy,qy),det=aa*cc-bb*bb;if(!(det>0))throw Error('Singular source chain endpoint');
   const ex=error[0]+dot(jx,qg),ey=error[1]+dot(jy,qg),lx=(cc*ex-bb*ey)/det,ly=(aa*ey-bb*ex)/det;
   let delta=qg.map((v,i)=>-v+qx[i]*lx+qy[i]*ly);
   if(norm(error)<1e-8&&norm(delta)<1e-7){success=true;maxIterations=Math.max(maxIterations,iter+1);break}
   if(norm(delta)>.2)delta=mul(delta,.2/norm(delta));theta.forEach((_,i)=>theta[i]+=delta[i]);
  }
  if(!success)throw Error('Source chain endpoint solver did not converge');
 }
 const points=[[...spec.start_mm]];theta.forEach((a,i)=>points.push(add(points[i],[lengths[i]*Math.cos(a),lengths[i]*Math.sin(a)])));
 const joints=theta.slice(1).map((a,i)=>Math.abs(a-theta[i])),largest=Math.max(...joints),radius=Math.min(...lengths)/(2*Math.sin(largest/2));
 return {points,angles:theta,source_angles:source,endpoint_error_mm:norm(sub(points[10],[spec.end_mm[0],spec.end_mm[1]+z])),rigid_length_mm:lengths.reduce((s,v)=>s+v,0),largest_internal_joint_angle_deg:largest*180/Math.PI,geometric_hinge_radius_mm:radius,nominal_R28_internal_angle_screen:radius>=spec.nominal_bend_radius_mm,source_connector_angle_deltas_deg:[(theta[0]-source[0])*180/Math.PI,(theta[9]-source[9])*180/Math.PI],maxIterations,physical_end_stop_or_clearance_verified:false};
}
function createVirtuCompleteFlex(root,profile,nativePointToDisplay,nativeVectorToDisplay,GT2spec,GT2binary,logicalKeys=null){
 if(typeof nativePointToDisplay!=='function'||typeof nativeVectorToDisplay!=='function')throw Error('Explicit native point and vector conversion required');
 const belts=createVirtuRigidGT2Flex(root,GT2spec,GT2binary,nativePointToDisplay,nativeVectorToDisplay,logicalKeys),nodes=sourcePhysicalNodeMap(root,logicalKeys);root.updateMatrixWorld(true);
 const chain=profile.chain,links=chain.links.map(l=>{const node=nodes.get(l.keys[0]);if(!node)throw Error('Missing original chain link');node.matrixAutoUpdate=false;return {spec:l,node,local:node.matrix.clone(),world:node.matrixWorld.clone()}});
 const ends=chain.end_parts.map(e=>{const node=nodes.get(e.key);if(!node)throw Error('Missing original chain end');node.matrixAutoUpdate=false;return {spec:e,node,local:node.matrix.clone(),world:node.matrixWorld.clone()}});
 const tubeNode=nodes.get(profile.PTFE490.key);if(!tubeNode)throw Error('Missing actual PTFE490');const tubeMeshes=[];tubeNode.traverse(o=>{if(o.isMesh)tubeMeshes.push(o)});if(tubeMeshes.length!==1)throw Error('One full PTFE490 body required');const tube=tubeMeshes[0];tube.geometry=tube.geometry.clone();
 const pos=tube.geometry.getAttribute('position'),normal=tube.geometry.getAttribute('normal'),initialPosition=new Float32Array(pos.array),initialNormal=new Float32Array(normal.array);
 const Matrix=root.matrix.constructor,Vector=root.position.constructor,Quaternion=root.quaternion.constructor;
 function setWorld(node,world){node.parent?.updateMatrixWorld(true);const m=node.parent?node.parent.matrixWorld.clone().invert().multiply(world):world;node.matrix.copy(m);node.matrix.decompose(node.position,node.quaternion,node.scale);node.matrixWorldNeedsUpdate=true;node.updateMatrixWorld(true)}
 function restore(part){part.node.matrix.copy(part.local);part.node.matrix.decompose(part.node.position,part.node.quaternion,part.node.scale);part.node.matrixWorldNeedsUpdate=true;part.node.updateMatrixWorld(true)}
 function chainUpdate(z){
  if(z===0){links.forEach(restore);ends.forEach(restore);return {actual_source_matrices_reset:true,source_joint_precision_gap_mm:chain.native_joint_gap_mm,rigid_source_links:10}}
  const route=sourceTenLinkRoute(chain,z),normalAxis=[0,0,0];normalAxis[chain.normal_axis]=1;const axis=new Vector(...nativeVectorToDisplay(normalAxis)).normalize();
  function point(p){const out=[0,0,0];chain.plane_axes.forEach((a,i)=>out[a]=p[i]);out[chain.normal_axis]=chain.normal_station_mm;return new Vector(...nativePointToDisplay(out))}
  links.forEach((l,i)=>{const rotation=new Matrix().makeRotationAxis(axis,route.angles[i]-route.source_angles[i]);const old=point(l.spec.from_mm),next=point(route.points[i]);const transform=new Matrix().makeTranslation(...next.toArray()).multiply(rotation).multiply(new Matrix().makeTranslation(...old.negate().toArray()));setWorld(l.node,transform.multiply(l.world.clone()))});
  ends.forEach(e=>{if(e.spec.group==='fixed'){restore(e);return}const delta=nativeVectorToDisplay([0,z,0]);setWorld(e.node,new Matrix().makeTranslation(...delta).multiply(e.world.clone()))});
  return route;
 }
 function tubeUpdate(axes){
  if((axes.x||0)===0&&(axes.y||0)===0){pos.array.set(initialPosition);normal.array.set(initialNormal);pos.needsUpdate=true;normal.needsUpdate=true;tube.geometry.computeBoundingBox();tube.geometry.computeBoundingSphere();return {actual_source_mesh_reset:true,nominal_length_mm:490}}
  const route=sourceHeadPTFERoute(profile.PTFE490,axes);tube.updateMatrixWorld(true);const inverse=tube.matrixWorld.clone().invert(),world=tube.matrixWorld.elements;let previous=[1,0,0],rows=[];
  for(let i=0;i<route.points.length;i++){
   const t=route.tangents[i],u=unit(sub(previous,mul(t,dot(previous,t)))),v=cross(t,u);previous=u;const radials=[];
   for(let j=0;j<64;j++){const a=j*2*Math.PI/64;radials.push(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))))}rows.push(radials);
  }
  let cursor=0;
  function write(p,n){
   const local=new Vector(...nativePointToDisplay(p)).applyMatrix4(inverse),nw=unit(nativeVectorToDisplay(n));const nl=unit([world[0]*nw[0]+world[1]*nw[1]+world[2]*nw[2],world[4]*nw[0]+world[5]*nw[1]+world[6]*nw[2],world[8]*nw[0]+world[9]*nw[1]+world[10]*nw[2]]);pos.array.set(local.toArray(),cursor*3);normal.array.set(nl,cursor*3);cursor++;
  }
  route.points.forEach((p,i)=>{for(const radius of [2,1])for(const radial of rows[i])write(add(p,mul(radial,radius)),mul(radial,radius===2?1:-1))});
  for(const [i,sign] of [[0,-1],[route.points.length-1,1]])for(const radius of [2,1])for(const radial of rows[i])write(add(route.points[i],mul(radial,radius)),mul(route.tangents[i],sign));
  if(cursor!==pos.count)throw Error('PTFE complete mesh count changed');if(!pos.array.every(Number.isFinite)||!normal.array.every(Number.isFinite))throw Error('Nonfinite PTFE');pos.needsUpdate=true;normal.needsUpdate=true;tube.geometry.computeBoundingBox();tube.geometry.computeBoundingSphere();return {...route,points:undefined,tangents:undefined,native_fit_verified:false};
 }
 return {belts,links,ends,tube,controlledKeys:new Set([...belts.keys,...links.map(l=>l.spec.keys[0]),...ends.map(e=>e.spec.key),profile.PTFE490.key]),update(axes={}){for(const k of ['x','y','z'])if(!Number.isFinite(axes[k]??0))throw Error('Nonfinite flex axis');root.updateMatrixWorld(true);return {belts:belts.update(axes),chain:chainUpdate(axes.z||0),PTFE490:tubeUpdate(axes),native_fit_verified:false}},reset(){return this.update({x:0,y:0,z:0})}};
}

return {createVirtuCompleteFlex};})();
return {...rigid,...complete};})();
export const createVirtuCompleteFlex190=source190.createVirtuCompleteFlex;
export const buildRigidGT2Route190=source190.buildRigidGT2Route;
