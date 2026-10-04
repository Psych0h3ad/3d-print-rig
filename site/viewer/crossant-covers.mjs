import * as THREE from './vendor-r180/three.module.js';

// Profiles retain drawing dimensions; only the outward extrusion may change.
export function createCrossantCovers(root,manifest){
 if(manifest.schema!=='crossant-dxf-covers-v1'||manifest.machine_id!=='crossant_235_v06_leadscrew'||manifest.parts.length!==3)throw Error('Crossantの構成情報が一致しません。');
 const entries=[];
 for(const p of manifest.parts){
  const node=root.getObjectByName(p.key);if(!node)throw Error('Crossantの構成情報が一致しません。');
  node.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.material=new THREE.MeshStandardMaterial({color:p.transparent?0xaec4d0:0x24272c,roughness:p.transparent?.22:.55,metalness:0,transparent:p.transparent,opacity:p.transparent?.16:1,depthWrite:!p.transparent,side:THREE.DoubleSide});
   mesh.frustumCulled=false;
   entries.push({spec:p,mesh,source:new Float32Array(mesh.geometry.attributes.position.array)});
  });
 }
 function setThickness(mm){
  if(![2,3,4].includes(mm))throw Error('Crossantの構成情報が一致しません。');
  for(const {spec,mesh,source}of entries){
   const n=spec.outward_normal,axis=n[0]?0:2,sign=n[0]||-n[1],plane=sign*spec.inner_plane_mm/1000,a=mesh.geometry.attributes.position;
   for(let i=0;i<a.count;i++)a.array[3*i+axis]=plane+(source[3*i+axis]-plane)*mm/spec.reference_thickness_mm;
   a.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  }
 }
 function setVisible(visible){root.visible=Boolean(visible)}
 return {root,manifest,entries,setThickness,setVisible};
}
