// Explicit native part identities. Hardware color is never a classification input.
const sbBase=new Set(['417','430','431','530','556','559','577','578']),sbAccent=new Set(['423','532','534','536','545','547']);
const printedR2=new Set(['B Drive Frame Lower','A Drive Frame Lower','Cable Cover','adxl_mount_generic_15.5_hole_c-c','PCB_Spacer','XY Joint - Left','XY Joint - Right','XY Cable Chain Bridge - 2 Hole','D2F_Endstop_Pod','Z Motor Mount','DIN Clips','Octopus Bracket','PCB DIN Clip','Raspberry_Bracket','RS-25 PSU Bracket','LRS PSU Bracket','SSR Mount Bracket','WAGO_221-415_mount-3x5','LCD Case Front','LCD Case Rear','LCD Case Hinge','BTT_Knob_Light_Shield','Fan Grill A','Fan Grill B','Fan Grill Retainer','Keystone Blank','bottom_panel_clip_x4','Z_Belt_Cover_A','Z_Belt_Cover_B','Z Belt Cover A','Z Belt Cover B','Rear Cover','Exhaust Grill','60mm_exhaust_fan_grill']);
const accents=new Set(['Cable Cover','PCB_Spacer','XY Cable Chain Bridge - 2 Hole','D2F_Endstop_Pod','LCD Case Front','LCD Case Hinge','BTT_Knob_Light_Shield','Fan Grill A','Fan Grill B','Fan Grill Retainer','Keystone Blank','Rear Cover','Exhaust Grill','60mm_exhaust_fan_grill']);
// R2 assembly leaf names (Voron-2 a192410e). These printed parts had no
// appearance_role in the exported manifests. Restrict the repair to that CAD;
// LDO replacement aluminium, rail blocks, fans and optical diffusers stay fixed.
const v24PrintedBase=new Set(['Front Idler A Bottom','Front Idler A Top','Front Idler B Top','Front Idler B Bottom','Z Bearing Block Top','Z Bearing Block Bottom','Z Bearing Block Top HallEffect','Z Belt Drive A','Z Belt Drive B','PSU_Stabilizer','Middle_Fan_Support_','Middle_Fan_Support_ v1(Mirror)','bottom_panel_hinge_x2','Bowden Tube Holder']);
const v24PrintedAccent=new Set(['Z Belt Clamp Upper','Z Belt Clamp Lower','Belt Tensioner','Belt_Guard','Door Handle A','Door Handle B']);
// Micron R1 / RC8 native leaves matched to the author's STL library.
const micronBase=new Set(['A_Drive_Frame_Lower','A_Drive_Frame_Upper','B_Drive_Frame_Lower','B_Drive_Frame_Upper','AB_Drive_Top_Bearing_Retainer','Idler_Body','Bowden_Tube_Holder_Twist_Lock','Twist_Lock','TwistLock','Main Handle','Top Hinge Leaf','Bottom Hinge Leaf','Top Left Corner','Bottom Left Corner','Hinge Barrel','Spool_Holder_Bar','Bowden Tube Entry Rear ECAS','Octopus Bracket','Raspberry_Bracket','Front_Body','Tension_Arm','Rear_Plate','Board_Spacer_Micron','LED_Carrier','Light_Shield_Micron','PUG','M2_Hex_Adapter','180 M2 Hexnut adapter_shorter','Door Hinge']);
const micronAccent=new Set(['Toothed_Idler_Carrier','Toothed_Idler_Carrier_Pinned','Belt_Clamp_A','Belt_Clamp_B','Sensorless_Yendstop_plug','Keystone Blank','Bezel','Magnet Insert','Railstop','Thermistor Chain Anchor','PG9_Umbilical_Z_Chain_3_Hole','Extruder_Knob','Door_Latch','Handle_Mini-1']);
export function appearanceRole(part){
 if(!part)return null;const key=String(part.key),name=(part.name||'').replace(/(?:\s*\(\d+\)|\s+v\d+|:\d+)+$/g,'').trim();
 if(sbBase.has(key))return 'base';if(sbAccent.has(key))return 'accent';
 if(/^m(?:120(?:_head)?|180)_\d+$/.test(key)&&part.source?.repository==='PrintersForAnts/Micron'){
  if(micronBase.has(name))return 'base';if(micronAccent.has(name))return 'accent';
  if(['Rear_Gantry_Extrusion','X_Extrusion'].includes(name))return 'frame';
  if(name==='SOLID'){
   const path=(part.source.assembly_path||[]).join('/');
   if(/(?:CornerTwistLock|TwistLockCenter|DIN_Mount|Wago DIN Clip|WAGO_221-413_1515):?/.test(path))return /TwistLock/.test(path)?'accent':'base';
  }
 }
 if(/^fysetc_v24_250_pro_\d+$/.test(key)){
  if(/(?:^M\d+\b|Threaded Insert|Drop-in T-nut|Nylon Washer|^Motor$|^PCB$|^Heatsink$|^NEMA|^PRODUCT_NAME|^Rubber Foot)/i.test(name))return null;
  const nativeName=name.replace(/-\d+$/,'');if(printedR2.has(nativeName))return accents.has(nativeName)?'accent':'base';
  if(['B Drive Frame Upper','A Drive Frame Upper'].includes(nativeName))return 'base';
 }
 if(/^v24_\d+$/.test(key)&&printedR2.has(name))return accents.has(name)?'accent':'base';
 if(/^v24_\d+$/.test(key)&&!part.appearance_role){if(v24PrintedBase.has(name))return 'base';if(v24PrintedAccent.has(name))return 'accent';}
 if(/^(?:head|changer)_tap_sb_rods_/.test(key)&&['cable_cover','cable_cover_for_pcb'].includes(name))return 'base';
 return part.appearance_role||null;
}
