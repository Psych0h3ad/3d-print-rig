import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadedFamilyAssetIdentity} from '../site/viewer/gcode-loaded-asset-identity.mjs';
const H=n=>String(n).repeat(64),core=['assembly_manifest.json','machine_profile.json','model.glb'];
const sets={crossant:[...core.slice(0,2),'belt_bindings.json','chain_bindings.json','KNOWN_CONTACTS.json','model.gltf',...Array.from({length:7},(_,i)=>`geometry_0${i}.bin`),'covers_manifest.json','covers.glb'],ratrig:[...core,'flexible_routes.json'],annex:core,'kit-reference':core,remorph:[...core,'belt_bindings.json'],positron:core};
for(const [family,names] of Object.entries(sets)){
 const args={machine:family,spec:{machine_id:family,source:{revision:'catalog'},files:Object.fromEntries(names.map(name=>[name,{path:name,bytes:4,sha256:H(1)}]))},manifest:{machine_id:family,source_commit:'manifest-revision',parts:[{key:'p1',group:'head'}]},profile:{machine_id:family,source_revision:{commit:'profile-revision'},axes:{x:[-10,10]},motion_registration:{groups:{head:['p1']}}},requiredFileNames:names,checkedFileNames:names};
 if(family==='kit-reference')for(const name of core)args.spec.files[name].verification=name==='model.glb'?'loader-sha256':'observed-sha256';
 const identity=await loadedFamilyAssetIdentity(args),savedContext=JSON.stringify({machine:family,asset_identity:identity});
 assert.equal(identity.files.length,names.length);assert.equal(JSON.stringify({machine:family,asset_identity:await loadedFamilyAssetIdentity(structuredClone(args))}),savedContext);
 for(const name of names){const changed=structuredClone(args);changed.spec.files[name].sha256=H(2);assert.notEqual(JSON.stringify({machine:family,asset_identity:await loadedFamilyAssetIdentity(changed)}),savedContext,`${family}: ${name}`)}
 for(const mutate of [a=>a.profile.motion_registration.groups.head=['p2'],a=>a.profile.source_revision.commit='new',a=>a.manifest.parts[0].group='bed',a=>a.spec.source.revision='new']){
  const changed=structuredClone(args);mutate(changed);assert.notDeepEqual(await loadedFamilyAssetIdentity(changed),identity);
 }
 assert(Object.isFrozen(identity.files[0])&&Object.isFrozen(identity.source));
 for(const mutate of [a=>a.checkedFileNames=a.checkedFileNames.slice(1),a=>a.requiredFileNames=[...a.requiredFileNames,a.requiredFileNames[0]],a=>a.profile.machine_id='wrong',a=>a.manifest.machine_id='wrong',a=>a.spec.files[names[0]].sha256='bad',a=>a.spec.files[names[0]].verification='assumed']){
  const changed=structuredClone(args);mutate(changed);await assert.rejects(loadedFamilyAssetIdentity(changed),/Loaded printer asset identity is incomplete/);
 }
 if(family==='kit-reference')assert.equal(identity.files[0].verification,'observed-sha256');
 const page=fs.readFileSync(new URL(`../site/viewer/${family}.js`,import.meta.url),'utf8');assert.match(page,/getContext:[\s\S]*asset_identity:/);
}
console.log('Six-family replay identity: complete loaded asset sets, split buffers/covers/routes/bindings, effective registration and source revision changes, immutable round-trip context, wrong/missing/duplicate identities and observed-only JSON provenance passed.');
