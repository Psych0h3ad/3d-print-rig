import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createCrossantCovers} from '../site/viewer/crossant-covers.mjs';
const root=new THREE.Group(),specs=[];
for(let i=0;i<3;i++){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, .003,0,0, 0,.004,0],3));
 if(i===2)geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='cover'+i;root.add(mesh);
 specs.push({key:mesh.name,transparent:i<2,outward_normal:[1,0,0],inner_plane_mm:0,reference_thickness_mm:3});
}
const original=root.children.map(n=>new Float32Array(n.geometry.attributes.position.array));
const covers=createCrossantCovers(root,{schema:'crossant-dxf-covers-v1',machine_id:'crossant_235_v06_leadscrew',parts:specs});
assert.deepEqual(root.children.map(n=>n.material.flatShading),[true,true,false]);
assert(root.children.every((n,i)=>n.material.transparent===(i<2)));
root.children.forEach((n,i)=>assert.deepEqual(n.geometry.attributes.position.array,original[i]));
for(const thickness of [2,4,3])covers.setThickness(thickness);
root.children.forEach((n,i)=>assert.deepEqual(n.geometry.attributes.position.array,original[i]));
assert.equal(root.children[0].geometry.attributes.normal,undefined,'No source geometry replacement');
console.log('Crossant covers: derivative normals for missing NORMAL, existing smooth normals retained, transparency and thickness reset unchanged.');
