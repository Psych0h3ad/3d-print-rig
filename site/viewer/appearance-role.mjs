// Explicit native part identities. Hardware color is never a classification input.
const sbBase=new Set(['417','430','431','530','556','559','577','578']),sbAccent=new Set(['423','532','534','536','545','547']);
const printedR2=new Set(['B Drive Frame Lower','A Drive Frame Lower','Cable Cover','adxl_mount_generic_15.5_hole_c-c','PCB_Spacer','XY Joint - Left','XY Joint - Right','XY Cable Chain Bridge - 2 Hole','D2F_Endstop_Pod','Z Motor Mount','DIN Clips','Octopus Bracket','PCB DIN Clip','Raspberry_Bracket','RS-25 PSU Bracket','LRS PSU Bracket','SSR Mount Bracket','WAGO_221-415_mount-3x5','LCD Case Front','LCD Case Rear','LCD Case Hinge','BTT_Knob_Light_Shield','Fan Grill A','Fan Grill B','Fan Grill Retainer','Keystone Blank','bottom_panel_clip_x4','Z_Belt_Cover_A','Z_Belt_Cover_B','Z Belt Cover A','Z Belt Cover B','Rear Cover','Exhaust Grill','60mm_exhaust_fan_grill']);
const accents=new Set(['Cable Cover','PCB_Spacer','XY Cable Chain Bridge - 2 Hole','D2F_Endstop_Pod','LCD Case Front','LCD Case Hinge','BTT_Knob_Light_Shield','Fan Grill A','Fan Grill B','Fan Grill Retainer','Keystone Blank','Rear Cover','Exhaust Grill','60mm_exhaust_fan_grill']);
export function appearanceRole(part){
 if(!part)return null;const key=String(part.key),name=(part.name||'').replace(/(?:\s*\(\d+\)|\s+v\d+|:\d+)$/g,'').trim();
 if(sbBase.has(key))return 'base';if(sbAccent.has(key))return 'accent';
 if(/^fysetc_v24_250_pro_\d+$/.test(key)){
  if(/(?:^M\d+\b|Threaded Insert|Drop-in T-nut|Nylon Washer|^Motor$|^PCB$|^Heatsink$|^NEMA|^PRODUCT_NAME|^Rubber Foot)/i.test(name))return null;
  const nativeName=name.replace(/-\d+$/,'');if(printedR2.has(nativeName))return accents.has(nativeName)?'accent':'base';
  if(['B Drive Frame Upper','A Drive Frame Upper'].includes(nativeName))return 'base';
 }
 if(/^v24_\d+$/.test(key)&&printedR2.has(name))return accents.has(name)?'accent':'base';
 if(/^(?:head|changer)_tap_sb_rods_/.test(key)&&['cable_cover','cable_cover_for_pcb'].includes(name))return 'base';
 return part.appearance_role||null;
}
