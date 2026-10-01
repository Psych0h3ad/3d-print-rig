import assert from 'node:assert/strict';
import {withFrameMods} from '../site/viewer/frame-mods.js';
import {AccessorySelection} from '../site/viewer/accessories.js';
import {createV24Adapter} from '../site/viewer/v24_adapter.mjs';

const base={assets:{head:{meta:'head.json'}},accessories:[],variants:[{id:'baseline'}]};
const mods={assets:{handles:{meta:'handles.json'}},accessories:[{id:'handles',module:'handles',translation_mm:[0,0,30]}]};
const catalog=withFrameMods(base,mods);
assert.equal(base.accessories.length,0);assert.equal(base.assets.handles,undefined);
assert.deepEqual(catalog.variants,base.variants);assert.deepEqual(catalog.assets.head,base.assets.head);
assert.equal(withFrameMods(catalog,mods).accessories.length,1);
const vector=(x=0,y=0,z=0)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z})},clone(){return vector(this.x,this.y,this.z)},toArray(){return [this.x,this.y,this.z]}});
const handle={visible:false,userData:{},position:vector()};
const state=new AccessorySelection(catalog,async()=>({root:handle}),()=>{});
await state.apply({accessories:['handles']});assert.deepEqual(handle.position.toArray(),[0,.03,0]);
const gantry={userData:{part_key:'gantry'},position:vector()};
const disco={userData:{},position:vector(0,.03,0)};
// Fixtures share the scene with the machine, but belong to its fixed frame,
// independently of the adapter's moving stock gantry.
const scene={traverse(fn){[gantry,disco,handle].forEach(fn)}};
const profile={machine_id:'siboor_v24_350',display_reference_xyz_mm:[175,175,27],display_limits_mm:{X:[0,350],Y:[0,350],Z:[0,330]}};
const adapter=createV24Adapter(scene,{machine_id:profile.machine_id,parts:[{key:'gantry',motion:'z_gantry',motion_axes:['Z']}]},profile);
for(const z of [0,27,150,330]){
 adapter.setPose({x:175,y:175,z});assert.deepEqual(disco.position.toArray(),[0,.03,0]);assert.deepEqual(handle.position.toArray(),[0,.03,0]);
}
handle.visible=false;handle.position.set(0,0,0);state.refresh();assert.equal(handle.visible,true);assert.deepEqual(handle.position.toArray(),[0,.03,0]);
await state.apply({accessories:[]});assert.equal(handle.visible,false);
console.log('Frame mods passed: catalog isolation, single registration, fixed fixtures through V2.4 Z travel, toggle and restoration.');
