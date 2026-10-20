import {layoutZeroFaceAdmissions} from './layout-zero-face-admissions.mjs?v=a095fefcd4cff89fc560';
import {planExactZeroFaceCompaction} from './layout-zero-face-plan.mjs?v=d20af53598f8f0d9ec34';

const fail=message=>{throw new Error('Layout source cleanup rejected: '+message);};
const bytes=array=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const equal=(a,b)=>canonical(a)===canonical(b);
const drawJSON=draw=>({start:draw.start,count:draw.count===Infinity?'Infinity':draw.count});
const sha=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(array))),x=>x.toString(16).padStart(2,'0')).join('');
const metadata=a=>({bytes:a.array.byteLength,arrayType:a.array.constructor.name,itemSize:a.itemSize,count:a.count,normalized:a.normalized===true});

function sourceKeyOf(mesh){
 for(let node=mesh;node;node=node.parent)if(node.userData?.part_key!==undefined)return String(node.userData.part_key);
 return null;
}
function nodeIndexOf(mesh,associations){
 for(let node=mesh;node;node=node.parent){const index=associations.get(node)?.nodes;if(index!==undefined)return index;}
 return undefined;
}
async function checkAttributes(geometry,expected){
 if(!equal(Object.keys(geometry.attributes).sort(),Object.keys(expected).filter(n=>n!=='index').sort()))fail('attribute names');
 for(const [name,record]of Object.entries(expected)){
  const a=name==='index'?geometry.index:geometry.attributes[name];
  if(!a||a.isInterleavedBufferAttribute||a.isInstancedBufferAttribute||!a.array||typeof a.clone!=='function')fail('unsupported '+name);
  const actual=metadata(a);
  for(const key of Object.keys(actual))if(actual[key]!==record[key])fail(name+' '+key);
  if(await sha(a.array)!==record.sha256)fail(name+' SHA-256');
 }
}

/**
 * Return a separate BufferGeometry for exactly admitted layout sources.
 * sourceModelSha256 must be the digest of the loaded, original decoded GLB.
 * parser is that GLB's GLTFParser, before adapter transforms or geometry edits.
 * This function never assigns mesh.geometry, changes materials, or disposes input.
 */
export async function cloneAdmittedLayoutZeroFaces(mesh,context){
 if(context?.scope!=='layout')fail('layout scope required');
 if(typeof context.machineId!=='string'||!context.machineId)fail('machine identity required');
 if(!/^[a-f0-9]{64}$/.test(context.sourceModelSha256??''))fail('original GLB SHA-256 required');
 const machineRows=layoutZeroFaceAdmissions.filter(row=>row.machineId===context.machineId);
 if(!machineRows.length)return {status:'NOT_ADMITTED',geometry:mesh?.geometry??null};
 if(!machineRows.some(row=>row.sourceModelSha256===context.sourceModelSha256))fail('original GLB SHA-256 mismatch');
 const key=sourceKeyOf(mesh),row=machineRows.find(item=>item.sourceKey===key);
 if(!row)return {status:'NOT_ADMITTED',geometry:mesh?.geometry??null};
 if(!mesh?.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh)fail('ordinary source mesh required');
 const parser=context.parser;
 if(!parser?.json||typeof parser.associations?.get!=='function')fail('original parser associations required');
 const association=parser.associations.get(mesh);
 if(association?.meshes!==row.sourceMeshIndex||(association.primitives??0)!==row.sourcePrimitiveIndex||nodeIndexOf(mesh,parser.associations)!==row.sourceNodeIndex)fail('mesh/primitive/node association');
 const json=parser.json,sourceMesh=json.meshes?.[row.sourceMeshIndex],node=json.nodes?.[row.sourceNodeIndex];
 if(sourceMesh?.name!==row.sourceMeshName||node?.mesh!==row.sourceMeshIndex||String(node?.extras?.part_key)!==row.sourceKey||node.name!==row.sourceNodeName)fail('public source mesh/node identity');
 if(!equal(sourceMesh.primitives?.[row.sourcePrimitiveIndex],row.sourcePrimitive))fail('public source primitive');
 for(const record of Object.values(row.sourceAttributes)){
  const accessor=json.accessors?.[record.accessorIndex];
  if(!equal(accessor,record.accessor)||!equal(json.bufferViews?.[accessor?.bufferView],record.bufferView))fail('public source accessor');
 }
 const geometry=mesh.geometry;
 if(!geometry?.isBufferGeometry||geometry.isInstancedBufferGeometry||Object.keys(geometry.morphAttributes??{}).length||geometry.boundsTree)fail('unsupported source geometry');
 if(!equal(geometry.groups,row.sourceGroups)||!equal(drawJSON(geometry.drawRange),row.sourceDrawRange))fail('material groups/draw range');
 await checkAttributes(geometry,row.sourceAttributes);
 const plan=planExactZeroFaceCompaction(geometry);
 if(!equal(plan.removedTriangles,row.removedTriangles)||!equal(plan.removedVertices,row.removedVertices)||!equal(plan.bounds.after,row.bounds))fail('exact source removal/bounds witness');
 if(!equal(plan.groups,row.expectedAfterGroups)||!equal(drawJSON(plan.drawRange),row.expectedAfterDrawRange))fail('result material groups/draw range');
 // Cloning preserves source attribute metadata and separates all mutable arrays.
 const clone=geometry.clone();
 try{
  clone.userData=structuredClone(geometry.userData);
  for(const [name,a]of Object.entries(plan.attributes)){
   const attribute=geometry.attributes[name].clone();attribute.array=a.array;attribute.count=a.count;clone.setAttribute(name,attribute);
  }
  const index=geometry.index.clone();index.array=plan.index;index.count=plan.index.length;clone.setIndex(index);
  clone.groups=plan.groups.map(group=>({...group}));clone.setDrawRange(plan.drawRange.start,plan.drawRange.count);
  await checkAttributes(clone,row.expectedAfterAttributes);
  // Recheck inputs after all asynchronous hashing and cloning.
  await checkAttributes(geometry,row.sourceAttributes);
  return {status:'CLONED_EXACT_SOURCE_ZERO_FACES',geometry:clone,proof:{sourceURL:row.sourceURL,sourceModelSha256:row.sourceModelSha256,sourceKey:row.sourceKey,sourceMeshIndex:row.sourceMeshIndex,sourcePrimitiveIndex:row.sourcePrimitiveIndex,sourceNodeIndex:row.sourceNodeIndex,removedTriangles:[...plan.removedTriangles],removedVertices:[...plan.removedVertices],normalValuesInvented:0,...plan.proof}};
 }catch(error){clone.dispose();throw error;}
}
