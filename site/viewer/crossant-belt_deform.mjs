/** Preserve native pulley caps and clamp bends. Source geometry is never hidden by motion. */
export const cadToGlb=([x,y,z])=>[x/1000,z/1000,-y/1000];
export function weightAt(value,spec){
 const [a,b]=spec.stationary_interval_mm,[l,h]=spec.clamp_interval_mm;
 if(!(a<l&&l<h&&h<b))throw Error('Invalid belt clamp interval');
 return value<=a||value>=b?0:value<l?(value-a)/(l-a):value<=h?1:(b-value)/(b-h);
}
export function createBeltDeformer(position,spec){
 if(position.length%3!==0)throw Error('Invalid belt vertex array');
 const source=new Float32Array(position),weights=new Float64Array(source.length/3);
 const glbIndex=spec.drive_axis==='X'?0:2,sign=spec.drive_axis==='X'?1:-1;
 for(let i=0;i<weights.length;i++)weights[i]=weightAt(source[i*3+glbIndex]*1000*sign,spec);
 let last=NaN;
 function update(deltaMm,target=position){
  if(!Number.isFinite(deltaMm))throw Error('Invalid belt displacement');
  const [a,b]=spec.stationary_interval_mm,[l,h]=spec.clamp_interval_mm;
  if(l+deltaMm<=a||h+deltaMm>=b)throw Error('Belt clamp left registered straight run');
  if(target.length!==source.length)throw Error('Belt topology changed');
  if(last===deltaMm&&target===position)return;
  target.set(source);
  for(let i=0;i<weights.length;i++)target[i*3+glbIndex]=source[i*3+glbIndex]+sign*deltaMm*.001*weights[i];
  last=deltaMm;
 }
 return {source,weights,update,spec};
}

export function createNativeBelts(nodes,bindings){
 const entries=bindings.belts.map(spec=>{
  const node=nodes.get(spec.key),meshes=[];if(!node)throw Error('Missing Crossant belt '+spec.key);
  node.traverse(m=>{if(m.isMesh)meshes.push(m)});
  if(meshes.length!==1)throw Error('Crossant belt mesh ownership is ambiguous');
  const mesh=meshes[0];mesh.geometry=mesh.geometry.clone();
  const deformer=createBeltDeformer(mesh.geometry.attributes.position.array,spec);
  return {spec,node,mesh,deformer};
 });
 let visible=true;
 function update(delta){
  for(const e of entries){
   e.deformer.update(delta[e.spec.drive_axis.toLowerCase()]);
   e.mesh.geometry.attributes.position.needsUpdate=true;
   e.mesh.geometry.computeVertexNormals();e.mesh.geometry.computeBoundingBox();e.mesh.geometry.computeBoundingSphere();
   e.node.visible=visible;e.mesh.visible=visible;
  }
 }
 function setVisible(value){visible=Boolean(value);for(const e of entries){e.node.visible=visible;e.mesh.visible=visible;}}
 return {entries,keys:new Set(entries.map(e=>e.spec.key)),update,setVisible};
}
