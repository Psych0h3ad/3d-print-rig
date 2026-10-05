import * as THREE from 'three';
const world=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
export function customTubeCurve(spec,dx=0,dy=0){
 const points=spec.controls_mm.map((p,i)=>world([p[0]+(i<2?dx:0),p[1]+(i<2?dy:0),p[2]]));
 const path=new THREE.CurvePath();
 path.add(new THREE.CubicBezierCurve3(...points.slice(0,4)));
 path.add(new THREE.LineCurve3(points[3],points[4]));
 path.add(new THREE.CubicBezierCurve3(...points.slice(4)));
 return path;
}
export function createCustomTube(root,manifest){
 const spec=manifest.custom_ptfe;if(!spec)return null;
 let mesh;root.traverse(n=>{if(n.isMesh&&n.userData?.part_key===spec.part_key)mesh=n});
 if(!mesh)throw Error('Missing custom PTFE source');
 const native=mesh.geometry;let preview=null;
 return {update(dx=0,dy=0,visible=true){
  mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.visible=visible;mesh.frustumCulled=false;
  if(Math.abs(dx)+Math.abs(dy)<1e-8){mesh.geometry=native;preview?.dispose();preview=null;return}
  preview?.dispose();preview=new THREE.TubeGeometry(customTubeCurve(spec,dx,dy),144,spec.radius_mm/1000,12,false);
  preview.computeBoundingBox();preview.computeBoundingSphere();mesh.geometry=preview;
 },dispose(){mesh.geometry=native;preview?.dispose();preview=null}};
}
