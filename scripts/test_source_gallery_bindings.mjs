// Actual thumbnail bytes and source bindings; separate from release coverage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {machineChoices} from '../site/viewer/machines.js';
import {validateGallery} from '../site/viewer/machine-gallery.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','site');
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const index=read('assets/machines/index.json'), rows=validateGallery(index), source=read('SOURCE_ASSEMBLIES.json');
assert.deepEqual(rows.map(r=>r.id).sort(),machineChoices.filter(r=>r.available!==false).map(r=>r.id).sort());
for(const row of rows){
 const image=fs.readFileSync(path.join(root,'assets/machines',row.thumbnail));
 assert.equal(image.length,row.thumbnail_bytes,row.id+' thumbnail bytes');
 assert.equal(sha(image),row.thumbnail_sha256,row.id+' thumbnail hash');
 assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.equal(image.readUInt32LE(4)+8,image.length,row.id+' complete WebP');
}
function checkSourceRow(row,registration){
 assert.equal(row.render_method,'actual-exported-triangle-cpu-projection');
 const packetBytes=fs.readFileSync(path.resolve(root,'viewer',registration.packet.url));
 assert.equal(sha(packetBytes),registration.packet.sha256);const packet=JSON.parse(packetBytes);
 const projectionBytes=fs.readFileSync(path.join(root,'assets/machines',row.source_projection));
 assert.equal(sha(projectionBytes),row.source_projection_sha256);const projection=JSON.parse(projectionBytes);
 assert.equal(projection.machine_id,row.id);assert.equal(projection.model_sha256,registration.model_sha256);
 assert.equal(projection.packet.sha256,registration.packet.sha256);assert.equal(projection.physical_roots,packet.parts.length);
 assert.equal(projection.visible_roots,projection.rendered_roots);assert(projection.counts.source_triangles_submitted>0);
 assert.equal(projection.browser_review,false);assert.equal(projection.whole_machine_fit_verified,false);
 assert.equal(projection.thumbnail.sha256,row.thumbnail_sha256);
 assert(row.model_pins.every(p=>p.model_sha256===registration.model_sha256&&p.transport_manifest_sha256===packet.chunk_delivery.manifest.sha256));
 return projection;
}
for(const registration of source.models){
 const row=rows.find(r=>r.id===registration.id);assert(row);checkSourceRow(row,registration);
 assert.throws(()=>checkSourceRow({...row,thumbnail_sha256:'0'.repeat(64)},registration));
 assert.throws(()=>checkSourceRow({...row,source_projection_sha256:'0'.repeat(64)},registration));
 const bad=structuredClone(row);bad.model_pins[0].model_sha256='0'.repeat(64);assert.throws(()=>checkSourceRow(bad,registration));
}
const missing=structuredClone(index);missing.machines.pop();assert.throws(()=>validateGallery(missing));
console.log(JSON.stringify({passed:true,available_registrations:rows.length,actual_thumbnail_hashes:rows.length,
 source_model_bindings:source.models.map(r=>r.id),negative_missing_and_stale_bindings:true,
 scope:'Source gallery completeness, exact actual image bytes and two CPU-projection source bindings only. Actual machine/component/motion/material/browser coverage is separate.',
 actual_machine_release_pass:false,all_hotend_patterns_audited:false,browser_review:false,publication_ready:false}));
