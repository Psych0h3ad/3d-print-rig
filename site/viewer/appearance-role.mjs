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
const micronAccent=new Set(['Toothed_Idler_Carrier','Toothed_Idler_Carrier_Pinned','Belt_Clamp_A','Belt_Clamp_B','Sensorless_Yendstop_plug','Keystone Blank','Bezel','Magnet Insert','Railstop','Thermistor Chain Anchor','PG9_Umbilical_Z_Chain_3_Hole','Extruder_Knob','Door_Latch','Handle_Mini-1','Front_Cover','Idler_Carrier','Idler_Carrier_Pinned','Printed_Spacer','Mounting_Cover_A','Mounting_Cover_B','Z_Belt_Cover_A','Z_Belt_Cover_B','Mount_Base']);
// Voron-Trident a8628f48: exported leaf + exact owning source component.
// Anonymous SOLID/COMPOUND names and hardware words are not sufficient roles.
// Bind each printed leaf separately; purchased siblings keep their materials.
const tridentPrintedLeaves=new Map([
 ["568",["z_rear_insert_3hole","Z Assembly:1/Z_Rear:1/Z_Rear_Printed:1/z_rear_insert_3hole:1","base"]],
 ["650",["z_endstop","Z Assembly:1/Z Endstop Assembly:1/z_endstop:1","base"]],
 ["722",["z_stepper_left","Z Assembly:1/Z_Motors:1/Z_Stepper_Left:1/Z_Mount_Left_Printed:1/z_stepper_left:1","base"]],
 ["737",["z_stepper_right","Z Assembly:1/Z_Motors:1/Z_Stepper_Right:1/Z_Stepper_Right_Printed:1/z_stepper_right:1","base"]],
 ["742",["z_stepper_rear","Z Assembly:1/Z_Motors:1/Z_Stepper_Rear:1/Z_Stepper_Rear_Printed:1/z_stepper_rear:1","base"]],
 ["831",["COMPOUND","Skirt:1/Front:1/Mini12864 Assembly:1/LCD Case Front:1/=>[0:1:1:451]","base"]],
 ["832",["LCD Case Rear","Skirt:1/Front:1/Mini12864 Assembly:1/LCD Case Rear:1","base"]],
 ["837",["BTT_Knob_Light_Shield","Skirt:1/Front:1/Mini12864 Assembly:1/BTT_Knob_Light_Shield:1","accent"]],
 ["904",["side_fan_support_x2","Skirt:1/Side_Skirt_No_Fan:1/Side Fan Support:1/side_fan_support_x2:1","base"]],
 ["925",["side_fan_support_x2","Skirt:1/Side_Skirt_Fan:1/Side Fan Support:2/side_fan_support_x2:1","base"]],
 ["953",["SOLID","Electronics:1/Controllers:1/Octopus:1/DIN Clip:2/=>[0:1:1:525]","base"]],
 ["956",["SOLID","Electronics:1/Controllers:1/Octopus:1/DIN Clip:3/=>[0:1:1:527]","base"]],
 ["965",["SOLID","Electronics:1/Pi Assembly:1/DIN Clip:1/=>[0:1:1:532]","base"]],
 ["977",["SOLID","Electronics:1/Meanwell LRS-200-24:1/PSU_Stabilizer:1/=>[0:1:1:540]","base"]],
 ["980",["SOLID","Electronics:1/Meanwell LRS-200-24:1/LRS PSU Bracket:1/=>[0:1:1:542]","base"]],
 ["983",["SOLID","Electronics:1/Meanwell LRS-200-24:1/LRS PSU Bracket:2/=>[0:1:1:544]","base"]],
 ["998",["SOLID","Electronics:1/DIN_Mount:1/=>[0:1:1:554]","base"]],
 ["1000",["SOLID","Electronics:1/DIN_Center_Support:1/=>[0:1:1:557]","base"]],
 ["1006",["SOLID","Electronics:1/3x WAGO_221-415_mount:1/=>[0:1:1:560]","base"]],
 ["1011",["SOLID","Electronics:1/DIN_Mount:2/=>[0:1:1:562]","base"]],
 ["1016",["SOLID","Electronics:1/DIN_Mount:3/=>[0:1:1:564]","base"]],
 ["1021",["SOLID","Electronics:1/DIN_Mount:4/=>[0:1:1:566]","base"]],
 ["1024",["SOLID","Electronics:1/DIN_Center_Support:2/=>[0:1:1:557]","base"]],
 ["1046",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:1","base"]],
 ["1047",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:2","base"]],
 ["1048",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:3","base"]],
 ["1049",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:4","base"]],
 ["1050",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:6","base"]],
 ["1051",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:7","base"]],
 ["1052",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:9","base"]],
 ["1053",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:10","base"]],
 ["1054",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:11","base"]],
 ["1055",["Cable Frame Anchor","Frame:1/Cable Frame Anchors:1/Cable Frame Anchor:8","base"]],
 ["1194",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Corner Clip 6mm:5/=>[0:1:1:608]","base"]],
 ["1199",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Corner Clip 6mm:6/=>[0:1:1:610]","base"]],
 ["1202",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Midspan Clip 6mm:6/=>[0:1:1:612]","base"]],
 ["1207",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Corner Clip 6mm:7/=>[0:1:1:614]","base"]],
 ["1210",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Midspan Clip 6mm:7/=>[0:1:1:616]","base"]],
 ["1213",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Midspan Clip 6mm:8/=>[0:1:1:618]","base"]],
 ["1218",["SOLID","Panels:1/Opaque Panels:1/Rear Panel:1/Corner Clip 6mm:8/=>[0:1:1:620]","base"]],
 ["1222",["SOLID","Panels:1/Transparent Panels:1/Front Door Right:1/Door Handle A:2/=>[0:1:1:627]","base"]],
 ["1229",["SOLID","Panels:1/Transparent Panels:1/Front Door Right:1/Door Handle B:2/=>[0:1:1:632]","base"]],
 ["1241",["SOLID","Panels:1/Transparent Panels:1/Front Door Left:1/Door Handle A:1/=>[0:1:1:638]","base"]],
 ["1244",["SOLID","Panels:1/Transparent Panels:1/Front Door Left:1/Door Handle B:1/=>[0:1:1:640]","base"]],
 ["1263",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Corner Clip 6mm:1/=>[0:1:1:647]","base"]],
 ["1266",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Midspan Clip 6mm:1/=>[0:1:1:649]","base"]],
 ["1271",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Corner Clip 6mm:2/=>[0:1:1:651]","base"]],
 ["1276",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Corner Clip 6mm:3/=>[0:1:1:653]","base"]],
 ["1281",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Corner Clip 6mm:4/=>[0:1:1:655]","base"]],
 ["1284",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Midspan Clip 6mm:2/=>[0:1:1:657]","base"]],
 ["1287",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Midspan Clip 6mm:3/=>[0:1:1:659]","base"]],
 ["1290",["SOLID","Panels:1/Transparent Panels:1/Side Panel:1/Midspan Clip 6mm:4/=>[0:1:1:661]","base"]],
 ["1297",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Corner Clip 6mm:1/=>[0:1:1:665]","base"]],
 ["1300",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Midspan Clip 6mm:1/=>[0:1:1:667]","base"]],
 ["1305",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Corner Clip 6mm:2/=>[0:1:1:669]","base"]],
 ["1310",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Corner Clip 6mm:3/=>[0:1:1:671]","base"]],
 ["1315",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Corner Clip 6mm:4/=>[0:1:1:673]","base"]],
 ["1318",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Midspan Clip 6mm:2/=>[0:1:1:675]","base"]],
 ["1321",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Midspan Clip 6mm:3/=>[0:1:1:677]","base"]],
 ["1324",["SOLID","Panels:1/Transparent Panels:1/Side Panel:2/Midspan Clip 6mm:4/=>[0:1:1:679]","base"]],
 ["1331",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Corner Clip 6mm:9/=>[0:1:1:684]","base"]],
 ["1334",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Midspan Clip 6mm:9/=>[0:1:1:686]","base"]],
 ["1339",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Corner Clip 6mm:10/=>[0:1:1:688]","base"]],
 ["1342",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Midspan Clip 6mm:10/=>[0:1:1:690]","base"]],
 ["1347",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Corner Clip 6mm:11/=>[0:1:1:692]","base"]],
 ["1350",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Midspan Clip 6mm:11/=>[0:1:1:694]","base"]],
 ["1353",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Midspan Clip 6mm:12/=>[0:1:1:696]","base"]],
 ["1358",["SOLID","Panels:1/Transparent Panels:1/Top Panel:1/Corner Clip 6mm:12/=>[0:1:1:698]","base"]],
 ["1362",["SOLID","Panels:1/Deck_Wire_Cover_Left:1/=>[0:1:1:701]","base"]],
 ["1365",["SOLID","Panels:1/Deck_Wire_Cover_Right:1/=>[0:1:1:703]","base"]],
 ["1370",["SOLID","Panels:1/Door Latch Top:1/=>[0:1:1:705]","base"]],
 ["1375",["SOLID","Panels:1/Door Latch Bottom:1/=>[0:1:1:707]","base"]],
 ["1376",["Deck Support","Panels:1/Deck Supports:1/Deck Support:1","base"]],
 ["1377",["Deck Support","Panels:1/Deck Supports:1/Deck Support:2","base"]],
 ["1378",["Deck Support","Panels:1/Deck Supports:1/Deck Support:3","base"]],
 ["1379",["Deck Support","Panels:1/Deck Supports:1/Deck Support:4","base"]],
 ["1380",["Deck Support","Panels:1/Deck Supports:1/Deck Support:5","base"]],
 ["1381",["Deck Support","Panels:1/Deck Supports:1/Deck Support:6","base"]],
 ["1393",["PTFE_Holder","Filament_Path:1/PTFE Holder:1/PTFE_Holder_Printed:1/PTFE_Holder:1","base"]],
]);
export function appearanceRole(part){
 if(!part)return null;const key=String(part.key),name=(part.name||'').trim().replace(/(?:\s*\(\d+\)|\s+v\d+|:\d+)+$/g,'').trim();
 if(sbBase.has(key))return 'base';if(sbAccent.has(key))return 'accent';
 if(/^m(?:120(?:_head)?|180)_\d+$/.test(key)&&part.source?.repository==='PrintersForAnts/Micron'){
  const path=(part.source.assembly_path||[]).join('/');
  // Ancestor names such as Idler_Printed and PSU ... mount also contain
  // purchased hardware. They cannot make every descendant a printed part.
  if(/ECAS_Fitting|KGLM-3 Spherical Bearing|Meanwell-UHP-200-24|JR Mains Inlet/.test(path))return null;
  if(['Nema14_Motor_Mount','Nema17_Motor_Mount','M2_Hex_Adapter','M2_Hex_Adapter_Parametric'].includes(name))return 'base';
  if(/^(?:M\d+(?:\b|x|_)|MGN\d|Nema|36STH|Rubber Foot|Diffuser_Micron|PG9_Gland)/i.test(name))return null;
  if(name==='Toothed_Idler')return /Idler_Printed/.test(path)?'accent':null;
  if(micronBase.has(name))return 'base';if(micronAccent.has(name))return 'accent';
  if(['Rear_Gantry_Extrusion','X_Extrusion'].includes(name))return 'frame';
  if(['SOLID','COMPOUND'].includes(name)){
   // Original 120 R1 source leaves; the author's [a]_railstops_x8 STL.
   // Pin the leaf identity as well as its direct owning component; a
   // purchased descendant beneath a printed assembly is not printed.
   if(name==='SOLID'&&part.source.commit==='f76aa28767211ddfee2e30290aadcea3c45f8513'&&part.source.cache_machine==='micron_r1_120'&&['00345','00348','00376','00379','00407','00410','00438','00441'].includes(part.source.source_key)&&/^m120_/.test(key)&&/^Railstops v3:[12]$/.test(part.source.assembly_path.at(-2)||''))return 'accent';
   if(/CenterPanelClip|CornerPanelClip|reverseBowdenEntry|\/Handles:/.test(path))return 'base';
   if(/64T Front Pulley Gear|Toothed_Idler_Carrier/.test(path))return 'accent';
   if(/(?:CornerTwistLock|TwistLockCenter|DIN_Mount|Wago DIN Clip|WAGO_221-413_1515):?/.test(path))return /TwistLock/.test(path)?'accent':'base';
  }
 }
 if(/^fysetc_v24_250_pro_\d+$/.test(key)){
  if(/(?:^M\d+\b|Threaded Insert|Drop-in T-nut|Nylon Washer|^Motor$|^PCB$|^Heatsink$|^NEMA|^PRODUCT_NAME|^Rubber Foot)/i.test(name))return null;
  const nativeName=name.replace(/-\d+$/,'');if(printedR2.has(nativeName))return accents.has(nativeName)?'accent':'base';
  if(['B Drive Frame Upper','A Drive Frame Upper'].includes(nativeName))return 'base';
 }
 if(/^v24_\d+$/.test(key)&&printedR2.has(name))return accents.has(name)?'accent':'base';
 const tridentLeaf=key.match(/^voron_trident_(?:250|300|350)_base_(\d+)$/)?.[1],trident=tridentPrintedLeaves.get(tridentLeaf);
 if(trident&&part.source_leaf===tridentLeaf&&part.name===trident[0]&&part.source_component===trident[1])return trident[2];
 if(/^voron_trident_(250|300|350)_base_1396$/.test(key)&&name==='Exhaust Grill'&&/PTFE_Plate_Printed:1\/Exhaust Grill/.test(part.source_component||''))return 'accent';
 // a192410e native spool-holder body; its PTFE liners and fasteners are
 // separate leaves. Never infer printing from the Spool Holder ancestor.
 if(key==='v24_01392'&&name==='SOLID'&&part.source?.repository==='VoronDesign/Voron-2'&&part.source.commit==='a192410e27ea345644ae5c4b29b4c9c40cbe1a73'&&part.source.source_key==='01392'&&part.source_path?.join('/')==='(Unsaved)/Spool Holder:1/=>[0:1:1:1535]')return 'base';
 if(/^v24_\d+$/.test(key)&&!part.appearance_role){if(v24PrintedBase.has(name))return 'base';if(v24PrintedAccent.has(name))return 'accent';}
 if(/^(?:head|changer)_tap_sb_rods_/.test(key)&&['cable_cover','cable_cover_for_pcb'].includes(name))return 'base';
 return part.appearance_role||null;
}
