import * as THREE from 'three';

// Select native draw triangles at the outward lens face. The package, contacts
// and PCB do not emit. Unshared vertices keep the mask constant across a face;
// flat CAD normals avoid interpolating a sharp edge through the back surface.
export function prepareLedSurface(mesh,{normal,depth_mm=.04,aperture=null}={}){
 if(mesh.userData.ledSurface)return mesh.userData.ledSurface;
 if(!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||!Number.isFinite(depth_mm)||depth_mm<0)throw Error('Invalid source LED face');
 const n=new THREE.Vector3(...normal);if(n.length()<.99||n.length()>1.01)throw Error('LED face normal must be a unit vector');n.normalize();
 const center=aperture&&new THREE.Vector3(...aperture.center),radius=aperture?.radius_mm*.001;
 if(aperture&&(!Array.isArray(aperture.center)||aperture.center.length!==3||!aperture.center.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0))throw Error('Invalid native LED aperture');
 const originalGeometry=mesh.geometry,originalMaterial=mesh.material;
 const geometry=originalGeometry.index?originalGeometry.toNonIndexed():originalGeometry.clone();
 const p=geometry.attributes.position;if(!p||p.count%3)throw Error('Invalid LED triangles');
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
 let front=-Infinity;for(let i=0;i<p.count;i++){a.fromBufferAttribute(p,i);if(![a.x,a.y,a.z].every(Number.isFinite))throw Error('Non-finite LED surface');front=Math.max(front,a.dot(n));}
 const mask=new Float32Array(p.count);let luminous=0;
 for(let i=0;i<p.count;i+=3){
  a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
  u.subVectors(b,a);v.subVectors(c,a);u.cross(v);
  if(u.lengthSq()===0)continue;
  const facing=u.normalize().dot(n);
  const lens=aperture?[a,b,c].every(p=>{const d=v.subVectors(p,center),plane=d.dot(n);return Math.abs(plane)<=depth_mm*.001+1e-7&&d.lengthSq()-plane*plane<=(radius+3e-6)**2;}):front-Math.min(a.dot(n),b.dot(n),c.dot(n))<=depth_mm*.001+1e-7;
  if(facing>.92&&lens){mask.fill(1,i,i+3);luminous++;}
 }
 if(!luminous||luminous===p.count/3){geometry.dispose();throw Error('Source LED lens face missing');}
 geometry.computeVertexNormals();geometry.setAttribute('ledEmissionMask',new THREE.BufferAttribute(mask,1));
 const materials=[].concat(originalMaterial).map(original=>{
  const material=original.clone(),compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
   compile.call(this,shader,renderer);
   shader.vertexShader='attribute float ledEmissionMask;\nvarying float vLedEmissionMask;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLedEmissionMask = ledEmissionMask;');
   shader.fragmentShader='varying float vLedEmissionMask;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLedEmissionMask;');
  };
  material.customProgramCacheKey=()=>key+'|native-led-lens-v1';material.needsUpdate=true;return material;
 });
 mesh.geometry=geometry;mesh.material=Array.isArray(originalMaterial)?materials:materials[0];
 const surface={normal:n.toArray(),depth_mm,aperture,luminous_triangles:luminous,body_triangles:p.count/3-luminous,originalGeometry,originalMaterial,materials};
 mesh.userData.ledSurface=surface;return surface;
}

export function restoreLedSurface(mesh){
 const surface=mesh.userData.ledSurface;if(!surface)return;
 mesh.geometry.dispose();for(const material of surface.materials)material.dispose();
 mesh.geometry=surface.originalGeometry;mesh.material=surface.originalMaterial;delete mesh.userData.ledSurface;
}

// Parked-head clones start from CAD surfaces, without runtime lights/masks.
// Restore the live renderer state synchronously even if cloning fails.
export function cloneNativeLedTree(root){
 const held=[];
 root.traverse(mesh=>{const surface=mesh.userData?.ledSurface,guide=mesh.userData?.ledGuide;if(!surface&&!guide)return;const lights=mesh.children.filter(o=>o.isLight&&o.name.startsWith('Native_toolhead_LED_'));held.push({mesh,surface,guide,geometry:mesh.geometry,material:mesh.material,lights});if(surface)mesh.geometry=surface.originalGeometry;mesh.material=(surface||guide).originalMaterial;delete mesh.userData.ledSurface;delete mesh.userData.ledGuide;for(const light of lights)mesh.remove(light);});
 try{return root.clone(true);}finally{for(const e of held){e.mesh.geometry=e.geometry;e.mesh.material=e.material;if(e.surface)e.mesh.userData.ledSurface=e.surface;if(e.guide)e.mesh.userData.ledGuide=e.guide;for(const light of e.lights)e.mesh.add(light);}}
}
