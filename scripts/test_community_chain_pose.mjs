import assert from 'node:assert/strict';
import {Group,Matrix4} from '../site/viewer/vendor-r180/three.module.js';
import {createRegisteredChains} from '../site/viewer/native-motion-flex.mjs';
import {bindCommunityChainFeatures,assertCommunityChainFeatures} from './community_chain_pose.mjs';
for(const [uv,normal] of [[[0,2],1],[[1,2],0],[[0,1],2]])for(const sign of [-1,1]){
 const links=Array.from({length:12},(_,i)=>({keys:['link_'+i],from_mm:[0,i*17*sign],to_mm:[0,(i+1)*17*sign]}));
 const spec={plane_axes:uv,normal_axis:normal,links,pitch_mm:17,start_mm:[0,0],end_mm:[60,80*sign],fixed_group:'fixed',moving_group:'moving'};
 const motions={fixed:[0,0,0],moving:[0,0,0]};motions.fixed[normal]='y';motions.moving[normal]='y';motions.moving[uv[0]]='x';motions.moving[uv[1]]='z';
 const profile={machine_id:'source_chain_fixture',basis:[[1,0,0],[0,0,1],[0,-1,0]],origin_mm:[3,-2,1],axes:{x:[-10,10],y:[-10,10],z:[-10,10]},motions,motion_registration:{chains:[spec]}};
 const nodes=new Map(links.map((l,i)=>{const n=new Group();n.matrixAutoUpdate=false;n.matrix.makeTranslation(i*.013,i*.007,i*.011);return[l.keys[0],n]}));
 const initial=new Map([...nodes].map(([k,n])=>[k,n.matrix.clone()])),binding=bindCommunityChainFeatures(nodes,initial,profile),controller=createRegisteredChains(nodes,initial,profile);
 const apply=axes=>{controller.update(axes);for(const n of nodes.values())n.updateMatrixWorld(true);assertCommunityChainFeatures(binding,nodes,axes,profile)};
 for(const axes of [{x:0,y:0,z:0},{x:5,y:3,z:-4},{x:-5,y:-3,z:4},{x:2,y:-1,z:1},{x:0,y:0,z:0}])apply(axes);
 const pose={x:5,y:3,z:-4};apply(pose);const node=nodes.values().next().value,saved=node.matrixWorld.clone();
 for(const damage of [m=>m.elements[12]+=.001,m=>m.multiply(new Matrix4().makeScale(1,1.01,1)),m=>m.multiply(new Matrix4().makeRotationZ(.01)),m=>m.multiply(new Matrix4().makeScale(-1,1,1)),m=>m.elements[0]=NaN]){
  node.matrixWorld.copy(saved);damage(node.matrixWorld);assert.throws(()=>assertCommunityChainFeatures(binding,nodes,pose,profile));
 }
 node.matrixWorld.copy(saved);
 const missing=new Map(nodes);missing.delete(links[0].keys[0]);assert.throws(()=>bindCommunityChainFeatures(missing,initial,profile),/Missing source-bound/);
 const duplicate=structuredClone(profile);duplicate.motion_registration.chains[0].links[1].keys=links[0].keys;assert.throws(()=>bindCommunityChainFeatures(nodes,initial,duplicate),/Duplicate/);
 const wrong=structuredClone(profile);wrong.motion_registration.chains[0].links[1].keys=['unbound'];assert.throws(()=>bindCommunityChainFeatures(nodes,initial,wrong),/Missing source-bound/);
 const misbound=structuredClone(profile);[misbound.motion_registration.chains[0].links[0].keys,misbound.motion_registration.chains[0].links[11].keys]=[links[11].keys,links[0].keys];
 const wrongBinding=bindCommunityChainFeatures(nodes,initial,misbound);assert.throws(()=>assertCommunityChainFeatures(wrongBinding,nodes,pose,profile));
}
console.log('Three source hinge planes, both directions, reversed movement/reset and54 displaced/stretched/rotated/reflected/nonfinite/missing/duplicate/misbound chain controls passed.');
