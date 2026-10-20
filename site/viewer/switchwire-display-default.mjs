// Original Switchwire v1 contains mutually exclusive front-display branches.
// Select the complete Mini12864 assembly without altering any source geometry.
const machine='voron_switchwire_250';
const revision='92cc013ca2af94e6c09950dbe05c0973ee49aa00';
const model='9db6a07660da8a4042121c3bec4fd7e6dcd8abcd750682dd9595c3a580d194e7';
const manifestSha='703f4a92ee026b6e1c4ef5603691e394aa8919b0755330d07a94775b09ca0dfc';
const profileSha='4045df6338cb419a7bba1eb5b28c34e9ccdb88ae19fa5aa9c0b55be65b20b074';
const miniKeys=Object.freeze([
 'sw_26e32f051873f3c7','sw_dfd93b28de24ccde','sw_479be0ece0dd948e',
 'sw_dc97bd0967956f1d','sw_05a4a65e13b76126','sw_38e5ea35e04ca373',
 'sw_b63ff06723c2e902','sw_9c82d7795fdce760','sw_2bf51982682dc729',
 'sw_fb13fad7d06ac7bb','sw_d99f12d8a3e36b87'
]);
const lcd2004Keys=Object.freeze([
 'sw_277ca5d1aae6346d','sw_5783ffc3a2e5947b','sw_30af65e243418e63',
 'sw_a0dcfdc5afb585fe','sw_57032dcf78ead7b4','sw_fe073facdfafd863',
 'sw_89be80f75e4cdda2','sw_c680e77a5fcf3781','sw_45ae7c85a2c66fb0'
]);
const blankKey='sw_087266894303ada5';
const fail=()=>{throw Error('Switchwire display selection does not match the checked source assembly')};
const same=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(k=>b.includes(k));
export function applySwitchwireDisplayDefault(manifest,profile,files){
 if(manifest.machine_id!==machine&&profile.machine_id!==machine)return {manifest,profile};
 if(manifest.machine_id!==machine||profile.machine_id!==machine
  ||manifest.source_revision!==revision||profile.source?.revision!==revision
  ||manifest.model_sha256!==model||files?.['model.glb']?.decoded_sha256!==model
  ||files?.['assembly_manifest.json']?.sha256!==manifestSha
  ||files?.['machine_profile.json']?.sha256!==profileSha
  ||manifest.native_leaf_count!==718||manifest.parts?.length!==718
  ||new Set(manifest.parts.map(p=>p.key)).size!==718)fail();
 const components=manifest.source_delivery?.component_decoded_sha256;
 if(!components||Object.keys(components).length!==11
  ||Object.entries(components).some(([name,sha])=>files?.[name]?.decoded_sha256!==sha))fail();
 const branch=name=>manifest.parts.filter(p=>p.path?.length>=3
  &&p.path[0]==='(Unsaved)'&&p.path[1]==='Front Grill:1'&&p.path[2]===name).map(p=>p.key);
 if(!same(branch('Mini12864 Case Assembly v2 v1:1'),miniKeys)
  ||!same(branch('2004 LCD Case:1'),lcd2004Keys)
  ||!same(branch('LCD blank:1'),[blankKey]))fail();
 const stock=profile.configurations?.stock;
 if(!stock||Object.keys(profile.configurations).join()!=='stock'
  ||stock.hidden_keys?.some(k=>miniKeys.includes(k)))fail();
 const hidden_keys=[...new Set([...(stock.hidden_keys||[]),...lcd2004Keys,blankKey])];
 return {manifest,profile:{...profile,configurations:{...profile.configurations,
  stock:{...stock,hidden_keys}}}};
}
