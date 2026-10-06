import assert from 'node:assert/strict';
import {register} from 'node:module';register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
import {createPaletteController} from '../site/viewer/palette-controller.mjs';
const source=new THREE.MeshStandardMaterial({color:'#334455',metalness:.85,roughness:.24}),nodes=new Map(),records=new Map();
for(const [key,role]of [['print','base'],['detail','accent'],['hardware',null],['frame','frame']]){
 const n=new THREE.Group();n.add(new THREE.Mesh(new THREE.BoxGeometry(),source));nodes.set(key,n);records.set(key,{appearance_role:role});
}
const controller=createPaletteController(nodes,records);assert.equal(new Set(controller.rows.map(r=>r.material)).size,4);
for(const palette of [{base:'#11ffee',accent:'#ff7711',frame:'#dddddd'},{base:'#7422cc',accent:'#aaff33',frame:'#161616'},{}]){
 controller.setPalette(palette);
 for(const r of controller.rows){assert(r.material.color.equals(r.role&&palette[r.role]?new THREE.Color(palette[r.role]):r.original));if(['base','accent'].includes(r.role)){assert.equal(r.material.metalness,0);assert.equal(r.material.roughness,.72)}else{assert.equal(r.material.metalness,r.metalness);assert.equal(r.material.roughness,r.roughness)}}
 assert.equal(source.color.getHexString(),'334455');
}
assert.throws(()=>controller.setPalette({base:'bad'}),/Invalid palette/);
assert(controller.rows.every(r=>r.material.color.equals(r.original)),'Rejected palette is atomic');
const nativeController=createPaletteController(new Map([['hardware',nodes.get('hardware')]]),records,{materialOverrides:new Map([['hardware',{color_linear:[.1,.2,.3]}]])});
nativeController.setPalette({base:'#ffee00'});assert.deepEqual(nativeController.rows[0].original.toArray(),[.1,.2,.3]);assert.deepEqual(nativeController.rows[0].material.color.toArray(),[.1,.2,.3]);assert.equal(nativeController.rows[0].material.metalness,.65);
assert.throws(()=>createPaletteController(new Map([['print',nodes.get('print')]]),records,{materialOverrides:new Map([['print',{color_linear:[.1,.2,.3]}]])}),/hardware override/);
console.log('Shared source material isolation, hardware finish, complete palette changes and native reset passed.');
