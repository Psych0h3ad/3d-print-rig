import * as THREE from 'three';
// The boxes identify the native pair; they do not represent its intersection solid.
export function createHeadMarkers(scene,{rig,fixture,setPose,render}){
 const group=new THREE.Group();group.name='Native_Intersection_Part_Bounds';scene.add(group);
 function clear(){for(const m of group.children){m.geometry.dispose();m.material.dispose()}group.clear()}
 function inspect(xyz,hit){
  clear();if(setPose(xyz)===false){render();return false}
  const head=rig.cache.get(hit?.head_module)?.loaded?.entries.find(e=>String(e.key)===String(hit.head_part))?.mesh;
  for(const node of [head,hit&&fixture(hit.fixture_part)])if(node){const m=new THREE.BoxHelper(node,'#e98425');m.userData.intersection_part_bounds=true;group.add(m)}
  render();return true;
 }
 return {clear,inspect,update:()=>{for(const m of group.children)m.update()},group};
}
