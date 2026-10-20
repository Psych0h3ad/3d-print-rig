// Isolate materials before a layout-only palette pass. Geometry, textures and
// source transforms are shared unchanged; purchased/unclassified leaf colors
// cannot be recolored through a printed leaf's shared GLB material.
export function isolateLayoutPaletteMaterials(root){
 const original=new Set(),clones=new Set();let meshes=0,slots=0;
 root.traverse(n=>{
  if(!n.isMesh)return;meshes++;
  const copy=m=>{original.add(m);const c=m.clone();clones.add(c);slots++;return c};
  n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);
 });
 // These original materials have never been drawn in the fresh layout root.
 // Do not dispose textures: clones retain their original source texture refs.
 for(const material of original)material.dispose();
 return {scope:'Layout-only custom Trident default palette ownership',meshes,slots,originalUniqueMaterials:original.size,ownedClonedMaterials:clones.size,geometryOrTransformsChanged:false,sourceTexturesUnchanged:true};
}
