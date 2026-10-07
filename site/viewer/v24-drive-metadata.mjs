// Native source drive metadata only; this does not grant a head installation.
export const V24_CNC_DRIVE_SOURCE={repository:'VCProjects/LDO_AWD',commit:'946c81462a966bab11b8b9722dad83876d2b8b59',native_drive_leaves:211,xy_drive_count:4,belt_width_mm:6};
const hosts=new Set([250,300,350].map(n=>'voron_v24_'+n+'_ldo_cnc'));
export function v24NativeDriveMetadata(machine,profile){
 if(!hosts.has(machine)){if(profile?.cnc)throw Error('Unproved V2.4 CNC drive source');return null;}
 const c=profile?.cnc,s=V24_CNC_DRIVE_SOURCE;
 if(profile?.machine_id!==machine||!c||c.repository!==s.repository||c.commit!==s.commit||c.native_drive_leaves!==s.native_drive_leaves||c.xy_drive_count!==s.xy_drive_count||profile.xy_belt_width_mm!==s.belt_width_mm)throw Error('V2.4 native CNC drive metadata mismatch');
 return {...s};
}
export function assertV24NativeDriveVariant(variant,machine,profile){
 const source=v24NativeDriveMetadata(machine,profile);
 if(source&&variant.gantry==='machine_gantry'&&(variant.xy_motors!==source.xy_drive_count||variant.belt_width_mm!==source.belt_width_mm))throw Error('V2.4 variant does not match native CNC drives');
 return variant;
}
export function withV24NativeDriveMetadata(catalog,machine,profile){
 const source=v24NativeDriveMetadata(machine,profile);if(!source)return catalog;
 const result={...catalog,native_xy_drive_source:source,variants:catalog.variants.map(v=>v.gantry==='machine_gantry'?{...v,xy_motors:source.xy_drive_count}:v)};
 for(const v of result.variants)assertV24NativeDriveVariant(v,machine,profile);
 return result;
}
