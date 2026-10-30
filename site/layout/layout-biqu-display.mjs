import {BIQU_POPSTATION_CAD,BIQU_POPSTATION_MODEL,BIQU_POPSTATION_PREVIEW} from './layout-biqu-popstation.mjs?v=979382e048e443397362';
import {BIQU_FINISH_SOURCE,biquFinishLeaf,createBiquFinishMaterial} from './layout-biqu-appearance.mjs?v=4235983a3b0c67dca3c2';

// The supplied CAD contains two open surface sheets coincident with areas of
// the housing. Resolve their raster depth tie without changing any geometry,
// matrices, visibility or source identities. This is not a clearance exemption.
export const BIQU_SURFACE_DISPLAY=Object.freeze({
  id:'biqu-source-surface-depth-v1',modelSHA256:BIQU_POPSTATION_MODEL.sha256,
  sourceInstances:Object.freeze([53,54]),factor:1,units:1,appearance:BIQU_FINISH_SOURCE.id
});
const fail=message=>Object.assign(new Error(message),{code:'LAYOUT_BIQU_SURFACE_DISPLAY'});
const sheets=Object.freeze([
  Object.freeze({index:53,definition:'0:1:1:30',instance:'0:1:1:1:14',start:145452,count:3552}),
  Object.freeze({index:54,definition:'0:1:1:31',instance:'0:1:1:1:15',start:149004,count:3552})
]);
export function createBiquLayerMaterial(material){
  if(!material?.isMaterial||typeof material.clone!=='function')throw fail('Missing source material');
  const copy=material.clone();copy.polygonOffset=true;
  copy.polygonOffsetFactor=BIQU_SURFACE_DISPLAY.factor;copy.polygonOffsetUnits=BIQU_SURFACE_DISPLAY.units;
  return copy;
}
export function createBiquPreviewMaterials(material){
  const out=[];
  try{
    for(const role of ['coated','metal','window','coated'])out.push(createBiquFinishMaterial(material,role,{vertexColors:true}));
    out[3].polygonOffset=true;out[3].polygonOffsetFactor=BIQU_SURFACE_DISPLAY.factor;out[3].polygonOffsetUnits=BIQU_SURFACE_DISPLAY.units;
    return out;
  }catch(error){for(const m of out)m.dispose();throw error;}
}
export function configureBiquPreviewGroups(geometry,part,THREE){
  if(part.geometryId!==BIQU_POPSTATION_PREVIEW.geometryId)return false;
  if(!Array.isArray(part.sourceLeaves)||part.sourceLeaves.length!==70||geometry.index?.count!==246144)
    throw fail('Unreviewed preview occurrence ranges');
  for(const s of sheets){const leaf=part.sourceLeaves[s.index];
    if(leaf?.sourceInstanceIndex!==s.index||leaf.sourceDefinitionLabel!==s.definition
      ||leaf.sourceInstanceLabel!==s.instance||leaf.indexOffset!==s.start||leaf.indexCount!==s.count)
      throw fail('Source sheet range changed');
  }
  if(!THREE?.BufferAttribute||!THREE?.Color||geometry.attributes.position?.count!==79824||part.indices?.length!==246144)
    throw fail('Missing source preview geometry');
  const bins=[[],[],[],[]],colors=new Uint8Array(79824*3);let vertexOffset=0,indexOffset=0;
  for(const [i,leaf]of part.sourceLeaves.entries()){
    const finish=biquFinishLeaf(leaf.sourceInstanceIndex,leaf.sourceDefinitionLabel,leaf.sourceInstanceLabel);
    if(leaf.sourceInstanceIndex!==i||leaf.vertexOffset!==vertexOffset||leaf.indexOffset!==indexOffset
      ||!Number.isSafeInteger(leaf.vertexCount)||leaf.vertexCount<1||leaf.vertexCount>79824-vertexOffset
      ||!Number.isSafeInteger(leaf.indexCount)||leaf.indexCount<3||leaf.indexCount%3||leaf.indexCount>246144-indexOffset)
      throw fail('Noncontiguous source occurrence');
    const rgb=new THREE.Color(finish.style.color).toArray().map(v=>Math.round(v*255));
    for(let i=leaf.vertexOffset;i<leaf.vertexOffset+leaf.vertexCount;i++)colors.set(rgb,i*3);
    for(let j=leaf.indexOffset;j<leaf.indexOffset+leaf.indexCount;j++){
      const value=part.indices[j];if(!Number.isSafeInteger(value)||value<vertexOffset||value>=vertexOffset+leaf.vertexCount)throw fail('Cross-leaf source triangle');
      bins[finish.materialIndex].push(value);
    }
    vertexOffset+=leaf.vertexCount;indexOffset+=leaf.indexCount;
  }
  if(vertexOffset!==79824||indexOffset!==246144)throw fail('Incomplete source occurrence colors');
  // Reorder complete authored triangles by finish class once per shared mesh.
  // No vertices, normals, winding or triangles change; only four draw groups
  // are needed for every cabinet instance, including the transparent PC pane.
  const index=new Uint32Array(246144);let offset=0;geometry.clearGroups();
  for(const [materialIndex,bin]of bins.entries()){index.set(bin,offset);geometry.addGroup(offset,bin.length,materialIndex);offset+=bin.length;}
  geometry.setIndex(new THREE.BufferAttribute(index,1));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3,true));
  geometry.userData.biquAppearance={id:BIQU_FINISH_SOURCE.id,sourceIndexOrder:'whole-triangle material partition',sourceOccurrences:70,drawGroups:4};
  return true;
}
export function applyBiquSurfaceDisplay(root,row){
  if(row.id!==BIQU_POPSTATION_CAD.id)return null;
  if(row.model?.sha256!==BIQU_POPSTATION_MODEL.sha256)throw fail('Unreviewed full model');
  const nodes=[];root.traverse(node=>{if(node.isMesh)nodes.push(node);});
  if(nodes.length!==70||new Set(nodes.map(n=>n.userData.source_instance_index)).size!==70
    ||nodes.some(n=>!Number.isSafeInteger(n.userData.source_instance_index)||n.userData.source_instance_index<0||n.userData.source_instance_index>=70||!n.visible))throw fail('Missing source occurrences');
  // Validate every source identity before changing any shared material.
  const finishes=nodes.map(n=>biquFinishLeaf(n.userData.source_instance_index,n.userData.source_definition_label,n.userData.source_instance_label));
  const selected=sheets.map(s=>{
    const found=nodes.filter(n=>n.userData.source_instance_index===s.index);
    if(found.length!==1||found[0].userData.source_definition_label!==s.definition
      ||found[0].userData.source_instance_label!==s.instance||Array.isArray(found[0].material))
      throw fail('Source sheet identity changed');
    return found[0];
  });
  if(nodes.filter(n=>n.userData.source_instance_index===69&&n.userData.source_definition_label==='0:1:1:38').length!==1)
    throw fail('Source housing identity changed');
  const clones=new Map(),assigned=[],originals=new Set(nodes.map(n=>n.material));
  try{for(const [i,node]of nodes.entries()){
    if(Array.isArray(node.material))throw fail('Unexpected source material array');
    let byRole=clones.get(node.material);if(!byRole)clones.set(node.material,byRole=new Map());
    const role=finishes[i].role,key=selected.includes(node)?role+':layer':role;
    if(!byRole.has(key)){
      const material=role==='unassigned'?node.material:createBiquFinishMaterial(node.material,role);
      if(selected.includes(node)){material.polygonOffset=true;material.polygonOffsetFactor=BIQU_SURFACE_DISPLAY.factor;material.polygonOffsetUnits=BIQU_SURFACE_DISPLAY.units;}
      byRole.set(key,material);
    }
    assigned.push(byRole.get(key));
  }}catch(error){for(const byRole of clones.values())for(const material of byRole.values())if(!originals.has(material))material.dispose();throw error;}
  for(const [i,node]of nodes.entries())node.material=assigned[i];
  root.userData.biquSurfaceDisplay=BIQU_SURFACE_DISPLAY;
  return BIQU_SURFACE_DISPLAY;
}
