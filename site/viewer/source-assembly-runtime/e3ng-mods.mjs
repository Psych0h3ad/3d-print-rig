import * as THREE from 'three';
import {e3ngModAsset,e3ngPanelAsset,e3ngModParts,e3ngModModel} from './e3ng-mod-data.mjs?v=6c0d243d5a84b25d0ea1';

export const defaultE3NGMods=()=>({schema:'e3ng-mods-v1',base:'stock',cable:'stock',panels:'stock'});
export function validateE3NGMods(input){
 const value=input===undefined?defaultE3NGMods():input;
 const keys=value&&Object.keys(value).sort().join(),legacy=keys==='base,cable,schema';
 if(!value||Array.isArray(value)||(!legacy&&keys!=='base,cable,panels,schema')||value.schema!=='e3ng-mods-v1'||!['stock','reinforced'].includes(value.base)||!['stock','cable-hole'].includes(value.cable)||(!legacy&&!['stock','hex'].includes(value.panels)))throw Error('Invalid E3NG modification selection');
 return {...value,panels:legacy?'stock':value.panels};
}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const finiteMatrix=a=>a?.length===16&&Array.from(a).every(Number.isFinite);
const sameMatrix=(a,b)=>finiteMatrix(a)&&finiteMatrix(b)&&a.every((x,i)=>Math.abs(x-b[i])<=1e-10);

// Each replacement has its own public source identity. The original source
// packet stays immutable; common mounts, fasteners and motion remain its owners.
export function attachE3NGMods(assembly,gltf,{mode='full'}={}){
 if(assembly.packet.model.sha256!==e3ngModModel)throw Error('E3NG modification model binding changed');
 const headOnly=mode==='head';
 if(!['full','head'].includes(mode)||(headOnly?(assembly.packet.head_only_subset!==true||assembly.packet.scope!=='source-head-subset'):(assembly.packet.head_only_subset===true||assembly.packet.scope==='source-head-subset')))throw Error('Invalid E3NG modification view scope');
 if(headOnly&&e3ngModParts.some(spec=>spec.scope==='full'&&assembly.parts.has(spec.host)))throw Error('Invalid E3NG modification head scope contains full-only hosts');
 const entries=[];
 for(const spec of e3ngModParts){
  if(spec.scope!==undefined&&spec.scope!=='full')throw Error('Unknown E3NG modification part scope');
  if(headOnly&&spec.scope==='full')continue;
  const host=assembly.parts.get(spec.host),rest=assembly.rest.get(spec.host);
  if(!host||host.record.source_id!==spec.host_source_sha256||!rest||!sameMatrix(rest.world.elements,spec.host_world))throw Error('E3NG modification host changed');
  const matches=[];gltf.scene.traverse(n=>{if(n.isMesh&&n.userData.e3ng_mod===spec.id)matches.push(n);});
  if(matches.length!==1)throw Error('Missing or duplicated E3NG modification: '+spec.id);
  const mesh=matches[0],source=assembly.materials.find(r=>r.key===spec.host);
  if(!source?.color||mesh.userData.source_sha256!==spec.source_sha256||mesh.geometry.index.count!==spec.triangles*3||!mesh.geometry.attributes.normal)throw Error('Changed E3NG modification geometry');
  // GLTFLoader has already populated the authored local matrix. Inspect it
  // before changing matrixAutoUpdate or placement; NaN must never compare equal.
  const geometryTransform=spec.geometry_transform??(spec.scope==='full'?null:identity),local=mesh.matrix.clone();
  if(!sameMatrix(local.elements,geometryTransform))throw Error('Changed E3NG modification geometry transform: '+spec.id);
  if(spec.control==='panels'&&source.role!=='M')throw Error('E3NG panel must inherit its printed host palette');
  entries.push({spec,mesh,host,source,geometryTransform:local});
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
  // Snapshot every shared host before hiding any of them. Several replacement
  // leaves can belong to the same stock host (or to a host ancestor).
  const visibility=new Map();
  for(const {host}of entries){
   let visible=true;for(let n=host.node;n;n=n.parent)if(!n.visible)visible=false;
   visibility.set(host,visible);
  }
  for(const {spec,mesh,host,geometryTransform}of entries){
   mesh.matrix.multiplyMatrices(assembly.root.matrixWorld.clone().invert(),host.node.matrixWorld);
   mesh.matrix.multiply(geometryTransform);
   if(!finiteMatrix(mesh.matrix.elements))throw Error('Nonfinite E3NG modification placement');
   mesh.visible=visibility.get(host)&&value[spec.control]===spec.choice;
   mesh.updateMatrixWorld(true);
  }
  for(const {mesh,host}of entries)if(mesh.visible)host.node.visible=false;
  selected={...value};return snapshot();
 }
 function snapshot(){return {...assembly.snapshot(),e3ng_mods:{...selected}};}
 function transact(operation,value){
  const previous=assembly.snapshot(),previousMods={...selected},colors=assembly.materials.map(r=>[r.material,r.material.color?.clone()]);
  try{operation();return update(value);}
  catch(error){
   // Late native-mate checks can reject after restoring original visibility.
   // Restore the last accepted state and exact displayed colors as one unit.
   try{assembly.apply(previous);update(previousMods);for(const[material,color]of colors)if(color)material.color.copy(color);}
   catch(restoreError){assembly.root.visible=false;throw new AggregateError([error,restoreError],'Could not restore E3NG configuration');}
   throw error;
  }
 }
 function apply(state){
  const value=validateE3NGMods(state?.e3ng_mods),{e3ng_mods:omitted,...normal}=state;
  return transact(()=>assembly.apply(normal),value);
 }
 function reset(){return transact(()=>assembly.reset(),defaultE3NGMods());}
 const wrapped=Object.create(assembly);Object.assign(wrapped,{snapshot,apply,reset,e3ngMods:{asset:e3ngModAsset,panelAsset:headOnly?null:e3ngPanelAsset,entries,mode,fullAssembly:mode==='full',availability:Object.freeze({base:true,cable:true,panels:!headOnly})}});
 update(selected);return wrapped;
}
