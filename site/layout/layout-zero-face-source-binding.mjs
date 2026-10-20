import {layoutZeroFaceAdmissions} from './layout-zero-face-admissions.mjs?v=a095fefcd4cff89fc560';
import {layoutZeroFaceSources} from './layout-zero-face-sources.mjs?v=1d2b0ef497fb56d634e6';
import {cloneAdmittedLayoutZeroFaces} from './layout-zero-face-cleanup.mjs?v=e907ed0d63e2d996b702';

const fail=message=>{throw new Error('Layout source binding rejected: '+message);};
export const hasLayoutZeroFaceAdmission=machineId=>layoutZeroFaceSources.some(row=>row.machineId===machineId);
function keyOf(mesh){for(let node=mesh;node;node=node.parent)if(node.userData?.part_key!==undefined)return String(node.userData.part_key);return null;}

/** Bind only the receipt emitted after checkedExtraAsset has verified the bytes. */
export function admitVerifiedLayoutSource(machineId,receipt){
 const source=layoutZeroFaceSources.find(row=>row.machineId===machineId);
 if(!source)fail('machine has no source admission');
 const spec=receipt?.modelSpec;
 if(receipt?.verifiedBy!=='checkedExtraAsset-v1'||!spec)fail('verified decoded source receipt required');
 if(receipt.machineId!==machineId||receipt.sourceURL!==source.sourceURL)fail('machine/source URL mismatch');
 if(spec.encoding!=='gzip'||spec.sha256!==source.compressedSha256||spec.bytes!==source.compressedBytes)fail('compressed source identity');
 if(spec.decoded_sha256!==source.decodedSha256||spec.decoded_bytes!==source.decodedBytes||receipt.decodedBytes!==source.decodedBytes)fail('decoded source identity');
 const url=new URL(receipt.sourceURL);
 if(url.protocol!=='https:'||url.searchParams.get('sha')!==source.compressedSha256.slice(0,16)||!url.pathname.endsWith('/'+spec.path))fail('source transport path');
 return Object.freeze({scope:'layout',machineId,sourceModelSha256:source.decodedSha256,sourceURL:source.sourceURL,decodedBytes:source.decodedBytes});
}

/**
 * Await before adapter registration, palette/pose changes or root normalization.
 * All admitted clones are checked before any geometry is assigned.
 * disposeDetachedSources releases displaced, no-longer-referenced geometries.
 * The ordinary root disposer remains responsible for installed clone geometries.
 */
export async function applyParsedLayoutZeroFaces(gltf,{scope,machineId,verifiedSource,signal}={}){
 if(scope!=='layout')fail('layout scope required');
 signal?.throwIfAborted();
 const context=admitVerifiedLayoutSource(machineId,verifiedSource),rows=layoutZeroFaceAdmissions.filter(row=>row.machineId===machineId);
 if(!gltf?.scene||!gltf.parser?.json||typeof gltf.parser.associations?.get!=='function')fail('original parsed source required');
 if(gltf.scene.parent)fail('source must precede root normalization');
 const byKey=new Map(rows.map(row=>[row.sourceKey,row])),targets=[];
 gltf.scene.traverse(mesh=>{if(mesh.isMesh&&byKey.has(keyOf(mesh)))targets.push(mesh);});
 const seen=new Set();
 for(const mesh of targets){const key=keyOf(mesh);if(seen.has(key))fail('duplicate admitted source part');seen.add(key);}
 if(seen.size!==rows.length)fail('missing admitted source part');
 const staged=[];
 try{
  for(const mesh of targets){
   signal?.throwIfAborted();
   const result=await cloneAdmittedLayoutZeroFaces(mesh,{...context,parser:gltf.parser});
   if(result.status!=='CLONED_EXACT_SOURCE_ZERO_FACES')fail('admitted source did not clone');
   staged.push({mesh,source:mesh.geometry,geometry:result.geometry,proof:result.proof});
   signal?.throwIfAborted();
  }
 }catch(error){for(const item of staged)item.geometry.dispose();throw error;}
 for(const item of staged)item.mesh.geometry=item.geometry;
 const stillUsed=new Set();gltf.scene.traverse(mesh=>{if(mesh.isMesh)stillUsed.add(mesh.geometry);});
 const detached=new Set(staged.map(item=>item.source).filter(source=>!stillUsed.has(source)));
 let disposed=false;
 return {
  summary:{sourceURL:context.sourceURL,sourceModelSha256:context.sourceModelSha256,decodedBytes:context.decodedBytes,meshes:staged.map(item=>item.proof),removedTriangles:staged.reduce((n,item)=>n+item.proof.removedTriangles.length,0),removedVertices:staged.reduce((n,item)=>n+item.proof.removedVertices.length,0),normalValuesInvented:0},
  disposeDetachedSources(){if(disposed)return;disposed=true;for(const geometry of detached)geometry.dispose();detached.clear();}
 };
}
