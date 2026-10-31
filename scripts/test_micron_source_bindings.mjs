import assert from 'node:assert/strict';
import {Group} from '../site/viewer/vendor/three.module.js';
import {createMicronFlexible} from '../site/viewer/micron-flexible.mjs';
import {createMicronAdapter} from '../site/viewer/micron-adapter.mjs';
import {micronTubeSpecs,micronTubeRoute} from '../site/viewer/micron-tube-routes.mjs';
import {validateMicronTubeBindings,micronNativeTubeEndpoints} from '../site/viewer/micron-tube-bindings.mjs';
import {micronChainPins} from '../site/viewer/micron-flexible-pins.mjs';
import {addMicronTubeFixtureBindings} from './micron-flexible-test-fixtures.mjs';
const fixture=()=>addMicronTubeFixtureBindings(new Map(),new Map());
const badKey='m180_01767';
const mutations=[
 f=>f.nodes.delete(badKey),f=>f.records.delete(badKey),
 f=>f.nodes.set(badKey,f.nodes.get('m180_01766')),
 f=>f.nodes.get(badKey).userData.part_key='other',f=>f.records.get(badKey).key='other',
 f=>f.records.get(badKey).motion='fixed',f=>f.records.get(badKey).motion_axes=['X','Y','Z'],
 f=>f.records.get(badKey).motion_axes=new Array(1),
 f=>f.records.get(badKey).source.commit='other',f=>f.records.get(badKey).source.cache_machine='micron_r1_120',
 f=>f.records.get(badKey).source.source_key='01766',f=>f.records.get(badKey).source.repository='other',
 f=>f.records.get(badKey).source.source_step='other',f=>f.records.get(badKey).source.translation_to_world_mm=[0,0,0],
 f=>f.records.get(badKey).source.transplanted_head=true,
 f=>f.nodes.get(badKey).clear(),f=>f.records.get('m180_00411').motion='fixed'
];
for(const mutate of mutations){
 const f=fixture();for(const pin of micronChainPins.links){f.nodes.set(pin.key,new Group());f.records.set(pin.key,{bounds_mm:[[0,0,0],[1,1,1]]});}
 mutate(f);const before=[];
 for(const node of f.nodes.values())node.traverse(n=>before.push({n,geometry:n.geometry,material:n.material,frustum:n.frustumCulled}));
 assert.throws(()=>createMicronFlexible(f.nodes,f.records,{machine_id:'micron_plus_r1_180'}),/Micron tube source binding mismatch/);
 for(const b of before){assert.equal(b.n.geometry,b.geometry);assert.equal(b.n.material,b.material);assert.equal(b.n.frustumCulled,b.frustum);}
}
const f=fixture();validateMicronTubeBindings(f.nodes,f.records,micronTubeSpecs);
// Adapter preflight also precedes its palette/belt constructors.
const badAdapter=fixture(),root=new Group();
for(const node of badAdapter.nodes.values())root.add(node);
badAdapter.records.get(badKey).motion='fixed';
const originals=[];root.traverse(n=>originals.push({n,geometry:n.geometry,material:n.material,frustum:n.frustumCulled}));
assert.throws(()=>createMicronAdapter(root,{machine_id:'micron_plus_r1_180',parts:[...badAdapter.records.values()]},{machine_id:'micron_plus_r1_180'}),/Micron tube source binding mismatch/);
for(const b of originals){assert.equal(b.n.geometry,b.geometry);assert.equal(b.n.material,b.material);assert.equal(b.n.frustumCulled,b.frustum);}
for(const mutate of [s=>s.pop(),s=>s[1]=s[0],s=>delete s[1],s=>s[1].end_attachment=['m180_00340'],s=>s[1].start_attachment=new Array(3),s=>s[1].end_motion='fixed']){
 const specs=structuredClone(micronTubeSpecs);mutate(specs);assert.throws(()=>validateMicronTubeBindings(f.nodes,f.records,specs),/Micron tube source binding mismatch/);
}
const endpoints=micronNativeTubeEndpoints('m180_01768');endpoints[0][2]=0;
assert.equal(micronNativeTubeEndpoints('m180_01768')[0][2],184.79862459683233,'Caller cannot corrupt reset cap datums');
assert.equal(micronNativeTubeEndpoints('m180_00411'),null,'Unmeasured source PTFE caps are not preview endpoints');
for(const d of [new Array(3),[0,,0],[undefined,0,0],[NaN,0,0],[Infinity,0,0],null])assert.throws(()=>micronTubeRoute(micronTubeSpecs[1],d),/Invalid Micron tube pose/);
console.log(`Micron route binding preflight: ${mutations.length} attachment/source/motion failures reject before source mutation; route-table negatives, sparse poses and native cap datum isolation checked. Lifecycle/identity fixtures, not physical fit.`);
