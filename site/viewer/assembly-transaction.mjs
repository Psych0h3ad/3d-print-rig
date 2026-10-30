// Reversible scene edits. Resource disposal belongs after successful commit.
export function captureAssemblyState(roots,{mutableIndices=new Set()}={}){
 const nodes=new Map(),materials=new Map(),geometries=new Map();
 for(const root of roots)root?.traverse(o=>{
  if(nodes.has(o))return;
  nodes.set(o,{children:[...o.children],position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone(),matrix:o.matrix.clone(),auto:o.matrixAutoUpdate,visible:o.visible,geometry:o.geometry,material:o.material});
  if(o.geometry&&!geometries.has(o.geometry)){
   const g=o.geometry;geometries.set(g,{index:g.index,draw:{...g.drawRange},indexBytes:mutableIndices.has(g)&&g.index?g.index.array.slice():null});
  }
  for(const m of [].concat(o.material||[]))if(!materials.has(m))materials.set(m,{color:m.color?.clone(),metalness:m.metalness,roughness:m.roughness});
 });
 return ()=>{
  for(const[o,s]of nodes){
   if(o.children.length!==s.children.length||o.children.some((c,i)=>c!==s.children[i])){o.clear();if(s.children.length)o.add(...s.children)}
   o.position.copy(s.position);o.quaternion.copy(s.quaternion);o.scale.copy(s.scale);o.matrix.copy(s.matrix);o.matrixAutoUpdate=s.auto;o.visible=s.visible;
   if('geometry'in o)o.geometry=s.geometry;if('material'in o)o.material=s.material;o.matrixWorldNeedsUpdate=true;
  }
  for(const[g,s]of geometries){g.setIndex(s.index);g.setDrawRange(s.draw.start,s.draw.count);if(s.indexBytes){s.index.array.set(s.indexBytes);s.index.needsUpdate=true}}
  for(const[m,s]of materials){if(s.color)m.color.copy(s.color);if(s.metalness!==undefined)m.metalness=s.metalness;if(s.roughness!==undefined)m.roughness=s.roughness}
  for(const root of roots)root?.updateWorldMatrix(true,true);
 };
}
