// Layout-owned procedural belts only. Source GLBs and ordinary viewers are untouched.
// No epsilon, normal synthesis, vertex motion, or positive-area face removal.
function assert(value,message){if(!value)throw Error('Layout belt cleanup: '+message)}
function face(geometry,start){
 const p=geometry.attributes.position,a=[p.getX(start),p.getY(start),p.getZ(start)],b=[p.getX(start+1),p.getY(start+1),p.getZ(start+1)],c=[p.getX(start+2),p.getY(start+2),p.getZ(start+2)];
 assert([...a,...b,...c].every(Number.isFinite),'nonfinite source position');
 const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
 return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
}
export function cleanupProceduralBeltGeometry(geometry){
 assert(geometry?.type==='ExtrudeGeometry','unexpected procedural geometry type');
 assert(!geometry.index,'indexed belts need a separately proved cleanup');
 assert(Object.keys(geometry.morphAttributes??{}).length===0,'morph attributes not supported');
 const p=geometry.attributes.position;
 assert(p&&p.count%3===0,'non-triangle position layout');
 const groups=geometry.groups;
 assert(groups.length===2&&groups[0].materialIndex===0&&groups[1].materialIndex===1,'source cap/side group association changed');
 assert(groups[0].start===0&&groups[1].start===groups[0].count&&groups[1].start+groups[1].count===p.count,'source groups must cover vertices once');
 assert(groups.every(g=>g.start%3===0&&g.count%3===0),'non-triangle groups');
 assert(geometry.drawRange.start===0&&geometry.drawRange.count===Infinity,'partial source draw range');
 for(const [name,a]of Object.entries(geometry.attributes))assert(!a.isInterleavedBufferAttribute&&a.array&&a.count===p.count,'unsupported attribute '+name);
 const kept=[],removed=[],newGroups=[];
 for(const group of groups){
  const start=kept.length;
  for(let i=group.start;i<group.start+group.count;i+=3){
   const cross=face(geometry,i),zero=cross.every(v=>v===0);
   // The one qualified cause is an exactly collinear cap triangulation.
   // A degenerate side or any other case remains a finding, not a fallback.
   if(zero&&group.materialIndex===0)removed.push({triangle:i/3,firstVertex:i,materialIndex:group.materialIndex,exactDoubleArea:0});
   else kept.push(i,i+1,i+2);
  }
  newGroups.push({start,count:kept.length-start,materialIndex:group.materialIndex});
 }
 if(!removed.length)return {geometry,changed:false,removedTriangles:[],retainedTriangles:p.count/3};
 assert(kept.length>0,'cleanup would remove the entire belt');
 const output=geometry.clone();
 for(const [name,a]of Object.entries(geometry.attributes)){
  const bytesPerVertex=a.itemSize*a.array.BYTES_PER_ELEMENT;
  const array=new a.array.constructor(kept.length*a.itemSize);
  const source=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),target=new Uint8Array(array.buffer);
  for(let i=0;i<kept.length;i++)target.set(source.subarray(kept[i]*bytesPerVertex,(kept[i]+1)*bytesPerVertex),i*bytesPerVertex);
  const attribute=new a.constructor(array,a.itemSize,a.normalized);
  attribute.name=a.name;attribute.setUsage(a.usage);attribute.gpuType=a.gpuType;
  output.setAttribute(name,attribute);
 }
 output.clearGroups();for(const group of newGroups)output.addGroup(group.start,group.count,group.materialIndex);
 output.computeBoundingBox();output.computeBoundingSphere();
 geometry.computeBoundingBox();
 assert(output.boundingBox.min.equals(geometry.boundingBox.min)&&output.boundingBox.max.equals(geometry.boundingBox.max),'cleanup changed belt bounds');
 output.userData={...geometry.userData,layoutExactZeroAreaCapCleanup:true};
 return {geometry:output,changed:true,removedTriangles:removed,retainedTriangles:kept.length/3,positiveAreaAttributes:'Exact original bytes retained in original triangle order',materialGroups:'Same material index for every retained face; contiguous ranges compacted',normalSynthesis:false};
}
export function cleanupLayoutRatRigBelts(root){
 const targets=[];
 root.traverse(n=>{if(n.isMesh&&/^dynamic_belt_\d+$/.test(n.name)&&n.parent?.name==='RatRig_Dynamic_Routes')targets.push(n)});
 assert(targets.length>0,'source procedural belt group missing');
 const geometries=new Map();
 root.traverse(n=>{if(n.isMesh)geometries.set(n.geometry,(geometries.get(n.geometry)??0)+1)});
 const records=[];
 for(const mesh of targets){
  assert(geometries.get(mesh.geometry)===1,'belt geometry shared with another source mesh');
  const original=mesh.geometry,result=cleanupProceduralBeltGeometry(original);
  if(result.changed){mesh.geometry=result.geometry;original.dispose()}
  records.push({meshName:mesh.name,changed:result.changed,removedTriangles:result.removedTriangles,retainedTriangles:result.retainedTriangles});
 }
 return {scope:'Layout-owned RatRig procedural ExtrudeGeometry cap faces only',rule:'Remove only exact cross-product zero cap triangles; no epsilon',belts:records,removedTriangles:records.reduce((s,r)=>s+r.removedTriangles.length,0),sourceGLBChanged:false,positiveAreaVertexUVNormalMaterialValuesUnchanged:true,normalFallback:false,notice:'Only generated belt cap triangles with exactly zero area are omitted in this layout scene. Original source model faces are retained.'};
}
