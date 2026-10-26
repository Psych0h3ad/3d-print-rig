// Source-bound pose and rejection checks. Actual selected triangles run separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {correctedE3NGSourceWorlds,e3ngInstallationCorrections,e3ngInstallationModel}=await import('../site/viewer/source-assembly-runtime/e3ng-installation-corrections.mjs');
const THREE=await import('three');
const {addE3NGSkirtFasteners}=await import('../site/viewer/source-assembly-runtime/e3ng-skirt-fasteners.mjs');
const {e3ngSkirtFasteners}=await import('../site/viewer/source-assembly-runtime/e3ng-skirt-fastener-data.mjs');
const packet=JSON.parse(fs.readFileSync(new URL('../site/source-assembly-assets/packet-rh3d_e3ng_v12_235.json',import.meta.url),'utf8'));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/e3ng-installations-source.json',import.meta.url),'utf8'));
// Check the release gate's exact receipt before the longer actual-asset build.
// Native receipt bytes stay pinned; Git must not normalize its line endings.
const fastenerAudit=fs.readFileSync(new URL('./audit_e3ng_skirt_fasteners.mjs',import.meta.url),'utf8');
const fastenerPin=fastenerAudit.match(/^const fixtureSHA='([0-9a-f]{64})';$/m)?.[1];
assert(fastenerPin,'Missing exact fastener receipt hash');
const fastenerReceipt=fs.readFileSync(new URL('./fixtures/e3ng-skirt-fasteners-source.json',import.meta.url));
assert.equal(createHash('sha256').update(fastenerReceipt).digest('hex'),fastenerPin,'Exact E3NG source/native receipt changed');
const untouched=JSON.stringify(packet),sourceRecords=new Map(packet.parts.map(r=>[r.key,r]));
assert.equal(packet.model.sha256,e3ngInstallationModel);assert.equal(fixture.model_sha256,e3ngInstallationModel);
const installed=correctedE3NGSourceWorlds(packet);
assert.equal(installed.size,7);assert.equal(new Set(e3ngInstallationCorrections.map(r=>r.key)).size,7);
for(const source of fixture.corrections){
 const pose=installed.get(source.key),record=sourceRecords.get(source.key);
 assert(record&&pose);assert.equal(record.source_id,source.source_id);
 assert.deepEqual(record.matrix,source.expected_world_m);
 assert.deepEqual(pose.toArray(),source.installed_world_m);
 const prior=pose.determinant(),before=new pose.constructor().fromArray(record.matrix).determinant();
 assert(Math.abs(prior-before)<1e-20,'Installation must retain source scale and handedness');
 for(const field of ['source_id','matrix']){
  const bad=structuredClone(packet),row=bad.parts.find(r=>r.key===source.key);
  if(field==='source_id')row.source_id='wrong-source';else row.matrix[12]+=.001;
  assert.throws(()=>correctedE3NGSourceWorlds(bad),/source binding/);
 }
}
for(const source of fixture.unchanged_guards){assert(!installed.has(source.key),'Hosts/nuts must retain native positions');assert.deepEqual(sourceRecords.get(source.key).matrix,source.expected_world_m);}
const first=installed.values().next().value;first.elements[12]+=1;
assert.notDeepEqual(first.toArray(),correctedE3NGSourceWorlds(packet).values().next().value.toArray(),'Installation result must not expose shared mutable matrices');
assert.equal(correctedE3NGSourceWorlds({...packet,head_only_subset:true}).size,0,'Head-only view must not install frame/bed parts');
assert.equal(correctedE3NGSourceWorlds({...packet,model:{sha256:'0'.repeat(64)}}).size,0,'Other source models must remain unchanged');
assert.equal(JSON.stringify(packet),untouched,'Source records must not be rewritten into installed poses');
// Synthetic triangles test instance ownership/lifetime only. The release audit
// independently reads the actual source screw and nut byte ranges.
const root=new THREE.Group(),parts=new Map(),rest=new Map(),all=[];
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
const material=new THREE.MeshBasicMaterial({color:0x808080});
const sourceKeys=[...new Set(e3ngSkirtFasteners.map(r=>r.source_key))];assert.equal(sourceKeys.length,2);assert.equal(e3ngSkirtFasteners.length,8);
for(const key of [...sourceKeys,'RH3D-original-front-skirt-190']){const record=sourceRecords.get(key),node=new THREE.Group();node.matrix.fromArray(record.matrix);node.matrixAutoUpdate=false;node.userData.part_key=key;node.add(new THREE.Mesh(geometry,material));root.add(node);parts.set(key,{node,record});}
root.updateMatrixWorld(true);const originalWorlds=new Map([...parts].map(([key,row])=>[key,row.node.matrixWorld.toArray()]));
const originalId=parts.get(sourceKeys[1]).record.source_id;parts.get(sourceKeys[1]).record={...parts.get(sourceKeys[1]).record,source_id:'wrong'};
assert.throws(()=>addE3NGSkirtFasteners({root,packet,parts,rest,all}),/source instance/);assert.equal(parts.size,3,'Rejected source must not leave partial instances');
parts.get(sourceKeys[1]).record={...parts.get(sourceKeys[1]).record,source_id:originalId};
const instances=addE3NGSkirtFasteners({root,packet,parts,rest,all});assert.equal(instances.length,8);assert.equal(parts.size,11);
for(const spec of e3ngSkirtFasteners){const row=parts.get(spec.key);assert.equal(row.record.kind,'purchased');assert.equal(row.record.material_role,'native');assert.equal(row.record.printed_palette_applies,false);assert.deepEqual(row.record.motion_axes,[]);assert.deepEqual(row.node.matrixWorld.toArray(),spec.world_m);row.node.traverse(n=>{if(n.isMesh)assert.equal(n.geometry,geometry,'Source geometry must be reused unchanged');});}
for(const [key,world]of originalWorlds)assert.deepEqual(parts.get(key).node.matrixWorld.toArray(),world,'Original source instances must not be moved');
assert.throws(()=>addE3NGSkirtFasteners({root,packet,parts,rest,all}),/source instance/);
assert.deepEqual(addE3NGSkirtFasteners({root,packet:{...packet,head_only_subset:true},parts,rest,all}),[]);
assert.equal(JSON.stringify(packet),untouched);geometry.dispose();material.dispose();
console.log(JSON.stringify({passed:true,source_bound_corrections:7,purchased_source_fastener_instances:8,source_and_material_records_unchanged:true,actual_triangle_audit:'audit_e3ng_installations.mjs',physical_fit_certified:false}));
