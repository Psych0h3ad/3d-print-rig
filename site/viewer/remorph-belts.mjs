export function createRemorphBelts(nodes,bindings){
  const entries=bindings.xy_belts.map(b=>{const node=nodes.get(b.key),meshes=[];node.traverse(n=>{if(n.isMesh)meshes.push(n)});if(meshes.length!==1)throw Error('Belt mesh mismatch');const mesh=meshes[0],attribute=mesh.geometry.attributes.position;if(attribute.count!==b.vertex_count)throw Error('Belt vertex mismatch');mesh.geometry=mesh.geometry.clone();return {...b,node,mesh,origin:attribute.array.slice()}});
  const keys=new Set([...entries.map(e=>e.key),...bindings.fixed_z_belt_keys]);
  function update(delta,visible){
    for(const e of entries){const p=e.mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[3*i]=e.origin[3*i]+delta[0]*e.weights_xy[i][0]/1000;p.array[3*i+2]=e.origin[3*i+2]-delta[1]*e.weights_xy[i][1]/1000}p.needsUpdate=true;e.mesh.geometry.computeVertexNormals();e.mesh.geometry.computeBoundingBox();e.mesh.geometry.computeBoundingSphere()}
    for(const key of keys)nodes.get(key).visible=Boolean(visible);
    return {xy_belts:entries.length,fixed_z_belts:bindings.fixed_z_belt_keys.length,visible:Boolean(visible),representation:'Native smooth belt envelopes; teeth, tension and pulley spin not simulated'};
  }
  return {keys,entries,update};
}
