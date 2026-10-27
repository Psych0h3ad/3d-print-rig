import * as THREE from 'three';
import {e3ngModAsset,e3ngModParts,e3ngModModel} from './e3ng-mod-data.mjs?v=69469889a5a32641c077';

export const defaultE3NGMods=()=>({schema:'e3ng-mods-v1',base:'stock',cable:'stock'});
export function validateE3NGMods(input){
 const value=input===undefined?defaultE3NGMods():input;
 if(!value||Array.isArray(value)||Object.keys(value).sort().join()!=='base,cable,schema'||value.schema!=='e3ng-mods-v1'||!['stock','reinforced'].includes(value.base)||!['stock','cable-hole'].includes(value.cable))throw Error('Invalid E3NG modification selection');
 return {...value};
}

// Each replacement has its own public source identity. The original source
// packet stays immutable; common mounts, fasteners and motion remain its owners.
export function attachE3NGMods(assembly,gltf){
 if(assembly.packet.model.sha256!==e3ngModModel)throw Error('E3NG modification model binding changed');
 const entries=[];
 for(const spec of e3ngModParts){
  const host=assembly.parts.get(spec.host),rest=assembly.rest.get(spec.host);
  if(!host||host.record.source_id!==spec.host_source_sha256||!rest||rest.world.elements.some((x,i)=>Math.abs(x-spec.host_world[i])>1e-10))throw Error('E3NG modification host changed');
  const matches=[];gltf.scene.traverse(n=>{if(n.isMesh&&n.userData.e3ng_mod===spec.id)matches.push(n);});
  if(matches.length!==1)throw Error('Missing or duplicated E3NG modification: '+spec.id);
  const mesh=matches[0],source=assembly.materials.find(r=>r.key===spec.host);
  if(!source?.color||mesh.userData.source_sha256!==spec.source_sha256||mesh.geometry.index.count!==spec.triangles*3||!mesh.geometry.attributes.normal)throw Error('Changed E3NG modification geometry');
  entries.push({spec,mesh,host,source});
 }
 for(const {spec,mesh,source}of entries){
  const old=mesh.material;mesh.material=source.material.clone();old.dispose();
  mesh.material.color.copy(source.color);mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;
  mesh.userData.part_key=spec.host;
  assembly.materials.push({...source,material:mesh.material,color:source.color.clone(),key:'e3ng-mod-'+spec.id});
  assembly.ownedGeometries.add(mesh.geometry);assembly.root.add(mesh);
 }
 let selected=defaultE3NGMods();
 function update(value){
  assembly.root.updateMatrixWorld(true);
  for(const {spec,mesh,host}of entries){
   // Inner apply restores source visibility before each replacement decision.
   let visible=true;for(let n=host.node;n;n=n.parent)if(!n.visible)visible=false;
   mesh.matrix.multiplyMatrices(assembly.root.matrixWorld.clone().invert(),host.node.matrixWorld);
   mesh.visible=visible&&value[spec.control]===spec.choice;
   if(mesh.visible)host.node.visible=false;
   mesh.updateMatrixWorld(true);
  }
  selected={...value};return snapshot();
 }
 function snapshot(){return {...assembly.snapshot(),e3ng_mods:{...selected}};}
 function apply(state){
  const value=validateE3NGMods(state?.e3ng_mods),{e3ng_mods:omitted,...normal}=state;
  const previous=assembly.snapshot(),previousMods={...selected},colors=assembly.materials.map(r=>[r.material,r.material.color?.clone()]);
  try{assembly.apply(normal);return update(value);}
  catch(error){
   // Late native-mate checks can reject after restoring original visibility.
   // Restore the last accepted state and exact displayed colors as one unit.
   try{assembly.apply(previous);update(previousMods);for(const[material,color]of colors)if(color)material.color.copy(color);}
   catch(restoreError){assembly.root.visible=false;throw new AggregateError([error,restoreError],'Could not restore E3NG configuration');}
   throw error;
  }
 }
 function reset(){assembly.reset();return update(defaultE3NGMods());}
 const wrapped=Object.create(assembly);Object.assign(wrapped,{snapshot,apply,reset,e3ngMods:{asset:e3ngModAsset,entries}});
 update(selected);return wrapped;
}
