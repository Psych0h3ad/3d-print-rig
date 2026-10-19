import * as THREE from 'three';
const point=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);

// The project already supplies these static display sweeps. Only their existing
// source control points are carried by the actual retained hosts; no new anchor,
// wire length, rigid part or electrical connector fit is inferred.
export function createSourceServiceRoutes({model,meshes,input,getHead}){
 const stock=new Map(meshes.map(m=>[String(m.userData.originalKey||m.userData.partKey),m]));
 const group=new THREE.Group();group.name='Retained_SIBOOR_PTFE_CAN_display_routes';model.add(group);group.visible=false;
 const definitions=['PTFE','CAN'].map(kind=>{
  const key=kind==='PTFE'?'PTFE_tube':'CAN_cable',original=stock.get(key);if(!original)throw Error('Missing original SIBOOR service reference: '+key);
  const material=Array.isArray(original.material)?original.material[0].clone():original.material.clone();
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.name='Retained_SIBOOR_'+kind;mesh.frustumCulled=false;group.add(mesh);
  return {kind,key,mesh,definition:input[kind],last:null,points:[],world:[],bindings:input[kind].bindings.map(b=>({...b,inverse:b.host==='fixed_model'?null:new THREE.Matrix4().fromArray(input.source_reference_matrices[b.host]).invert()}))};
 });
 let latest=null;
 const host=key=>stock.get(key)||getHead()?.entries.find(e=>String(e.key)===key)?.mesh;
 function update(enabled){
  group.visible=!!enabled;if(!enabled){latest={ptfe:false,can:false,service_route_scope:'Existing SIBOOR display routes; hidden by user.'};return latest}
  model.updateWorldMatrix(true,true);const inverse=model.matrixWorld.clone().invert(),rows=[];
  for(const row of definitions){
   row.world=row.bindings.map(b=>{
    const p=point(b.point_CAD_mm);
    if(b.host==='fixed_model')return p.applyMatrix4(model.matrixWorld);
    const h=host(b.host);if(!h)throw Error('Missing retained service-route host '+b.host);h.updateWorldMatrix(true,false);return p.applyMatrix4(b.inverse).applyMatrix4(h.matrixWorld);
   });
   row.points=row.world.map(p=>p.clone().applyMatrix4(inverse));const signature=row.points.flatMap(p=>p.toArray()).join(',');
   if(signature!==row.last){
    const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(row.points,false,'centripetal'),160,row.definition.radius_mm/1000,8,false);
    const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
    if(!positions||!normals||![...positions.array,...normals.array].every(Number.isFinite))throw Error('Nonfinite original service-route sweep');
    row.mesh.geometry.dispose();row.mesh.geometry=geometry;row.last=signature;
   }
   row.mesh.visible=true;row.mesh.updateWorldMatrix(true,false);
   const a=row.mesh.geometry.getAttribute('position'),centers=[0,160*9].map(offset=>{const p=new THREE.Vector3();for(let j=0;j<8;j++)p.add(new THREE.Vector3().fromBufferAttribute(a,offset+j));return p.multiplyScalar(1/8).applyMatrix4(row.mesh.matrixWorld)});
   const errors=centers.map((p,i)=>p.distanceTo(row.world[i?row.world.length-1:0])*1000);
   rows.push({kind:row.kind,actual_start_world_m:centers[0].toArray(),actual_end_world_m:centers[1].toArray(),host_start_world_m:row.world[0].toArray(),host_end_world_m:row.world.at(-1).toArray(),actual_endpoint_errors_mm:errors,source_control_points:row.points.length,source_host_keys:row.bindings.map(b=>b.host)});
  }
  latest={ptfe:true,can:true,service_route_endpoint_max_error_mm:Math.max(...rows.flatMap(r=>r.actual_endpoint_errors_mm)),service_routes:rows,service_route_scope:'Existing SIBOOR display sweeps attached to actual retained CW2,47-link,clip and fixed hosts. Cable length,bend limits,electrical pins and whole-body clearance remain unqualified.'};return latest;
 }
 function deactivate(){group.visible=false;latest=null}
 function visibility(){const visible=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return true};return {PTFE:visible(definitions[0].mesh),CAN:visible(definitions[1].mesh)}}
 return {update,deactivate,visibility,group,definitions,get diagnostics(){return latest}};
}
