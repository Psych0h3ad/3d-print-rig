/** Capture assets checked by the current loader, with observed-only JSON hashes
 * explicitly labelled when no independent expected pin is available.
 * SHA-256 digests bind replay context to content. They are not signatures,
 * native-clearance evidence, or authentication of an imported replay file.
 */
const fail=()=>{throw Error('Loaded printer asset identity is incomplete')};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
async function contentSha(value){
 const text=JSON.stringify(canonical(value));if(typeof text!=='string'||text.length>32000000)fail();
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export async function loadedPrinterAssetIdentity({machine,spec,manifest,profile,checkedFileNames}){
 if(!spec||!profile?.source||typeof profile.source!=='object'||Array.isArray(profile.source))fail();
 const expected=['assembly_manifest.json','machine_profile.json','model.glb',...(spec.additional_models||[])];
 return captureIdentity({machine,spec,manifest,profile,checkedFileNames,expected,source:profile.source});
}
// Page families have different verified input sets (including split glTF buffers,
// covers and routes) and source metadata layouts. The loader supplies its complete
// required set only after every checked read and model parse has succeeded.
export async function loadedFamilyAssetIdentity({machine,spec,manifest,profile,checkedFileNames,requiredFileNames}){
 const provenance=value=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>['source','source_url','source_commit','source_revision','source_sha256','cad_source_kind','native_export_revision','native_archive','version'].includes(key)));
 const source={profile:provenance(profile),manifest:provenance(manifest),catalog:provenance(spec)};
 if(!Object.values(source).some(v=>Object.keys(v).length))fail();
 if(!Array.isArray(requiredFileNames)||!['assembly_manifest.json','machine_profile.json'].every(n=>requiredFileNames.includes(n))||!requiredFileNames.some(n=>n==='model.glb'||n==='model.gltf'))fail();
 return captureIdentity({machine,spec,manifest,profile,checkedFileNames,expected:requiredFileNames,source});
}
async function captureIdentity({machine,spec,manifest,profile,checkedFileNames,expected,source}){
 if(!spec||spec.machine_id!==machine||manifest?.machine_id!==machine||profile?.machine_id!==machine)fail();
 if(!Array.isArray(checkedFileNames)||new Set(expected).size!==expected.length||checkedFileNames.length!==expected.length||expected.some((name,i)=>name!==checkedFileNames[i]))fail();
 const files=expected.map(name=>{
  const record=spec.files?.[name];if(!record||!sha(record.sha256)||typeof record.path!=='string'||!record.path||!Number.isSafeInteger(record.bytes)||record.bytes<0||record.encoding&&record.encoding!=='gzip')fail();
  if(record.encoding==='gzip'&&(!sha(record.decoded_sha256)||!Number.isSafeInteger(record.decoded_bytes)||record.decoded_bytes<0))fail();
  if(record.verification&&!['loader-sha256','observed-sha256'].includes(record.verification))fail();
  return {name,path:record.path,sha256:record.sha256,bytes:record.bytes,encoding:record.encoding||'identity',decoded_sha256:record.encoding==='gzip'?record.decoded_sha256:record.sha256,decoded_bytes:record.encoding==='gzip'?record.decoded_bytes:record.bytes,...(record.verification?{verification:record.verification}:{})};
 });
 // The effective profile/manifest include any applied native motion registration.
 // Raw file pins alone would miss changes made by that separate registration.
 const [effective_profile_sha256,effective_manifest_sha256,motion_registration_sha256]=await Promise.all([
  contentSha(profile),contentSha(manifest),profile.motion_registration?contentSha(profile.motion_registration):null
 ]);
 return freeze({schema:'loaded-printer-asset-identity/1',machine_id:machine,files,source:JSON.parse(JSON.stringify(source)),effective_profile_sha256,effective_manifest_sha256,motion_registration_sha256});
}
