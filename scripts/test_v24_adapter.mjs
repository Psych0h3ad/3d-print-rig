import assert from 'node:assert/strict';
import {createV24Adapter} from '../site/viewer/v24_adapter.mjs';

const vector=(x=0,y=0,z=0)=>({x,y,z,clone(){return vector(this.x,this.y,this.z)},
  set(x,y,z){Object.assign(this,{x,y,z})},toArray(){return [this.x,this.y,this.z]}});
const records=[
  {key:'bed',group:'V24_Bed',motion_axes:[],motion:'fixed'},
  {key:'rail',group:'V24_Frame',motion_axes:[],motion:'fixed'},
  {key:'guide',group:'V24_Gantry',motion_axes:['Z'],motion:'z_gantry'},
  {key:'beam',group:'V24_X_Beam',motion_axes:['Y','Z'],motion:'yz'},
  {key:'head',group:'V24_Toolhead',motion_axes:['X','Y','Z'],motion:'xyz'},
  {key:'belt',group:'V24_Reference_Belts',motion_axes:[],motion:'reference_flexible'},
  {key:'sheet',group:'V24_Enclosure',motion_axes:[],motion:'fixed',panel_surface:true},
  {key:'hinge',group:'V24_Enclosure',motion_axes:[],motion:'fixed'},
];
const nodes=records.map(r=>({userData:{part_key:r.key},position:vector(),visible:true,traverse(fn){fn(this)}}));
// Child meshes share the part key in a GLB: they must not receive a second
// motion translation or be mistaken for another assembled part.
const child={userData:{part_key:'head'},parent:nodes[4],position:vector()};
const root={traverse(fn){nodes.forEach(fn);fn(child)}};
const profile={machine_id:'siboor_v24_350',display_reference_xyz_mm:[175,179.1,27],
  display_limits_mm:{X:[0,350],Y:[0,350],Z:[0,330]},fixed_bed_keys:['bed'],
  z_guide_block_keys:['guide'],panel_surface_keys:['sheet']};
const adapter=createV24Adapter(root,{machine_id:profile.machine_id,parts:records},profile);
adapter.setEnclosureVisible(false);
assert.equal(nodes[6].visible,false);
assert.equal(nodes[7].visible,true,'Panel toggle must preserve its hinge');
const pose=adapter.setPose({x:200,y:229.1,z:127});
assert.deepEqual(pose.cad_delta_xyz_mm,[25,50,100]);
assert.deepEqual(nodes[0].position.toArray(),[0,0,0]);
assert.deepEqual(nodes[1].position.toArray(),[0,0,0]);
assert.deepEqual(nodes[2].position.toArray(),[0,.1,0]);
assert.deepEqual(nodes[3].position.toArray(),[0,.1,-.05]);
assert.deepEqual(nodes[4].position.toArray(),[.025,.1,-.05]);
assert.deepEqual(child.position.toArray(),[0,0,0]);
assert.equal(nodes[5].visible,true,'Enabled reference wiring must remain visible away from its source pose');
assert.deepEqual(adapter.setPose({x:-9,y:900,z:900}).display_xyz_mm,[0,350,330]);
assert.throws(()=>adapter.setPose({x:NaN,y:0,z:0}),/Non-finite/);
assert.equal(adapter.setPose({x:175,y:179.1,z:27}).atReference,true);
assert.equal(nodes[5].visible,true);
adapter.setFlexibleVisible(false);
adapter.setPose({x:175,y:179.1,z:27});
assert.equal(nodes[5].visible,false);
console.log('V2.4 adapter: fixed bed/rails, guide and head motion, range limits, panel hardware and reference belts verified.');
