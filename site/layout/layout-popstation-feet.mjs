// PopStation Mini exterior foot-pad reference. The manufacturer supplies the
// cabinet CAD separately; these photo-based layout parts are not native CAD.
export const POPSTATION_STANDARD_FEET=Object.freeze({
 id:'biqu-popstation-standard-rubber-feet-reference-v1',count:4,
 bodyLiftM:.0106,referenceHeightM:.0125002393966562,
 centersXZ:Object.freeze([[-.18,-.188],[-.18,.188],[.18,-.188],[.18,.188]].map(Object.freeze)),
 profileMm:Object.freeze([[3.2,0],[7.7,0],[8.5,.6],[9.1,1.6],[11.4,8.1],[11.8,8.9],[11.8,10],[10.5,12.5002393966562],[3.2,12.5002393966562],[3.2,0]].map(Object.freeze)),
 sources:Object.freeze([
  'https://neo.bttwiki.com/en/docs/more-series/pop-module/popstation-mini/',
  'https://neo.bttwiki.com/en/assets/images/popstation-mini-installation-07-da538c85c6f15ec4b898c26881c74a40.webp',
  'https://neo.bttwiki.com/en/assets/images/popstation-mini-dimension-drawing-d16b9a937fd8163486d9e122287ffa63.webp'
 ]),
 scope:'Original exterior reference from official assembly/product images. Four feet and nominal 428 mm overall height are manufacturer-described. Pad profile, bore and placement remain reference estimates, not supplied CAD or certified mounting hardware.',
 manufacturerCAD:false,physicalMountingVerified:false
});
export function createPopStationFootGeometry(THREE){
 const geometry=new THREE.LatheGeometry(POPSTATION_STANDARD_FEET.profileMm.map(([r,y])=>new THREE.Vector2(r/1000,y/1000)),32);
 geometry.normalizeNormals();
 geometry.computeBoundingBox();geometry.userData.layoutReferencePart=POPSTATION_STANDARD_FEET.id;
 return geometry;
}
export function addPopStationFootPads(THREE,parent,{geometry,material}={}){
 if(!geometry||!material)throw Error('PopStation pad resources required');
 const meshes=POPSTATION_STANDARD_FEET.centersXZ.map(([x,z],i)=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.name='PopStation Mini rubber pad reference '+(i+1);
  mesh.position.set(x,0,z);mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData.layoutReferencePart=POPSTATION_STANDARD_FEET.id;mesh.userData.manufacturerCAD=false;
  parent.add(mesh);return mesh;
 });return meshes;
}
export function assemblePopStationStandardFeet(THREE,body,row){
 if(row?.equipmentVariant!=='standard-feet')return null;
 const root=new THREE.Group(),carrier=new THREE.Group();root.name='BIQU PopStation Mini with standard pad references';
 carrier.name='Unmodified BIQU source cabinet';carrier.position.y=POPSTATION_STANDARD_FEET.bodyLiftM;carrier.add(body);root.add(carrier);
 let geometry,material;
 try{
  geometry=createPopStationFootGeometry(THREE);material=new THREE.MeshStandardMaterial({color:'#15191d',roughness:.92,metalness:0});
  addPopStationFootPads(THREE,root,{geometry,material});
 }catch(error){geometry?.dispose();material?.dispose();body.removeFromParent();throw error;}
 root.userData.layoutReferenceParts={id:POPSTATION_STANDARD_FEET.id,count:4,sourceCabinetLeaves:70,physicalMountingVerified:false};
 return root;
}
