// Reviewed public author leaves. Never classify an assembly's descendants from
// its name or color: WS7040/axial-fan covers and nearby hardware stay purchased.
const crossantRevision='e9409a087233f3ec95354594fe9b9cd9357b4ac5';
const crossantLeaves=new Map([
 ['crossant_01030',['Cover',['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1','Cover:1']]],
 ['crossant_01040',['Spacer',['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1','Hardwares (3):1','Spacer:1']]],
 ['crossant_01042',['Spacer (2)',['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1','Hardwares (3):1','Spacer (2):1']]],
 ['crossant_01043',['Spacer (3)',['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1','Hardwares (3):1','Spacer (3):1']]],
 ['crossant_01044',['Spacer (1)',['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1','Hardwares (3):1','Spacer (1):1']]],
]);
// Crossant STLs/CPAP/WS7040/ws7040_housing_cover_x1.stl and spacer_x4.stl.
// VzBoT a7b1cdc7: Assemblies BOM and STL/Frame/STLs/2020 Endcap.stl.
// Generic numeric keys are meaningful only in this exact source assembly.
const vzbotLeaves=new Map([
 ['00229','endcap [printed]'],['00230','endcap [printed] (2)'],
 ['00231','endcap [printed] (7)'],['00232','endcap [printed] (5)'],
 ['00233','endcap [printed] (1)'],['00234','endcap [printed] (3)'],
 ['00235','endcap [printed] (4)'],['00236','endcap [printed] (6)'],
]);
export function sourcePrintedRole(manifest,part){
 if(!manifest||!part)return null;
 if(manifest.machine_id==='crossant_235_v06_leadscrew'){
  const leaf=crossantLeaves.get(part.key),source=part.source;
  if(leaf&&part.name===leaf[0]&&part.group==='Crossant_CPAP Housing'&&source?.repository==='Pole-Engineering/Crossant-235'&&source.commit===crossantRevision&&source.file==='CAD/Crossant V0.6.rar :: Crossant V0.6_.step'&&source.source_key===part.key.slice('crossant_'.length)&&Array.isArray(source.assembly_path)&&JSON.stringify(source.assembly_path)===JSON.stringify(leaf[1]))return 'base';
 }
 if(manifest.machine_id==='vzbot_330_printed'){
  const source=manifest.source;
  if(source?.repository==='https://github.com/VzBoT3D/VzBoT-Vz330'&&source.revision==='a7b1cdc7121c1d36c73704aa3c7d74c42bc0c959'&&source.path==='CAD/Full Printer/Vz-330_v1.2.zip'&&source.source_step_sha256==='68b5e77168f67ccbbc9a6f53397cec70bf1a54c6689446be282dd9588b9668a3'&&vzbotLeaves.has(part.key)&&vzbotLeaves.get(part.key)===part.name&&part.group==='fixed')return 'base';
 }
 return null;
}
export function sourcePrintedRecords(manifest){
 return new Map(manifest.parts.map(part=>{
  const role=sourcePrintedRole(manifest,part);
  return [part.key,role?{...part,appearance_role:role}:part];
 }));
}
