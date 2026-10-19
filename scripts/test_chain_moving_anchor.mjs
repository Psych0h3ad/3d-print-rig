import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Vector3} from '../site/viewer/vendor-r180/three.module.js';
import {createRegisteredChains} from '../site/viewer/native-motion-flex.mjs';
import {displayMotion} from '../site/viewer/community-state.mjs';

// Exercise the shared solver with an existing source-backed hinge registration.
// This verifies both moving anchors; it is not Switchwire mounting evidence.
const source=JSON.parse(fs.readFileSync(new URL('../site/viewer/motion-profiles/tictac_21_120.json',import.meta.url)));
const chain=structuredClone(source.chains[0]);
Object.assign(chain,{fixed_group:'beam',moving_group:'head'});
const profile={machine_id:'moving_anchor_regression',basis:source.basis||[[1,0,0],[0,0,1],[0,-1,0]],origin_mm:source.origin_mm||[0,0,0],axes:{x:[-10,10],y:[0,1],z:[-25,25]},motions:{fixed:[0,0,0],beam:[0,0,'z'],head:['x',0,'z']},motion_registration:{chains:[chain]}};
const nodes=new Map(chain.links.flatMap(link=>link.keys.map(key=>[key,{matrix:new Matrix4()}])));
const initial=new Map([...nodes].map(([key,node])=>[key,node.matrix.clone()]));
const controller=createRegisteredChains(nodes,initial,profile);
assert.throws(()=>createRegisteredChains(nodes,initial,{...profile,motion_registration:{chains:[{...chain,fixed_group:'missing'}]}}),/Unknown chain anchor/);
const point=uv=>new Vector3(...displayMotion([0,1,2].map(a=>chain.plane_axes.includes(a)?uv[chain.plane_axes.indexOf(a)]-profile.origin_mm[a]:0),profile));
const near=(a,b)=>assert(a.distanceTo(b)<1e-8,`Chain pivot error: ${a.distanceTo(b)}`);
for(const z of [25,-25,0]){
 controller.update({x:0,y:0,z});
 const shift=new Vector3(...displayMotion([0,0,z],profile));
 for(const link of chain.links)for(const key of link.keys)near(point(link.from_mm).applyMatrix4(nodes.get(key).matrix),point(link.from_mm).add(shift));
}
for(const x of [10,-10,5,-5,10,0])for(const z of [-25,25,0]){
 controller.update({x,y:0,z});
 const first=chain.links[0],last=chain.links.at(-1);
 near(point(first.from_mm).applyMatrix4(nodes.get(first.keys[0]).matrix),point(chain.start_mm).add(new Vector3(...displayMotion([0,0,z],profile))));
 near(point(last.to_mm).applyMatrix4(nodes.get(last.keys[0]).matrix),point(chain.end_mm).add(new Vector3(...displayMotion([x,0,z],profile))));
 assert(controller.getReports().every(r=>r.endpoint_error_mm<1e-5));
 for(const node of nodes.values()){assert(node.matrix.elements.every(Number.isFinite));assert(Math.abs(node.matrix.determinant()-1)<1e-10);}
}
controller.update({x:0,y:0,z:0});
for(const[key,node]of nodes)assert.deepEqual(node.matrix.elements,initial.get(key).elements);
console.log('Source-backed chain solver: moving beam/head anchors, reversed poses, rigid links and exact reset passed.');
