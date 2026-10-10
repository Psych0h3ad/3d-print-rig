import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {prepareLedSurface,restoreLedSurface}=await import('../site/viewer/led-emission-surface.mjs');
const geometry=new THREE.BoxGeometry(.005,.005,.001),material=new THREE.MeshStandardMaterial({color:0xc4c0aa,metalness:.17,roughness:.45}),mesh=new THREE.Mesh(geometry,material);
const sourcePosition=geometry.attributes.position.array.slice(),sourceIndex=geometry.index.array.slice();
const surface=prepareLedSurface(mesh,{normal:[0,0,1]});
assert.equal(surface.luminous_triangles,2);assert.equal(surface.body_triangles,10);
assert.equal(prepareLedSurface(mesh,{normal:[0,0,1]}),surface);
assert.equal(mesh.material.color.getHex(),material.color.getHex());assert.equal(mesh.material.metalness,.17);
const mask=mesh.geometry.attributes.ledEmissionMask,n=mesh.geometry.attributes.normal;
for(let i=0;i<mask.count;i++){assert.equal(mask.getX(i),n.getZ(i)>.99?1:0);assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6)}
const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};mesh.material.onBeforeCompile(shader,{});
assert(shader.vertexShader.includes('vLedEmissionMask = ledEmissionMask'));assert(shader.fragmentShader.includes('totalEmissiveRadiance *= vLedEmissionMask'));
assert(mesh.material.customProgramCacheKey().includes('native-led-lens-v1'));
restoreLedSurface(mesh);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.deepEqual(geometry.index.array,sourceIndex);assert.deepEqual(geometry.attributes.position.array,sourcePosition);
assert.throws(()=>prepareLedSurface(mesh,{normal:[0,0,0]}),/unit vector/);
// Recessed optical discs must not fall back to the maximum package plane.
const rim=new THREE.BoxGeometry(.005,.005,.001).toNonIndexed(),disc=new THREE.CircleGeometry(.0019,32).toNonIndexed();disc.translate(0,0,.0003);
const recessedGeometry=new THREE.BufferGeometry(),positions=new Float32Array(rim.attributes.position.array.length+disc.attributes.position.array.length);positions.set(rim.attributes.position.array);positions.set(disc.attributes.position.array,rim.attributes.position.array.length);recessedGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
const recessed=new THREE.Mesh(recessedGeometry,material),native=prepareLedSurface(recessed,{normal:[0,0,1],aperture:{center:[0,0,.0003],radius_mm:1.9}});
assert.equal(native.luminous_triangles,32);for(let i=0;i<rim.attributes.position.count;i++)assert.equal(recessed.geometry.attributes.ledEmissionMask.getX(i),0,'Raised package rim must remain dark');
restoreLedSurface(recessed);assert.equal(recessed.geometry,recessedGeometry);
console.log('Native LED masks: front emits; side/back/contact triangles stay dark; CAD bounds, hardware color, unit normals and reset retained.');
