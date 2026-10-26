// Exact source fasteners for the authored front-skirt mounting interfaces.
import * as THREE from 'three';
import {e3ngInstallationModel} from './e3ng-installation-corrections.mjs?v=137c54c767286c877a48';
import {e3ngSkirtFasteners} from './e3ng-skirt-fastener-data.mjs?v=283bc6447e387be1f517';
export function addE3NGSkirtFasteners(view){
 const instances=e3ngSkirtFasteners;
 if(view.packet.model?.sha256!==e3ngInstallationModel||view.packet.head_only_subset)return [];
 if(instances.length!==8)throw Error('Missing front-skirt source fasteners');
 const {root,parts,rest,all}=view,added=[];
 for(const spec of instances){const source=parts.get(spec.source_key);if(parts.has(spec.key)||!parts.has(spec.parent_key)||!source||source.record.source_id!==spec.source_id||source.record.kind!=='purchased'||source.record.matrix.some((v,i)=>Math.abs(v-spec.expected_source_world_m[i])>1e-10)||spec.world_m.length!==16||!spec.world_m.every(Number.isFinite))throw Error('Missing or changed front-skirt source instance');}
 root.updateMatrixWorld(true);
 for(const spec of instances){
  if(parts.has(spec.key))throw Error('Duplicate source fastener instance');
  const source=parts.get(spec.source_key);
  if(!source||source.record.source_id!==spec.source_id||source.record.kind!=='purchased'||source.record.matrix.some((v,i)=>Math.abs(v-spec.expected_source_world_m[i])>1e-10))throw Error('Changed original source fastener');
  const node=source.node.clone(true),world=new THREE.Matrix4().fromArray(spec.world_m);
  if(world.elements.length!==16||!world.elements.every(Number.isFinite))throw Error('Invalid installed source fastener pose');
  node.name=spec.key;
  node.traverse(child=>{
   if(child!==node&&child.userData?.part_key&&child.userData.part_key!==spec.source_key)throw Error('Fastener source contains another physical owner');
   child.userData={...child.userData,part_key:spec.key,source_instance_of:spec.source_key};
  });
  node.userData.source_id=spec.source_id;
  root.add(node);node.matrix.multiplyMatrices(root.matrixWorld.clone().invert(),world);node.matrixAutoUpdate=false;node.updateWorldMatrix(false,true);
  const record={...structuredClone(source.record),key:spec.key,node_name:spec.key,matrix:world.toArray(),kind:'purchased',material_role:'native',printed_palette_applies:false,motion_axes:[],source_preview_motion_axes:[],source_preview_rigid_host:'fixed-frame',source_identity:source.record.source_identity+' / additional front-skirt instance',actual_export:{runtime_instance:spec.key,source_owner_key:spec.source_key}};
  parts.set(spec.key,{node,record});rest.set(spec.key,{matrix:node.matrix.clone(),world:world.clone(),visible:true});node.traverse(child=>all.push(child));added.push({key:spec.key,parent_key:spec.parent_key,source_key:spec.source_key,source_id:spec.source_id,world_m:world.toArray()});
 }
 return added;
}
