// Independent release expectations; never derive these from the runtime role
// resolver. Refreshing transport pins requires another source/actual-leaf review.
import assert from 'node:assert/strict';
export const printedColorSourceContracts={
 crossant_235_v06_leadscrew:{
  manifest_sha256:'61e331947831414f3dd126d087feb21722eec6ee0491f121310dcc8a044e4912',
  model_sha256:'f4e560da3b9f8274b508dfc6d9e846ebc5c9e147fccbd16a63c771fba3c13de5',parts:2177,
  source_repository:'Pole-Engineering/Crossant-235',source_revision:'e9409a087233f3ec95354594fe9b9cd9357b4ac5',
  printed:{crossant_01030:'Cover',crossant_01040:'Spacer',crossant_01042:'Spacer (2)',crossant_01043:'Spacer (3)',crossant_01044:'Spacer (1)'},
  author_stls:[
   {path:'STLs/CPAP/WS7040/ws7040_housing_cover_x1.stl',git_blob_sha1:'bb7f61f87f95c1cba68f4bb0094e062197042884'},
   {path:'STLs/CPAP/WS7040/spacer_x4.stl',git_blob_sha1:'aecce52e807498c8298ab9a0bcc6056d5f6b0655'},
  ],
 },
 vzbot_330_printed:{
  manifest_sha256:'c287d2108da5ee2e7c99d906faf28be264e433f2d99b10bb3dd7dea4ea771cb5',
  model_sha256:'04ca850e7ce000b44db73a35058d036e4c537a7b715486172d527a926f93756c',parts:2872,
  source_repository:'https://github.com/VzBoT3D/VzBoT-Vz330',source_revision:'a7b1cdc7121c1d36c73704aa3c7d74c42bc0c959',
  printed:{'00229':'endcap [printed]','00230':'endcap [printed] (2)','00231':'endcap [printed] (7)','00232':'endcap [printed] (5)','00233':'endcap [printed] (1)','00234':'endcap [printed] (3)','00235':'endcap [printed] (4)','00236':'endcap [printed] (6)','00250':'Handle (3)','00253':'SOLID'},
  purchased:{'00251':{name:'m4 10mm bolt',role:'metal'},'00252':{name:'m4 10mm bolt',role:'metal'}},
  author_stls:[{path:'Assemblies BOM and STL/Frame/STLs/2020 Endcap.stl',git_blob_sha1:'22005c77467a9deeafe2f655e23a11c90859e139'},
   {path:'Assemblies BOM and STL/Frame/STLs/handle.stl',git_blob_sha1:'d18ee7f06afd2c1d69817c106af2ca8cbd573bb1',sha256:'d7ae6b29d13b9e74271c2d5646786591be9373033cbaa769e0c8f058c8685dfa'}],
  author_instructions:{path:'Build guide-manual/Mellow Kit/README.md',git_blob_sha1:'32ca7b098d87a493de13870ad76a7495d4115d4e',section:'What do I need to print? / Frame'},
 },
};
export function assertPrintedColorSourceRegistrations(machines){
 const actual=machines.filter(m=>m.available!==false&&['crossant','vzbot'].includes(m.family)).map(m=>m.id).sort();
 assert.deepEqual(actual,Object.keys(printedColorSourceContracts).sort(),'Every registered Crossant/VzBot needs a reviewed source color contract');
}
export function assertPrintedColorSourceCoverage(assets){
 const ids=assets.map(a=>a.id);
 assert.equal(new Set(ids).size,ids.length,'Duplicate actual machine in source color gate');
 for(const id of Object.keys(printedColorSourceContracts))assert(ids.includes(id),'Missing actual source color gate machine '+id);
}
export function assertPrintedColorSourceAsset(id,manifestHash,modelHash,manifest){
 const contract=printedColorSourceContracts[id];assert(contract,'Unreviewed source color asset '+id);
 assert.equal(manifestHash,contract.manifest_sha256,id+' manifest changed: repeat source leaf review');
 assert.equal(modelHash,contract.model_sha256,id+' model changed: repeat actual material review');
 assert.equal(manifest.machine_id,id);assert.equal(manifest.parts.length,contract.parts,id+' changed source census');
 const parts=new Map(manifest.parts.map(p=>[p.key,p]));
 assert.equal(parts.size,contract.parts,id+' duplicate source leaf');
 for(const [key,name]of Object.entries(contract.printed))assert.equal(parts.get(key)?.name,name,id+' missing original printed leaf '+key);
 for(const [key,expected]of Object.entries(contract.purchased||{})){
  assert.equal(parts.get(key)?.name,expected.name,id+' missing original purchased leaf '+key);
  assert.equal(parts.get(key)?.appearance_role,expected.role,id+' purchased source role changed '+key);
 }
 return contract;
}
