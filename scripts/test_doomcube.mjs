import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
import {communityAuditDirectory} from './community-audit-root.mjs';
import {machineChoices,machineFamilies,machineVendors} from '../site/viewer/machines.js';
import {extraAssetBase} from '../site/viewer/extra-asset-integrity.mjs';
const id='doomcube2_350_reference',choice=machineChoices.find(r=>r.id===id),catalog=JSON.parse(fs.readFileSync(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url))),row=catalog.machines[id];
assert.deepEqual({family:choice.family,vendor:choice.vendor,size:choice.size,page:choice.page},{family:'doomcube',vendor:'frankenvoron',size:350,page:'./community.html'});
assert.equal(machineFamilies.doomcube,'DoomCube 2');assert.equal(machineVendors.frankenvoron,'FrankenVoron');assert.equal(row.machine_id,id);assert.equal(row.parts,705);
assert.equal(row.local_directory,'large-voron-assets');assert.equal(row.files['model.glb'].decoded_sha256,'7a8d958a198ffabd374314c95a9d49e8b0f0f64fc51a488cdb3a1b973c8e95ad');
for(const file of Object.values(row.files)){assert(file.path.startsWith('doomcube-v103/'+id+'/'));assert(!file.path.includes('..'));assert.match(file.sha256,/^[a-f0-9]{64}$/)}
const merged={...catalog,base_url:row.base_url,local_directory:row.local_directory};
assert.equal(extraAssetBase(merged,'https://psych0h3ad.github.io/3d-print-rig/viewer/community-loader.mjs').href,row.base_url);
assert.equal(extraAssetBase(merged,'http://127.0.0.1:8879/viewer/community-loader.mjs').pathname,'/large-voron-assets/');
const source=JSON.parse(fs.readFileSync(new URL('../site/PUBLIC_CATALOG.json',import.meta.url))).sources.find(s=>s.id==='doomcube2');
assert.equal(source.commit,'02baa8c02c8984d46450843e8b41f24b135f6478');assert(source.license.startsWith('GPL-3.0'));assert(source.url.includes(source.commit));
const review=JSON.parse(fs.readFileSync(new URL('../docs/DOOMCUBE_REVIEW_103.json',import.meta.url)));
assert.equal(review.after_decoded_sha256,row.files['model.glb'].decoded_sha256);assert.equal(review.source_revision,source.commit);assert.equal(review.static_reference_only,true);assert.equal(review.native_mating_verified,false);
assert.deepEqual(review.glass_keys,['283','320','323']);assert.deepEqual(review.opaque_panel_keys,['311','313','317']);
for(const part of review.parts){assert.match(part.source_brep_sha256,/^[a-f0-9]{64}$/);assert(part.source_path.length>=4);assert.equal(part.appearance_role,review.glass_keys.includes(part.key)?'glass':review.opaque_panel_keys.includes(part.key)?'native':'accent')}
const appearance=JSON.parse(fs.readFileSync(new URL('../docs/DOOMCUBE_APPEARANCE_103.json',import.meta.url)));
assert.equal(appearance.reviewed_display_parts_after,705);assert.equal(appearance.reviewed_native_leaves,688);assert.equal(appearance.binary_geometry_unchanged,true);
assert.equal(appearance.source_roles['220'].appearance_role,'base');assert.equal(appearance.source_roles['220_accent'].appearance_role,'accent');assert.equal(appearance.source_roles['629'].appearance_role,'metal');assert.deepEqual(appearance.open_source_keys,['218','700']);
assert.equal(review.invalid_native_source_keys.length,3);assert.deepEqual(review.removed_builtin_supports,[]);
console.log(JSON.stringify({passed:true,id,source_revision:source.commit,delivery:'declared per-machine checked asset root',scope:'Catalog/source registration only; current exported assembly and browser reviewed separately.'}));

const fixtureRoot=path.resolve('test-actual-site'),legacyRoot=path.resolve('legacy-community');
assert.equal(communityAuditDirectory(row,catalog,legacyRoot,path.join(fixtureRoot,'COMMUNITY_MACHINES_ASSETS.json')),path.join(fixtureRoot,row.local_directory));
assert.equal(communityAuditDirectory({},catalog,legacyRoot,path.join(fixtureRoot,'COMMUNITY_MACHINES_ASSETS.json')),legacyRoot);
assert.throws(()=>communityAuditDirectory({local_directory:'../escape'},catalog,legacyRoot,path.join(fixtureRoot,'COMMUNITY_MACHINES_ASSETS.json')));
