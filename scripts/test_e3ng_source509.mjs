// Source metadata and controller regression. No binary/model decode or native job.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initialState,validateState,reviewWorldDelta} from '../site/viewer/source-assembly-runtime/state.mjs';
import {migrateCompatibleState} from '../site/viewer/source-assembly-runtime/state_compatibility.mjs';
import {headSubsetPacket} from '../site/viewer/source-assembly-runtime/head_subset.mjs';
import {sourceAssemblyMachines} from '../site/viewer/source-assembly-registry.mjs';
import {e3ngSourceNotices} from '../site/viewer/source-assembly-notices509.mjs';
import {sourceMetadataURL} from './source-metadata-input.mjs';
const base=new URL('../site/viewer/',import.meta.url),read=url=>JSON.parse(fs.readFileSync(url,'utf8'));
const index=read(new URL('../site/SOURCE_ASSEMBLIES.json',import.meta.url)),record=index.models.find(r=>r.id==='rh3d_e3ng_v12_235');
assert(record);assert.equal(index.models.length,new Set(index.models.map(r=>r.id)).size);
assert.deepEqual(index.models.map(r=>r.id).sort(),sourceAssemblyMachines.map(r=>r.id).sort());
const raw=fs.readFileSync(new URL(record.packet.url,base));assert.equal(createHash('sha256').update(raw).digest('hex'),record.packet.sha256);
const p=JSON.parse(raw),native=initialState(p);validateState(native,p);
assert.equal(p.model.sha256,'1dad2900f881eec60fa16255c98628489443ea453086c79b7d0d6ac0e3e6bf3f');
assert.equal(p.parts.length,508);assert.equal(new Set(p.parts.map(r=>r.key )).size,508);
assert.equal(p.download_contract.STEP_enabled,false);assert.equal(p.download_contract.step.available,false);
const manifest=read(sourceMetadataURL(base,p.chunk_delivery.manifest.url)),inventory=read(sourceMetadataURL(base,p.inventory.url));
assert.deepEqual(inventory.parts,p.parts);assert.equal(manifest.chunks.length,43);
assert.equal(manifest.source_inventory_sha256,p.inventory.sha256);assert.equal(manifest.model_sha256,p.model.sha256);
const fixed=p.illustrative_latch_display.owner_keys;assert.equal(fixed.length,6);
for(const key of fixed)assert.deepEqual(p.private_source_motion172.target_axes_by_key[key],[]);
for(const row of p.parts.filter(r=>r.key.startsWith('Fanta-r-1380804-silicone-support-'))){assert.equal(row.kind,'purchased');assert.equal(row.material_role,'native');assert.equal(row.source_preview_rigid_host,'Z-bed');assert.deepEqual(p.private_source_motion172.target_axes_by_key[row.key],['z']);assert.deepEqual(reviewWorldDelta(p,row.key,{x:4,y:5,z:2},'attached'),[0,-.002,0]);}
let migrations=0;
for(const revision of p.state_compatibility.revisions)for(const weight of [undefined,0,1]){
 const saved={...native,model_sha256:revision.model_sha256,inventory_sha256:revision.inventory_sha256,source_material_display:'source'};
 if(weight!==undefined)saved.illustrative_latch_display={model_sha256:revision.model_sha256,weight};
 if(weight!==undefined&&!revision.illustrative_latch_display_compatibility){assert.throws(()=>migrateCompatibleState(saved,p));continue;}
 const out=migrateCompatibleState(saved,p);assert.equal(out.migrated,true);assert.equal(out.state.inventory_sha256,p.inventory.sha256);assert.equal(out.state.source_material_display,'source');
 if(weight!==undefined)assert.deepEqual(out.state.illustrative_latch_display,{model_sha256:p.model.sha256,weight});migrations++;
}
assert.equal(p.state_compatibility.revisions.length,4);assert.equal(migrations,10);
assert.throws(()=>migrateCompatibleState({...native,model_sha256:'f'.repeat(64)},p));
const bad=structuredClone(p);bad.private_source_motion172.reference_nozzle_plate_gap_mm+=.01;assert.throws(()=>validateState(initialState(bad),bad));
const wrong=structuredClone(p);wrong.parts.find(r=>r.key==='Fanta-r-1380804-silicone-support-1').motion_axes=[];assert.throws(()=>validateState(initialState(wrong),wrong));
const head=headSubsetPacket(p,{keys:p.public_head_keys,loading_budget:{}});assert.equal(head.source_current_collision34,undefined);assert.equal(head.illustrative_latch_display,undefined);validateState(initialState(head),head);
for(const lang of ['en','ja','de','es','ko','ru'])assert.equal(e3ngSourceNotices(lang).length,3);
const ui=fs.readFileSync(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
assert(ui.includes("colors.append(sourceColors)"));assert(ui.includes("id:'sourceColors'"));
const handler=ui.match(/sourceColors.onclick=\(\)=>\{([^\n]+?)\};/)[1];
for(const mode of ['full','head']){
 const before={...native,review_axes:{x:1,y:2,z:3},source_material_display:'palette',mode},active={snapshot:()=>structuredClone(before)};let applied;
 new Function('active','apply',handler)(active,s=>{applied=s;});
 assert.deepEqual(applied,{...before,source_material_display:'source'});
}
const browserBase='https://psych0h3ad.github.io/3d-print-rig/viewer/community.html';
for(const c of manifest.chunks){const url=c.gzip?.url??c.url;assert(url.startsWith('/'));assert.equal(new URL(url,browserBase).origin,new URL(browserBase).origin);assert(url.includes('/source-assemblies/'+p.model.sha256+'/'));}
for(const a of manifest.document.accessors)if(a.type==='VEC3'&&a.min){assert(a.min.every(Number.isFinite));assert(a.max.every(Number.isFinite));}
console.log(JSON.stringify({passed:true,source_owners:508,fixed_latches:6,Z_spacers:4,explicit_migrations:4,migration_states:migrations,geometry_loaded:false,native_fit_claim:false}));
