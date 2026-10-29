import {BIQU_POPSTATION_CAD,BIQU_POPSTATION_MODEL,BIQU_POPSTATION_PREVIEW} from './layout-biqu-popstation.mjs?v=0a8899673b99fcdc2eb5';

// The supplied CAD contains two open surface sheets coincident with areas of
// the housing. Resolve their raster depth tie without changing any geometry,
// matrices, visibility or source identities. This is not a clearance exemption.
export const BIQU_SURFACE_DISPLAY=Object.freeze({
  id:'biqu-source-surface-depth-v1',modelSHA256:BIQU_POPSTATION_MODEL.sha256,
  sourceInstances:Object.freeze([53,54]),factor:1,units:1
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
export function configureBiquPreviewGroups(geometry,part){
  if(part.geometryId!==BIQU_POPSTATION_PREVIEW.geometryId)return false;
  if(!Array.isArray(part.sourceLeaves)||part.sourceLeaves.length!==70||geometry.index?.count!==246144)
    throw fail('Unreviewed preview occurrence ranges');
  for(const s of sheets){const leaf=part.sourceLeaves[s.index];
    if(leaf?.sourceInstanceIndex!==s.index||leaf.sourceDefinitionLabel!==s.definition
      ||leaf.sourceInstanceLabel!==s.instance||leaf.indexOffset!==s.start||leaf.indexCount!==s.count)
      throw fail('Source sheet range changed');
  }
  geometry.clearGroups();geometry.addGroup(0,145452,0);
  geometry.addGroup(145452,7104,1);geometry.addGroup(152556,93588,0);
  return true;
}
export function applyBiquSurfaceDisplay(root,row){
  if(row.id!==BIQU_POPSTATION_CAD.id)return null;
  if(row.model?.sha256!==BIQU_POPSTATION_MODEL.sha256)throw fail('Unreviewed full model');
  const nodes=[];root.traverse(node=>{if(node.isMesh)nodes.push(node);});
  if(nodes.length!==70||new Set(nodes.map(n=>n.userData.source_instance_index)).size!==70
    ||nodes.some(n=>!Number.isSafeInteger(n.userData.source_instance_index)||n.userData.source_instance_index<0||n.userData.source_instance_index>=70||!n.visible))throw fail('Missing source occurrences');
  const selected=sheets.map(s=>{
    const found=nodes.filter(n=>n.userData.source_instance_index===s.index);
    if(found.length!==1||found[0].userData.source_definition_label!==s.definition
      ||found[0].userData.source_instance_label!==s.instance||Array.isArray(found[0].material))
      throw fail('Source sheet identity changed');
    return found[0];
  });
  if(nodes.filter(n=>n.userData.source_instance_index===69&&n.userData.source_definition_label==='0:1:1:38').length!==1)
    throw fail('Source housing identity changed');
  const clones=new Map();
  try{for(const node of selected)if(!clones.has(node.material))clones.set(node.material,createBiquLayerMaterial(node.material));}
  catch(error){for(const material of clones.values())material.dispose();throw error;}
  for(const node of selected)node.material=clones.get(node.material);
  root.userData.biquSurfaceDisplay=BIQU_SURFACE_DISPLAY;
  return BIQU_SURFACE_DISPLAY;
}
