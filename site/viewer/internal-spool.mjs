const allowed=new Set(['voron_trident_300','voron_trident_350','siboor_trident_300','siboor_trident_350']);
export const INTERNAL_SPOOL_CATALOG='TRIDENT_INTERNAL_SPOOL.json';

// Installation records, rather than a printer-family name, decide availability.
export function withInternalSpool(registration,catalog,machine){
 if(catalog.schema!=='trident-internal-spool-1'||Object.keys(catalog.machines).some(id=>!allowed.has(id)))throw Error('Unregistered internal spool installation');
 const row=catalog.machines[machine];if(!row)return registration;
 if(!registration||row.id!=='trident_internal_spool'||typeof row.module!=='string'||!Array.isArray(row.translation_mm)||row.translation_mm.length!==3||!row.translation_mm.every(Number.isFinite))throw Error('Invalid internal spool mounting record');
 const spec=catalog.assets[row.module];
 if(!spec?.external||!Number.isInteger(spec.parts)||spec.parts<=0||typeof spec.component_id!=='string'||!spec.files?.['model.glb']||!spec.files?.['parts.json'])throw Error('Missing internal spool assembly');
 const proof=row.qualification,hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 if(!proof||proof.schema!=='internal-spool-qualified-holder-95'||proof.scope!=='rigid_holder_and_guides_only'||proof.machine_id!==machine||proof.component_id!==spec.component_id||proof.filament_route_registered!==false||proof.whole_machine_certified!==false||!['report_sha256','native_tuple_receipt_sha256','native_bindings_sha256','machine_manifest_sha256','machine_profile_sha256'].every(key=>hash(proof[key]))||proof.model_sha256!==spec.files['model.glb'].sha256||proof.metadata_sha256!==spec.files['parts.json'].sha256)throw Error('Internal spool installation evidence is missing or stale');
 if(!Array.isArray(proof.verified_bed_down_range_mm)||proof.verified_bed_down_range_mm.length!==2||proof.verified_bed_down_range_mm[0]!==0||!Number.isFinite(proof.verified_bed_down_range_mm[1])||proof.verified_bed_down_range_mm[1]<=0)throw Error('Internal spool bed travel evidence is missing');
 if((registration.accessories||[]).some(a=>a.id===row.id))throw Error('Duplicate internal spool registration');
 return {...registration,assets:{...registration.assets,[row.module]:spec},accessories:[...(registration.accessories||[]),row]};
}

export async function loadInternalSpool(registration,machine){
 if(!allowed.has(machine))return registration;
 const response=await fetch('../TRIDENT_INTERNAL_SPOOL.json',{cache:'no-cache'});
 if(!response.ok)throw Error('Internal spool installation catalog unavailable');
 return withInternalSpool(registration,await response.json(),machine);
}
