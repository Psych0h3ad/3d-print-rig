import * as THREE from './vendor-r180/three.module.js';
import {machineChoices} from './machines.js?v=5503ac507978b3d4e928';
import {layoutMachineRecipes} from './layout-machine-recipes.mjs?v=f5726d36341700aa2eae';
import {createLayoutMachineLoader} from './layout-machine-loader-core.mjs?v=4b1f6a033f5d522d06ba';
import {loadLayoutRecipe} from './layout-machine-providers.mjs?v=c5f4eedad33c36c2173b';

// Measure the active default scene, excluding hidden reference/alternate roots.
// These are rendered geometry bounds, never a native-solid clearance proof.
export function visibleLayoutBounds(root) {
 root.updateMatrixWorld(true);const box=new THREE.Box3(),part=new THREE.Box3();
 root.traverseVisible(n=>{
  if(!n.isMesh)return;
  if(n.isInstancedMesh){n.computeBoundingBox();part.copy(n.boundingBox)}
  else {if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();part.copy(n.geometry.boundingBox)}
  if(part.isEmpty())throw Error('Empty active layout geometry');
  part.applyMatrix4(n.matrixWorld);
  if(![...part.min.toArray(),...part.max.toArray()].every(Number.isFinite))throw Error('Nonfinite active layout geometry');
  box.union(part);
 });
 if(box.isEmpty())throw Error('No visible default printer geometry');return box;
}
export function normalizeLayoutRoot(sourceRoot) {
 if(sourceRoot.parent)throw Error('Layout source must be a fresh unparented assembly');
 const root=new THREE.Group(),offsetRoot=new THREE.Group();root.name='layout_normalized_default';offsetRoot.name='layout_source_origin';root.add(offsetRoot);offsetRoot.add(sourceRoot);
 const before=visibleLayoutBounds(root),center=before.getCenter(new THREE.Vector3()),size=before.getSize(new THREE.Vector3());
 // Existing viewer front presets view from +Z; preserve each family's authored
 // up/front conversion. Do not re-orient or individually move native parts.
 const offset=[-center.x,-before.min.y,-center.z];offsetRoot.position.set(...offset);root.updateMatrixWorld(true);
 const after=visibleLayoutBounds(root);
 return {root,dimensions:{width:size.x,height:size.y,depth:size.z,xyz:size.toArray(),unit:'m',basis:'visible-world-geometry-bounds',min:after.min.toArray(),max:after.max.toArray()},normalization:{unit:'m',up:'+Y',front:'+Z',translation:offset,source_bounds:{min:before.min.toArray(),max:before.max.toArray()},individual_source_matrices_unchanged:true}};
}
export const loadLayoutMachine=createLayoutMachineLoader({recipes:layoutMachineRecipes,expectedMachineIds:machineChoices.filter(row=>row.available!==false).map(row=>row.id),loadRecipe:loadLayoutRecipe,normalize:normalizeLayoutRoot});
export {layoutMachineRecipes};
