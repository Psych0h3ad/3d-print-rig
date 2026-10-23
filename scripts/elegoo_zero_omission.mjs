// Independent replay against the pinned unfiltered GLB. No area tolerance.
import assert from 'node:assert/strict';
export function assertZeroOmission({json,bin,manifest,sourceJSON,sourceBIN,sourceManifest,accessor,sha256}){
 const f=manifest.mesh_export_filter;
 assert.equal(f.schema,'exact-zero-index-omission-v1');
 assert.equal(f.source_triangles,sourceManifest.triangles);
 for(const key of ['asset','nodes','meshes','scenes','scene','materials'])assert.deepEqual(json[key],sourceJSON[key],'Changed source '+key);
 assert.equal(json.accessors.length,sourceJSON.accessors.length);
 assert.equal(json.bufferViews.length,sourceJSON.bufferViews.length);
 const omitted=new Map(),changedAccessors=new Set();let occurrenceOmissions=0;
 const bits=new DataView(new ArrayBuffer(4));
 const integer=x=>{bits.setFloat32(0,x,true);const b=bits.getUint32(0,true),e=(b>>>23)&255,m=b&0x7fffff;
  assert(e!==255);const v=BigInt(e?m+0x800000:m)<<BigInt(e?e-1:0);return b>>>31?-v:v;};
 const zero=t=>{const p=t.map(v=>v.map(integer)),u=p[1].map((x,i)=>x-p[0][i]),v=p[2].map((x,i)=>x-p[0][i]);
  return [0,1,2].every(j=>u[j]*v[(j+1)%3]===u[(j+1)%3]*v[j]);};
 for(const row of f.primitives){
  const key=row.mesh+':'+row.primitive;assert(!omitted.has(key));omitted.set(key,row);
  const p=sourceJSON.meshes[row.mesh].primitives[row.primitive],a=accessor(sourceJSON,sourceBIN,p.indices);
  assert.equal(a.count/3,row.source_triangles);changedAccessors.add(p.indices);
  const position=accessor(sourceJSON,sourceBIN,p.attributes.POSITION).array;
  const ids=row.omitted_exact_zero_facet_ids;assert(ids.length>0&&ids.every((x,i)=>Number.isSafeInteger(x)&&x>=0&&x<row.source_triangles&&(!i||x>ids[i-1])));
  for(const id of ids){const t=Array.from({length:3},(_,j)=>Array.from({length:3},(_,k)=>position[a.array[id*3+j]*3+k]));assert(zero(t),'Omitted a nonzero source facet');}
  const nodes=sourceJSON.nodes.filter(n=>n.mesh===row.mesh).map(n=>n.name);assert.deepEqual(row.nodes,nodes);
  occurrenceOmissions+=ids.length*nodes.length;
 }
 for(let i=0;i<json.accessors.length;i++){
  const a=accessor(json,bin,i),b=accessor(sourceJSON,sourceBIN,i);
  if(!changedAccessors.has(i)){
   assert.deepEqual(json.accessors[i],sourceJSON.accessors[i]);assert.equal(a.sha256,b.sha256,'Changed source attribute/accessor');
  }else{
   const x={...json.accessors[i]},y={...sourceJSON.accessors[i]};for(const k of ['count','min','max']){delete x[k];delete y[k];}assert.deepEqual(x,y);
  }
 }
 for(const [mid,mesh]of sourceJSON.meshes.entries())for(const [pi,p]of mesh.primitives.entries()){
  const old=accessor(sourceJSON,sourceBIN,p.indices).array,now=accessor(json,bin,p.indices).array,drop=omitted.get(mid+':'+pi)?.omitted_exact_zero_facet_ids||[];
  assert.equal(now.length,old.length-drop.length*3);let d=0,n=0;
  for(let i=0;i<old.length/3;i++){if(drop[d]===i){d++;continue;}for(let j=0;j<3;j++)assert.equal(now[n++],old[i*3+j],'Nonzero source facet/order changed');}
 }
 assert.equal(manifest.triangles,sourceManifest.triangles-occurrenceOmissions);assert.equal(f.omitted_triangles,occurrenceOmissions);
 assert.equal(manifest.parts.length,sourceManifest.parts.length);
 for(let i=0;i<manifest.parts.length;i++){
  const p=manifest.parts[i],s=sourceManifest.parts[i],x={...p};let n=0;
  for(const row of f.primitives)if(row.nodes.includes(p.node))n+=row.omitted_exact_zero_facet_ids.length;
  if(n){assert.equal(p.source_triangle_count,s.triangle_count);assert.equal(p.triangle_count,s.triangle_count-n);delete x.source_triangle_count;x.triangle_count=s.triangle_count;
   if('triangles' in s){assert.equal(p.triangles,p.triangle_count);x.triangles=s.triangles;}}
  assert.deepEqual(x,s,'Source part metadata changed');
 }
 return {schema:f.schema,source_model_sha256:f.source_model_sha256,omitted_triangles:occurrenceOmissions,
  exact_nonzero_triangle_subsequence:true,all_attributes_nodes_materials_transforms_exact:true,native_CAD_repaired:false};
}
