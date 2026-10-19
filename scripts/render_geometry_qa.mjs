// CPU rendering checks. Native fit and browser appearance are separate evidence.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
function f32Cross(q){const f=Math.fround,u=sub(q[1],q[0]).map(f),v=sub(q[2],q[0]).map(f);return [f(f(u[1]*v[2])-f(u[2]*v[1])),f(f(u[2]*v[0])-f(u[0]*v[2])),f(f(u[0]*v[1])-f(u[1]*v[0]))];}
function multiply(a,b){const r=Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function nodeMatrix(n){if(n.matrix)return n.matrix;const[x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],[tx,ty,tz]=n.translation||[0,0,0];return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];}
function linear(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];}
function determinant(m){return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);}
function inverseTranspose(m,v){const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]],d=determinant(m);return cross(b,c).map((x,i)=>(x*v[0]+cross(c,a)[i]*v[1]+cross(a,b)[i]*v[2])/d);}
export function scanTriangle(q,n,{worldMatrix=identity,sourceTriangleId=null,sourceFaceId=null}={}){
 const finite=q.flat().every(Number.isFinite)&&n.flat().every(Number.isFinite),c=cross(sub(q[1],q[0]),sub(q[2],q[0])),fc=f32Cross(q),d=determinant(worldMatrix);
 const localOpposed=n.some(v=>dot(c,v)<0),unit=n.every(v=>Math.abs(Math.hypot(...v)-1)<=1e-4);
 // Three r180 reverses front-face parity for matrixWorld.determinant()<0.
 // Normals use inverse transpose. Never reverse supplied source index winding.
 const wc=cross(linear(worldMatrix,sub(q[1],q[0])),linear(worldMatrix,sub(q[2],q[0])));
 const transformValid=worldMatrix.every(Number.isFinite)&&Number.isFinite(d)&&d!==0;
 // With the renderer's front-face parity, the exact identity is
 // sign(det M) * cross(Ma,Mb).(M^-T n) = |det M| * cross(a,b).n.
 // Evaluate the sign in source space: a tangent source normal has exact
 // dot0; separately rounded matrix arithmetic can spuriously make it negative.
 // This uses no angular epsilon or normal/geometry change.
 const roundedWorldOpposed=transformValid&&n.some(v=>Math.sign(d)*dot(wc,inverseTranspose(worldMatrix,v))<0);
 const worldOpposed=transformValid&&localOpposed;
 return {sourceTriangleId,sourceFaceId,finite,unitNormals:unit,zeroArea:c.every(x=>x===0),float32CrossCollapse:fc.every(x=>x===0),
   localNormalWindingConflict:localOpposed,mirrorConventionConflict:worldOpposed,roundedWorldSignDisagreement:transformValid&&roundedWorldOpposed!==localOpposed,singularOrNonfiniteTransform:!transformValid};
}
export function scanTriangles(triangles,options={}){
 const counts={nonfinite:0,nonunitNormals:0,zeroArea:0,float32CrossCollapse:0,localNormalWindingConflict:0,mirrorConventionConflict:0,singularOrNonfiniteTransform:0},findings=[];
 triangles.forEach((t,i)=>{const r=scanTriangle(t.positions,t.normals,{...options,sourceTriangleId:t.source_triangle_id??i,sourceFaceId:t.source_native_face_id??null});let bad=false;
  for(const k of Object.keys(counts)){const hit=k==='nonfinite'?!r.finite:k==='nonunitNormals'?!r.unitNormals:r[k];if(hit){counts[k]++;bad=true;}}if(bad)findings.push(r);});
 return {passed:!Object.values(counts).some(Boolean),triangles:triangles.length,counts,findings};
}
export function verifySourceOwnership(actual,expected){
 const missing=[],duplicates=[];
 for(const e of expected){const matches=actual.filter(t=>t.source_triangle_id===e.source_triangle_id&&(!e.part_key||t.part_key===e.part_key));
  if(!matches.length)missing.push(e.source_triangle_id);else if(matches.length!==1)duplicates.push(e.source_triangle_id);
  else if(JSON.stringify(matches[0].positions)!==JSON.stringify(e.positions)||(e.source_native_face_id!==undefined&&matches[0].source_native_face_id!==e.source_native_face_id))missing.push(e.source_triangle_id);}
 return {passed:!missing.length&&!duplicates.length,missing,duplicates,expected:expected.length};
}
export function readGlb(bytes){
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
 const length=bytes.readUInt32LE(12);if(bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing JSON');const document=JSON.parse(bytes.subarray(20,20+length));
 const binStart=28+length;if(bytes.readUInt32LE(24+length)!==0x004e4942)throw Error('Missing BIN');
 const arity={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},width={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 function accessor(id){const a=document.accessors[id],v=document.bufferViews[a.bufferView];if(a.sparse||v.buffer!==0)throw Error('Unsupported accessor');const n=arity[a.type],w=width[a.componentType],stride=v.byteStride||n*w,start=binStart+(v.byteOffset||0)+(a.byteOffset||0);
  const method=({5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'})[a.componentType],read=bytes[method].bind(bytes),normalized=a.normalized&&a.componentType!==5126,max=({5120:127,5121:255,5122:32767,5123:65535,5125:4294967295})[a.componentType],minimum=a.componentType===5120||a.componentType===5122?-1:0;
  function get(i,j=0){const x=read(start+i*stride+j*w);return normalized?Math.max(minimum,x/max):x;}
  return {count:a.count,n,get,vector:i=>Array.from({length:n},(_,j)=>get(i,j)),source:a,byteOffset:start,width:w,stride};}
 return {document,accessor,bytes,binStart};
}
export function ownedPrimitives(asset,{physicalPartKeys=null}={}){
 const g=asset.document,rows=[],parents=new Set(),visiting=new Set(),physicalRoots=new Map(),registered=physicalPartKeys?new Set(physicalPartKeys):null;
 for(const n of g.nodes)for(const c of n.children||[]){if(parents.has(c))throw Error('Multiple source parents');parents.add(c);}
 function walk(i,m,owner,ownerNode){if(visiting.has(i))throw Error('Cycle');visiting.add(i);const n=g.nodes[i],world=multiply(m,nodeMatrix(n)),declared=n.extras?.part_key;
  // Physical ownership comes from the registered source root. An encoding
  // child never becomes a second physical part, even if its extras has a key.
  if(declared&&!gIsChild(n)){
   if(registered&&!registered.has(declared))throw Error('Unregistered physical source root: '+declared);
   if(physicalRoots.has(declared))throw Error('Duplicate physical source root: '+declared);
   physicalRoots.set(declared,i);owner=declared;ownerNode=i;
  }
  if(n.mesh!==undefined){if(!owner)throw Error('Source mesh has no physical owner');g.meshes[n.mesh].primitives.forEach((p,primitive)=>rows.push({part_key:owner,physical_root_node:ownerNode,node:i,mesh:n.mesh,primitive,worldMatrix:world,p}));}
  for(const c of n.children||[])walk(c,world,owner,ownerNode);visiting.delete(i);}
 const roots=new Set(g.scenes[g.scene??0].nodes);for(const i of roots)walk(i,identity,null,null);
 if(registered)for(const key of registered)if(!physicalRoots.has(key))throw Error('Missing physical source root: '+key);
 return rows;
}
function scanPrimitiveFast(pos,normal,indices,count,explicit,face){
 const counts={nonfinite:0,nonunitNormals:0,zeroArea:0,float32CrossCollapse:0,localNormalWindingConflict:0},findings=[];let positive=0;
 const f=Math.fround;
 for(let t=0;t<count/3;t++){
  const i0=indices?indices.get(3*t):3*t,i1=indices?indices.get(3*t+1):3*t+1,i2=indices?indices.get(3*t+2):3*t+2;
  const x0=pos.get(i0),y0=pos.get(i0,1),z0=pos.get(i0,2),x1=pos.get(i1),y1=pos.get(i1,1),z1=pos.get(i1,2),x2=pos.get(i2),y2=pos.get(i2,1),z2=pos.get(i2,2);
  const ux=x1-x0,uy=y1-y0,uz=z1-z0,vx=x2-x0,vy=y2-y0,vz=z2-z0,cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
  const a0=normal.get(i0),b0=normal.get(i0,1),c0=normal.get(i0,2),a1=normal.get(i1),b1=normal.get(i1,1),c1=normal.get(i1,2),a2=normal.get(i2),b2=normal.get(i2,1),c2=normal.get(i2,2);
  const finite=Number.isFinite(x0)&&Number.isFinite(y0)&&Number.isFinite(z0)&&Number.isFinite(x1)&&Number.isFinite(y1)&&Number.isFinite(z1)&&Number.isFinite(x2)&&Number.isFinite(y2)&&Number.isFinite(z2)&&Number.isFinite(a0)&&Number.isFinite(b0)&&Number.isFinite(c0)&&Number.isFinite(a1)&&Number.isFinite(b1)&&Number.isFinite(c1)&&Number.isFinite(a2)&&Number.isFinite(b2)&&Number.isFinite(c2);
  const zero=cx===0&&cy===0&&cz===0,fu=f(ux),fv=f(uy),fw=f(uz),fx=f(vx),fy=f(vy),fz=f(vz),collapse=f(f(fv*fz)-f(fw*fy))===0&&f(f(fw*fx)-f(fu*fz))===0&&f(f(fu*fy)-f(fv*fx))===0;
  const flags={nonfinite:!finite,nonunitNormals:Math.abs(Math.hypot(a0,b0,c0)-1)>1e-4||Math.abs(Math.hypot(a1,b1,c1)-1)>1e-4||Math.abs(Math.hypot(a2,b2,c2)-1)>1e-4,zeroArea:zero,float32CrossCollapse:collapse,localNormalWindingConflict:cx*a0+cy*b0+cz*c0<0||cx*a1+cy*b1+cz*c1<0||cx*a2+cy*b2+cz*c2<0};
  if(!zero&&finite)positive++;for(const[k,hit]of Object.entries(flags))if(hit){counts[k]++;if(findings.length<64)findings.push({renderTriangleId:t,sourceTriangleId:explicit?.[t]??t,sourceFaceId:face?face.get(i0):null,finding:k});}
 }
 return {counts,findings,positive};
}
export function inspectGlb(bytes,{id=null,witnesses=[],physicalPartKeys=null,expectedParts=[]}={}){
 const asset=readGlb(bytes),rows=ownedPrimitives(asset,{physicalPartKeys}),tested=new Set(),geometryCache=new Map(),findings=[],counts={nonfinite:0,nonunitNormals:0,zeroArea:0,float32CrossCollapse:0,localNormalWindingConflict:0,mirrorConventionConflict:0,singularOrNonfiniteTransform:0},ownership=[],sourceHits=[],byPart=new Map();let triangles=0;
 for(const row of rows){const{p}=row;if((p.mode??4)!==4)continue;const pos=asset.accessor(p.attributes.POSITION),normal=p.attributes.NORMAL===undefined?null:asset.accessor(p.attributes.NORMAL),indices=p.indices===undefined?null:asset.accessor(p.indices),count=indices?.count??pos.count;
  const signature=`${row.mesh}/${row.primitive}`;if(count%3)throw Error('Nontriangle source index');
  const explicit=p.extras?.original_display_triangle_ids??p.extras?.original_triangle_ids;
  if(explicit&&explicit.length!==count/3)throw Error('Source triangle ID count differs from actual primitive');
  const faceName=Object.keys(p.attributes).find(k=>/FACE.*ID/.test(k.toUpperCase())),face=faceName?asset.accessor(p.attributes[faceName]):null;
  if(!normal)throw Error('Actual source primitive has no exported NORMAL');const wanted=witnesses.filter(w=>w.part_key===row.part_key);
  if(!geometryCache.has(signature))geometryCache.set(signature,scanPrimitiveFast(pos,normal,indices,count,explicit,face));const cached=geometryCache.get(signature);
  const validTransform=row.worldMatrix.every(Number.isFinite)&&Number.isFinite(determinant(row.worldMatrix))&&determinant(row.worldMatrix)!==0;if(!validTransform){counts.singularOrNonfiniteTransform+=count/3;if(findings.length<64)findings.push({part_key:row.part_key,node:row.node,finding:'singularOrNonfiniteTransform'});}
  const part=byPart.get(row.part_key)||{part_key:row.part_key,physical_root_node:row.physical_root_node,all_owned_primitives:0,encoding_child_primitives:0,triangles:0,positive_triangles:0,exact_zero_area_triangles:0};part.all_owned_primitives++;part.encoding_child_primitives+=Number(row.node!==row.physical_root_node);part.triangles+=count/3;part.positive_triangles+=cached.positive;part.exact_zero_area_triangles+=cached.counts.zeroArea;
  if(!tested.has(signature)){for(const[k,v]of Object.entries(cached.counts))counts[k]+=v;counts.mirrorConventionConflict+=cached.counts.localNormalWindingConflict;for(const f of cached.findings)if(findings.length<64)findings.push({part_key:row.part_key,node:row.node,mesh:row.mesh,primitive:row.primitive,...f});}
  for(let t=0;wanted.length&&t<count/3;t++){
   const ids=[0,1,2].map(j=>indices?indices.get(3*t+j):3*t+j),q=ids.map(i=>pos.vector(i)),n=ids.map(i=>normal.vector(i)),sourceId=explicit?.[t]??t;
   for(const w of wanted)if((!explicit||explicit[t]===w.source_triangle_id)&&JSON.stringify(q)===JSON.stringify(w.positions))sourceHits.push({...w,part_key:row.part_key,source_triangle_id:explicit?.[t]??w.source_triangle_id,source_native_face_id:face?face.get(ids[0]):undefined,actual_primitive:row.primitive,actual_render_triangle:t,positions:q,source_attribution:explicit?'explicit-original-triangle-ID-and-exact-positions':'exact-pinned-source-positions'});
  }
  byPart.set(row.part_key,part);if(!tested.has(signature)){triangles+=count/3;tested.add(signature);}ownership.push({part_key:row.part_key,physical_root_node:row.physical_root_node,node:row.node,mesh:row.mesh,primitive:row.primitive,triangles:count/3,sourceTriangleIds:p.extras?.original_display_triangle_ids??null,technicalChild:gIsChild(asset.document.nodes[row.node])});
 }
 const source=verifySourceOwnership(sourceHits,witnesses),partFailures=[];for(const e of expectedParts){const actual=byPart.get(e.part_key);if(!actual||actual.positive_triangles!==e.positive_triangles)partFailures.push({part_key:e.part_key,expected_positive_triangles:e.positive_triangles,actual_positive_triangles:actual?.positive_triangles??null});}
 const partSource={passed:!partFailures.length,expected:expectedParts.length,failures:partFailures};return {id,model_sha256:sha256(bytes),passed:!Object.values(counts).some(Boolean)&&source.passed&&partSource.passed,triangles,counts,findings,all_owned_primitives:ownership,all_physical_part_counts:[...byPart.values()],positive_part_count_guard:partSource,source_ownership:source,native_fit_verified:false,browser_GPU_verified:false};
}
function gIsChild(n){return !!n.extras?.technical_rigid_encoding_child;}
async function main(){
 const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];let packets;
 if(args.includes('--catalog'))packets=JSON.parse(fs.readFileSync(value('--catalog'),'utf8')).assemblies;
 else if(args.includes('--model'))packets=[{id:'explicit-model',model:{path:value('--model'),sha256:args.includes('--sha256')?value('--sha256'):null}}];
 else throw Error('Use --catalog or --model; reports belong outside the source checkout');
 const witnesses=args.includes('--witnesses')?JSON.parse(fs.readFileSync(value('--witnesses'),'utf8')).witnesses:[],baseline=args.includes('--ownership-baseline')?JSON.parse(fs.readFileSync(value('--ownership-baseline'),'utf8')).models:[];const models=[];
 for(const p of packets){const bytes=fs.readFileSync(p.model.path);if(p.model.sha256&&sha256(bytes)!==p.model.sha256)throw Error('Actual source hash mismatch');const expectedParts=baseline.find(b=>b.id===p.id)?.parts??[];if(baseline.length&&!expectedParts.length)throw Error('Missing source ownership baseline for registered model: '+p.id);const result=inspectGlb(bytes,{id:p.id,physicalPartKeys:p.parts?.map(r=>r.key)??null,expectedParts,witnesses:witnesses.filter(w=>!w.registration||w.registration===p.id)});models.push(result);console.log(JSON.stringify({id:p.id,model_sha256:result.model_sha256,passed:result.passed,counts:result.counts,positive_part_count_guard:result.positive_part_count_guard,source_ownership:result.source_ownership}));}
 const report={passed:models.every(m=>m.passed),models,actual_exported_models:true,source_input_hashes_preserved:true,native_workers:0,browser_GPU_review:false};if(args.includes('--report'))fs.writeFileSync(value('--report'),JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
