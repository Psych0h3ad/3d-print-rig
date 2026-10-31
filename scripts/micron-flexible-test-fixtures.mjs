import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial} from '../site/viewer/vendor/three.module.js';

// Explicit RC8 identity/motion fixtures. Triangles below are lifecycle fixtures,
// never replacement printer hardware or native fit evidence.
export function addMicronTubeFixtureBindings(nodes,records){
 const groups={reference_flexible:['m180_00411','m180_01768'],
  xyz_head:['m180_01415','m180_01416','m180_01765','m180_01766','m180_01421'],
  fixed:['m180_00340','m180_00344'],z_gantry:['m180_01767']};
 for(const [motion,keys]of Object.entries(groups))for(const key of keys){
  let node=nodes.get(key);
  if(!node){node=new Group();nodes.set(key,node);}
  if(!node.children.length){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setIndex([0,1,2]);node.add(new Mesh(g,new MeshStandardMaterial()));}
  node.userData.part_key=key;
  records.set(key,{...records.get(key),key,motion,motion_axes:motion==='xyz_head'?['X','Y','Z']:motion==='z_gantry'?['Z']:[],
   source:{repository:'PrintersForAnts/Micron',commit:'f76aa28767211ddfee2e30290aadcea3c45f8513',cache_machine:'micron_plus_r1_180',source_key:key.slice(5),
    source_step:'sources/micron/CAD/180_R1_Assembly_RC8/180_R1_Assembly.step',transplanted_head:false,translation_to_world_mm:[0,0,135]}});
 }
 return {nodes,records};
}
