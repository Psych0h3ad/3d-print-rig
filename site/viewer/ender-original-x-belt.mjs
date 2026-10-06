// Original pinned Ender source-derived rubber envelope; no tension/tooth simulation.
export function createOriginalEnderXBelt(root,profile){
 const spec=profile.original_ender_x_belt;
 if(!spec)return {enabled:false,update(){}};
 if(profile.machine_id!=='ender3_stock_220'||spec.schema!==1||spec.part_key!=='00037'||spec.group!=='ender_x_belt'||JSON.stringify(profile.basis)!=='[[1,0,0],[0,1,0],[0,0,1]]'||profile.origin_mm.some(v=>v!==0)||JSON.stringify(profile.motions.ender_x_belt)!=='[0,"z",0]')throw Error('Invalid original Ender X belt registration');
 const parents=[];root.traverse(n=>{if(n.userData?.part_key==='00037')parents.push(n)});
 if(parents.length!==1)throw Error('Missing original Ender X belt assembly');
 const entries=[],seen=new Set();
 parents[0].traverse(mesh=>{
  if(!mesh.isMesh)return;
  const name=mesh.userData?.belt_component;
  if(!spec.components.includes(name)||seen.has(name))throw Error('Invalid original Ender X belt component');
  seen.add(name);mesh.geometry=mesh.geometry.clone();
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),weight=geometry.getAttribute(spec.geometry_attribute);
  if(!position||!normal||!weight||position.count!==normal.count||position.count!==weight.count||weight.itemSize!==1)throw Error('Missing original Ender X belt motion weights');
  const source=position.array.slice(),normals=normal.array.slice(),weights=weight.array.slice();
  if([...source,...normals,...weights].some(v=>!Number.isFinite(v))||weights.some(v=>v<0||v>1))throw Error('Invalid original Ender X belt geometry');
  if(name==='fixed-return-pulleys'?weights.some(v=>v!==0):!name.endsWith('front-span')?weights.some(v=>v!==1):Math.min(...weights)!==0||Math.max(...weights)!==1)throw Error('Invalid original Ender X belt endpoint weights');
  entries.push({mesh,source,normals,weights,name});
 });
 if(seen.size!==spec.components.length)throw Error('Incomplete original Ender X belt geometry');
 function update(axes){
  if(!Number.isFinite(axes.x)||axes.x<profile.axes.x[0]||axes.x>profile.axes.x[1])throw Error('Original Ender X belt axis exceeds registered preview range');
  for(const e of entries){
   const g=e.mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal');p.array.set(e.source);
   if(axes.x!==0)for(let i=0;i<p.count;i++)p.array[3*i]=e.source[3*i]+axes.x*.001*e.weights[i];
   p.needsUpdate=true;
   if(axes.x===0||!e.name.endsWith('front-span')){n.array.set(e.normals);n.needsUpdate=true}else g.computeVertexNormals();
   g.computeBoundingBox();g.computeBoundingSphere();
  }
 }
 return {enabled:true,entries,update,scope:'Source-derived preview envelope; no tooth engagement, belt tension or physical operation certificate.'};
}
