import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertHelperDescriptor,assertEmbeddedTriangleDocument,assertRetainedScenes,fixture} from './audit_trinity_beacon_helpers.mjs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {headPlan} from '../site/viewer/head-assembly.js';
import {importedVariant,headBuilderDimensions} from '../site/viewer/configuration-model.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../site/'+name,import.meta.url)));
const additions=read('HEAD_ADDITIONS.json'),components=read('COMPONENT_ADDITIONS.json');assertHelperDescriptor(additions);assertHelperDescriptor(components);
const embedded={buffers:[{byteLength:12}],meshes:[{primitives:[{attributes:{POSITION:0},mode:4}]}]};assertEmbeddedTriangleDocument(embedded,12);
for(const mutate of [d=>d.buffers[0].uri='other.bin',d=>d.meshes[0].primitives[0].mode=0,d=>d.buffers[0].byteLength=16]){const d=structuredClone(embedded);mutate(d);assert.throws(()=>assertEmbeddedTriangleDocument(d,12));}
const scenes={scene:0,scenes:[{nodes:[0]},{nodes:[1]}],nodes:[{},{}],materials:[]};assertRetainedScenes(scenes,structuredClone(scenes));assert.throws(()=>assertRetainedScenes(scenes,{...scenes,scene:1}));
const catalog=withHeadAdditions(read('TOOLHEAD_CONFIGURATIONS.json'),additions);catalog.dimensions=headBuilderDimensions;
const source=catalog.variants.find(v=>v.id===fixture.head),other=catalog.variants.find(v=>v.id==='trinity88__n20');assert(source&&other);assert.equal(source.source_version,fixture.source_commit);assert(source.head_only&&!source.machine_head&&!source.registration_source);
assert(source.fit.complete_head_native.notes.includes(fixture.notice));
assert(components.items.find(v=>v.id===fixture.asset).notes.includes(fixture.notice));
for(const current of [source,other,source]){assert.equal(importedVariant(catalog,{configuration:current.id}),current);const plan=headPlan(current);assert.equal(plan.base,current.base_asset);assert.deepEqual(plan.translation,[0,0,0]);assert.deepEqual(plan.modules,[]);}
assert.equal(headPlan(source).base,fixture.asset);assert.equal(catalog.base_assets[fixture.asset].parts,fixture.parts);
for(const mutate of [c=>c.assets[fixture.asset].files=fixture.original_files,c=>c.assets[fixture.asset].parts=94,c=>c.assets[fixture.asset].files['model.glb'].decoded_sha256='0'.repeat(64),c=>c.assets[fixture.asset].files['parts.json'].path='trinity-native/n19/parts.json',c=>delete c.assets[fixture.asset].files['source-supplement.zip'],c=>c.assets[fixture.asset].files['source-supplement.zip'].sha256='0'.repeat(64)]){const c=structuredClone(additions);mutate(c);assert.throws(()=>assertHelperDescriptor(c));}
console.log('Trinity n19 source-derived Beacon helper asset, unchanged selection/reset identity, and stale-asset counterexamples passed. Actual exported-model audit remains separate.');
