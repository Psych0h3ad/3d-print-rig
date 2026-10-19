import * as THREE from 'three';
import {nativeToDisplay} from './stealthburner-cutaway-source.mjs';

// The lesson uses a tessellation of the same original CAD nozzle. Coordinates
// are supplied in the published native frame, before the lesson's recentering.
export function sourceNozzleGeometry(data,mesh,contract) {
  const fail=message=>{throw Error('Original nozzle source: '+message);};
  if(data.schema!=='stealthburner-original-nozzle-surface-v1')fail('schema');
  for(const key of ['source_step_sha256','source_brep_sha256','source_revision','license']){
    if(data[key]!==contract[key])fail(key);
  }
  const faces=data.source_face_ids;
  if(!Array.isArray(faces)||faces.length!==22||new Set(faces).size!==22)fail('finite face identities');
  if(JSON.stringify([...faces].sort((a,b)=>a-b))!==JSON.stringify([...contract.source_face_ids].sort((a,b)=>a-b)))fail('source face registration');
  const positions=data.positions_native_mm,normals=data.normals_native,indices=data.indices,ids=data.triangle_source_face_ids;
  if(!Array.isArray(positions)||positions.length===0||positions.length%3||!positions.every(Number.isFinite))fail('positions');
  if(!Array.isArray(normals)||normals.length!==positions.length||!normals.every(Number.isFinite))fail('normals');
  if(!Array.isArray(indices)||!indices.length||indices.length%3||!indices.every(i=>Number.isInteger(i)&&i>=0&&i<positions.length/3))fail('indices');
  if(!Array.isArray(ids)||ids.length!==indices.length/3||ids.some(id=>!faces.includes(id)))fail('triangle source identities');
  if(faces.some(id=>!ids.includes(id)))fail('missing finite source surface');
  mesh.updateWorldMatrix(true,false);
  const inverse=mesh.matrixWorld.clone().invert(),toLocalNormal=new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).transpose();
  const localPositions=new Float32Array(positions.length),localNormals=new Float32Array(normals.length);
  const point=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<positions.length;i+=3){
    point.fromArray(nativeToDisplay(positions.slice(i,i+3))).applyMatrix4(inverse).toArray(localPositions,i);
    const n=normals.slice(i,i+3);
    if(Math.abs(Math.hypot(...n)-1)>1e-6)fail('non-unit source normal');
    normal.set(n[0],n[2],-n[1]).applyMatrix3(toLocalNormal).normalize().toArray(localNormals,i);
  }
  if(!localPositions.every(Number.isFinite)||!localNormals.every(Number.isFinite))fail('local frame');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(localPositions,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(localNormals,3));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.original_source_face_ids=[...faces];
  geometry.userData.triangle_source_face_ids=[...ids];
  geometry.userData.source_brep_sha256=data.source_brep_sha256;
  return geometry;
}
