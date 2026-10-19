// Dispose each owned resource once, including superseded actual assemblies.
export function releaseRoot(root,adapter){
 const geometries=new Set(),materials=new Set(),instances=new Set();root?.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of [].concat(n.material))materials.add(m);}if(n.isInstancedMesh)instances.add(n);});
 const adapterMaterials=new Set(adapter?.materials.map(r=>r.material)??[]),adapterGeometries=adapter?.ownedGeometries??new Set(adapter?.routes.map(r=>r.mesh.geometry)??[]);
 adapter?.dispose();for(const g of geometries)if(!adapterGeometries.has(g))g.dispose();for(const m of materials)if(!adapterMaterials.has(m))m.dispose();for(const n of instances)if(!adapter?.ownedInstances?.has(n))n.dispose();
}
