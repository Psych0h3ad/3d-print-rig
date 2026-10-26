import {validateActualCurrentSourceMates34} from './source_current_collision34.mjs?v=eb7f77c9b47abcc8b543';
import * as THREE from 'three';
import {initialState,validateState,validateReviewTransition,visibleKeys,worldDelta,reviewWorldDelta} from './state.mjs?v=b5247a9c87c6a42703d7';
import {createVirtuCompleteFlex,createVirtuCompleteFlex190,createSourceBelts191} from './motion_features.mjs?v=0611345fe57584a0be70';
import {createSourceDriveController,createSourceCompanions} from './source_drive304.mjs?v=579ad6e6384362d2d3fb';
import {createHeadLoom306} from './source_loom306.mjs?v=99eb6785ca70b024911b';
export const materialRole=record=>{if(record.kind!=='printed')return 'native';if(!['M','A'].includes(record.material_role))throw Error('Unclassified printed source material: '+record.source_identity);return record.material_role;};
export function createAssembly(gltf,p){
 const root=gltf.scene,parts=new Map(),rest=new Map(),materials=[],routes=[],supersededGeometries=new Set(),supersededMaterials=new Set();
 const all=[];root.traverse(n=>all.push(n));root.updateMatrixWorld(true);
 for(const r of p.parts){let matching=all.filter(n=>n.userData?.part_key===r.key);if(!matching.length)matching=all.filter(n=>n.userData?.part_key===undefined&&n.name===THREE.PropertyBinding.sanitizeNodeName(r.node_name));if(matching.length!==1)throw Error('Missing/duplicate actual GLB occurrence: '+r.key);const n=matching[0];
  if(n.userData?.source_identity&&n.userData.source_identity!==r.source_identity)throw Error('Wrong source identity: '+r.key);
  const err=Math.max(...n.matrixWorld.elements.map((v,i)=>Math.abs(v-r.matrix[i])));if(err>1e-7)throw Error('Source matrix mismatch: '+r.key);
  parts.set(r.key,{node:n,record:r});rest.set(r.key,{matrix:n.matrix.clone(),world:n.matrixWorld.clone(),visible:n.visible});n.matrixAutoUpdate=false;
 }
 const nodeOwners=new Map([...parts].map(([key,r])=>[r.node,key]));
 const ownerOf=n=>{for(let q=n;q;q=q.parent)if(nodeOwners.has(q))return nodeOwners.get(q);return null;};
 for(const n of all)if(n.isMesh&&!ownerOf(n))throw Error('Unregistered source mesh');
 for(const [key,{node:n,record:r}]of parts){
  n.traverse(mesh=>{if(!mesh.isMesh||ownerOf(mesh)!==key)return;for(const m of [].concat(mesh.material))supersededMaterials.add(m);mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();mesh.frustumCulled=false;
   for(const material of [].concat(mesh.material))materials.push({material,color:material.color?.clone(),metalness:material.metalness,roughness:material.roughness,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,role:materialRole(r),key:r.key});if([].concat(mesh.material).some(m=>m.transparent))for(const m of [].concat(mesh.material))if(m.transparent)m.depthWrite=false;
  });
 }
 for(const r of p.routes||[]){const owner=parts.get(r.part_key);if(!owner)throw Error('Missing route geometry');const meshes=[];owner.node.traverse(m=>{if(m.isMesh&&ownerOf(m)===r.part_key)meshes.push(m)});if(meshes.length!==1)throw Error('Route must bind one exact source mesh');const mesh=meshes[0];
  if(r.deformation?.kind==='source-weights'){if(owner.record.motion_axes.length)throw Error('Route cannot receive rigid and weighted displacement twice');mesh.geometry=mesh.geometry.clone();const weights={};for(const [a,name]of Object.entries(r.deformation.attributes)){const attr=mesh.geometry.getAttribute(name)||mesh.geometry.getAttribute(name.toLowerCase());if(!attr||attr.itemSize!==1||attr.count!==mesh.geometry.attributes.position.count)throw Error('Missing source motion weights');for(const v of attr.array)if(!Number.isFinite(v)||v<0||v>1)throw Error('Invalid source motion weight');weights[a]=attr.array;}routes.push({mesh,source:mesh.geometry.attributes.position.array.slice(),sourceNormals:mesh.geometry.attributes.normal.array.slice(),weights,record:r});}
 }
 const beforeFlex=new Map();root.traverse(n=>{if(n.isMesh)beforeFlex.set(n,n.geometry)});
 const logicalKeys=new Set(p.parts.map(r=>r.key));const flex=p.source_GT2_189?createVirtuCompleteFlex190(root,p.source_flex181.runtime_profile,v=>v.map(x=>x*.001),v=>v.map(x=>x*.001),p.source_GT2_189.runtime_spec,gltf.prioritySourceCurve189,logicalKeys):p.source_flex181?createVirtuCompleteFlex(root,p.source_flex181.runtime_profile,v=>v.map(x=>x*.001),v=>v.map(x=>x*.001),logicalKeys):null;
 const sourceBelts=p.belts191B?createSourceBelts191(root,p):null;
 const ownedGeometries=new Set(routes.map(r=>r.mesh.geometry));root.traverse(n=>{if(n.isMesh&&beforeFlex.get(n)!==n.geometry){supersededGeometries.add(beforeFlex.get(n));ownedGeometries.add(n.geometry)}});
 const ownedInstances=new Set();if(p.source_GT2_189){for(const e of flex.belts.entries){ownedGeometries.add(e.resetGeometry);for(const child of e.sourceChildren)child.traverse(n=>{if(n.isMesh)ownedGeometries.add(n.geometry);if(n.isInstancedMesh)ownedInstances.add(n);});}}
 let flexState=null,state=initialState(p);
 const view={packet:p,parts,root},sourceDrive=p.source_drive304?.rotation?createSourceDriveController(view,p.source_drive304.rotation):null,sourceCompanions=p.source_drive304?.companions?createSourceCompanions(view,p.source_drive304.companions,ownedGeometries):null;
 const sourceHeadLoom=p.source_loom306?createHeadLoom306(view,p.source_loom306.route,ownedGeometries):null;
 function apply(s){if(p.source_probe_state303)s={...s,probe_state:s.probe_state??'attached'};validateState(s,p);validateReviewTransition(p,state,s);const visible=visibleKeys(p,s);
  const variantOverrides=p.variants.find(v=>v.id===s.variant).matrix_overrides||{},probeOverrides=s.probe_state==='parked'?p.source_probe_state303.parked_world_by_key:{},overrides={...variantOverrides,...probeOverrides};
  const desired=new Map();for(const [key,{record}]of parts){const r=rest.get(key),world=overrides[key]?new THREE.Matrix4().fromArray(overrides[key]):r.world.clone(),delta=worldDelta(s.axes,record.motion_axes,p);const reviewDelta=reviewWorldDelta(p,key,s.review_axes,s.probe_state);for(let i=0;i<3;i++)world.elements[12+i]+=delta[i]+reviewDelta[i];desired.set(key,world);}
  // Resolve absolute source-world targets in parent-before-child order, applying motion once.
  const nativePose=Object.values(s.axes).every(v=>v===0)&&Object.values(s.review_axes||{}).every(v=>v===0);for(const node of all){const key=nodeOwners.get(node);if(key){if(nativePose&&!overrides[key])node.matrix.copy(rest.get(key).matrix);else{const world=desired.get(key),inverse=node.parent?.matrixWorld.clone().invert()||new THREE.Matrix4();node.matrix.multiplyMatrices(inverse,world);}node.visible=rest.get(key).visible&&visible.has(key);}node.updateWorldMatrix(false,false);}
  for(const r of routes){const position=r.mesh.geometry.attributes.position;position.array.set(r.source);const inverse=r.mesh.matrixWorld.clone().invert(),origin=new THREE.Vector3().setFromMatrixPosition(r.mesh.matrixWorld),localOrigin=origin.clone().applyMatrix4(inverse);for(const [a,w]of Object.entries(r.weights)){const delta=new THREE.Vector3(...worldDelta(s.axes,[a],p)),local=origin.clone().add(delta).applyMatrix4(inverse).sub(localOrigin);for(let i=0;i<w.length;i++){position.array[3*i]+=local.x*w[i];position.array[3*i+1]+=local.y*w[i];position.array[3*i+2]+=local.z*w[i];}}position.needsUpdate=true;r.mesh.geometry.computeBoundingBox();r.mesh.geometry.computeBoundingSphere();if(Object.values(s.axes).some(v=>v!==0))r.mesh.geometry.computeVertexNormals();else{r.mesh.geometry.attributes.normal.array.set(r.sourceNormals);r.mesh.geometry.attributes.normal.needsUpdate=true;}}
  if(flex){for(const key of flex.controlledKeys){if(parts.get(key).record.motion_axes.length||p.private_source_motion172.target_axes_by_key[key].length)throw Error('Flex would receive a duplicate rigid transform: '+key);}flexState=flex.update(s.review_axes);}
  if(sourceDrive)sourceDrive.update(s.review_axes?.z??0);
  if(sourceBelts){sourceBelts.update(s.review_axes);root.updateMatrixWorld(true);}
  if(sourceCompanions)sourceCompanions.update(nativePose);
  if(sourceHeadLoom)sourceHeadLoom.update(nativePose);
  for(const r of materials){if(r.color)r.material.color.copy(r.color);r.material.opacity=r.opacity;r.material.transparent=r.transparent;r.material.depthWrite=r.transparent?false:r.depthWrite;if(['M','A'].includes(r.role))r.material.color.set(s.palette[r.role]);}
  root.updateMatrixWorld(true);validateActualCurrentSourceMates34(view,s);
  state=structuredClone(s);return snapshot();
 }
 function reset(){const s=initialState(p);s.language=state.language;s.theme=state.theme;apply(s);for(const r of materials)if(r.color)r.material.color.copy(r.color);return snapshot();}
 function snapshot(){return structuredClone(state);}
 function checkRoutes(){const findings=[];root.updateMatrixWorld(true);for(const r of p.routes||[]){const entry=parts.get(r.part_key),mesh=[];entry.node.traverse(n=>{if(n.isMesh&&ownerOf(n)===r.part_key)mesh.push(n)});const m=mesh[0];for(const e of r.endpoints){const mate=parts.get(e.mate_key);if(!mate){findings.push('Missing route mate');continue;}const target=new THREE.Vector3(...e.mate_point).applyMatrix4(mate.node.matrixWorld);let distance=Infinity;for(const i of e.vertex_indices){if(!Number.isInteger(i)||i<0||i>=m.geometry.attributes.position.count){findings.push('Missing endpoint vertex');continue;}const v=new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld);distance=Math.min(distance,v.distanceTo(target)*1000);}if(!Number.isFinite(distance)||distance>e.tolerance_mm)findings.push('Detached route '+r.part_key+': '+distance+' mm');}if(!m.visible||!entry.node.visible)findings.push('Hidden route '+r.part_key);for(const x of m.geometry.attributes.position.array)if(!Number.isFinite(x)){findings.push('Nonfinite route '+r.part_key);break;}}
  return findings;
 }
 function dispose(){for(const m of new Set([...materials.map(r=>r.material),...supersededMaterials]))m.dispose();for(const g of new Set([...ownedGeometries,...supersededGeometries]))g.dispose();for(const n of ownedInstances)n.dispose();}
 apply(state);return {root,packet:p,parts,rest,materials,routes,flex,sourceBelts,sourceDrive,sourceCompanions,sourceHeadLoom,get flexState(){return flexState},ownedGeometries,ownedInstances,reset,snapshot,apply,checkRoutes,dispose};
}
