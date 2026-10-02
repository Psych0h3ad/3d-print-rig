import * as THREE from 'three';
export function partNodes(root,parts){const keys=new Set(parts.map(p=>p.key)),nodes=new Map();root.traverse(node=>{const key=node.userData?.part_key;if(keys.has(key)&&node.parent?.userData?.part_key!==key){if(nodes.has(key))throw Error('部品キーが重複しています');nodes.set(key,node)}});if(nodes.size!==keys.size)throw Error('部品と形状の対応が不足しています');return nodes}
export function selectPart(nodes,key){selectParts(nodes,[key]);return key}
export function selectParts(nodes,keys){
 const selected=new Set(keys);
 if(!selected.size||keys.some(key=>!nodes.has(key)))throw Error('未登録の部品です');
 // Validate the complete plan before touching the previous visible selection.
 for(const [id,node] of nodes)node.visible=selected.has(id);
 return keys
}
export function visibleBounds(root){root.updateMatrixWorld(true);const result=new THREE.Box3();root.traverse(mesh=>{if(!mesh.isMesh)return;for(let n=mesh;n;n=n.parent)if(!n.visible)return;mesh.geometry.computeBoundingBox();result.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))});return result}
