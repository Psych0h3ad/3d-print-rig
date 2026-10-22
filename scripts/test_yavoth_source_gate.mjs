// Source/algorithm fixtures. The mandatory build job separately loads real GLBs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {readAuthorSTL,projectAuthorSTL,assertExportMatrix,assertAuthorTriangles,assertCowlMetadata,yavothCowls,yavothRevision} from './yavoth-cowl-identity.mjs';
import {assertYavothExactExportedCompanions,yavothRequiredExportKeys} from './yavoth-exact-companions.mjs';
import {expectedStandaloneYavothIds,assertYavothCoverage} from './audit_yavoth_source_assets.mjs';
import {importedVariant} from '../site/viewer/configuration-model.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],cases=[];
const check=(name,fn)=>{fn();cases.push(name);};
const reject=(name,fn,pattern)=>check(name,()=>assert.throws(fn,pattern));
function binarySTL(p){const b=Buffer.alloc(84+p.length/9*50);b.writeUInt32LE(p.length/9,80);for(let t=0;t<p.length/9;t++)for(let i=0;i<9;i++)b.writeFloatLE(p[t*9+i],84+t*50+12+i*4);return b;}
const trianglePositions=[0,0,0, 1,0,0, 0,1,0, 0,0,0, 0,1,0, 0,0,1, .25,.25,.25, .5,.25,.25, .25,.5,.25];
const sourceBytes=binarySTL(trianglePositions),source=readAuthorSTL(sourceBytes);
const geometry=p=>({attributes:{position:{array:new Float32Array(p),itemSize:3,count:p.length/3}},drawRange:{start:0,count:Infinity}});
check('complete oriented source roundtrip',()=>assert.equal(assertAuthorTriangles(source,geometry(projectAuthorSTL(source,identity)),identity).triangles,3));
check('reordered triangles and cyclic vertices retain source',()=>{
 const p=trianglePositions,g=geometry([...p.slice(12,18),...p.slice(9,12),...p.slice(18),...p.slice(0,9)]);assertAuthorTriangles(source,g,identity);
});
reject('same bounds but wrong interior cowl',()=>{const g=geometry(trianglePositions);g.attributes.position.array[18]=.375;assertAuthorTriangles(source,g,identity);},/differs/);
reject('missing final author triangle',()=>assertAuthorTriangles(source,geometry(trianglePositions.slice(0,-9)),identity),/triangle count/);
reject('duplicate triangle replacing genuine interior',()=>assertAuthorTriangles(source,geometry([...trianglePositions.slice(0,18),...trianglePositions.slice(0,9)]),identity),/differs/);
reject('reversed material-side triangle winding',()=>{const p=[...trianglePositions];p.splice(3,6,...trianglePositions.slice(6,9),...trianglePositions.slice(3,6));assertAuthorTriangles(source,geometry(p),identity);},/differs/);
reject('clipped cowl draw range',()=>{const g=geometry(trianglePositions);g.drawRange.count=6;assertAuthorTriangles(source,g,identity);},/clipped/);
reject('material group hides complete author triangles',()=>{const g=geometry(trianglePositions);g.groups=[{start:0,count:6,materialIndex:0}];assertAuthorTriangles(source,g,identity);},/clip/);
reject('material groups duplicate and omit source triangles',()=>{const g=geometry(trianglePositions);g.groups=[{start:0,count:6,materialIndex:0},{start:3,count:3,materialIndex:0}];assertAuthorTriangles(source,g,identity);},/overlap/);
reject('extra unused source-position buffer',()=>{const g=geometry([...trianglePositions,2,2,2]);g.index={array:new Uint16Array([0,1,2,3,4,5,6,7,8]),count:9};assertAuthorTriangles(source,g,identity);},/Unused/);
reject('nonfinite complete cowl buffer',()=>{const g=geometry(trianglePositions);g.attributes.position.array[3]=NaN;assertAuthorTriangles(source,g,identity);},/Nonfinite/);
reject('corrupt STL triangle count',()=>{const b=Buffer.from(sourceBytes);b.writeUInt32LE(20,80);readAuthorSTL(b);},/Incomplete/);
reject('incomplete source STL',()=>readAuthorSTL(sourceBytes.subarray(0,-1)),/Incomplete/);
reject('trailing source STL bytes',()=>readAuthorSTL(Buffer.concat([sourceBytes,Buffer.from([1])])),/trailing/);
reject('source witness cannot shear geometry',()=>{const m=[...identity];m[4]=.1;assertExportMatrix(m);},/Nonrigid/);
reject('source witness cannot mirror geometry',()=>{const m=[...identity];m[0]=-1;assertExportMatrix(m);},/Reflected/);
reject('source witness cannot relabel source-file hash',()=>readAuthorSTL(sourceBytes,Object.values(yavothCowls)[0]),/byte count/);

for(const [id,rule]of Object.entries(yavothCowls)){
 const asset={meta:{source_commit:yavothRevision,source_files:[{path:rule.path,sha256:rule.sha256}],selected_source_keys:[rule.source],parts:[{key:id+'_'+rule.alias,name:rule.name,source_key:rule.source}]}};
 check('stable API alias differs from genuine occurrence '+rule.alias,()=>assertCowlMetadata(id,asset));
 reject('standard/Revo source key rejected '+rule.alias,()=>assertCowlMetadata(id,{meta:{...asset.meta,parts:[{...asset.meta.parts[0],source_key:rule.alias}]}}),/occurrence/);
 reject('numeric source-only rebinding rejected '+rule.alias,()=>assertCowlMetadata(id,{meta:{...asset.meta,parts:[{...asset.meta.parts[0],name:'Yavoth_Cowl (Revo):1'}]}}),/source-specific/);
 reject('preferred author source omitted '+rule.alias,()=>assertCowlMetadata(id,{meta:{...asset.meta,source_files:[]}}),/preferred/);
 reject('legacy alias not mistaken for selected original occurrence '+rule.alias,()=>assertCowlMetadata(id,{meta:{...asset.meta,selected_source_keys:[rule.alias]}}),/occurrences/);
}

const base='head_print_yavoth_sherpa_mini_rapido2_uhf_rear5';
const variant={id:'yavoth59__sherpa_mini__rapido1_uhf__6__rear5',toolhead:'yavoth',hardware_assembled:true,hotend:'rapido1_uhf',extruder:'sherpa_r2_standard_short',cooling:'rear5',belt_width_mm:6,base_asset:base};
function fixture(){
 return [base,'yavoth59_fan2510','yavoth59_fans_uhf','yavoth59_sherpa_mini','yavoth59_rapido1_uhf','yavoth59_carriage_6'].map(id=>{
  const root={visible:true,parent:null},entries=yavothRequiredExportKeys(id).map(key=>({key,mesh:{visible:true,parent:root,geometry:geometry(trianglePositions)}}));
  const parts=entries.map(e=>({key:e.key,name:e.key,source_key:e.key.split('_').at(-1)}));
  if(id===base){Object.assign(parts[0],{name:'Yavoth_Cowl_UHF_5mm (1):1',source_key:'22'});parts[1].name='LED_Holder_UHF:1';parts[2].name='LED_Insert:1';}
  const rule=yavothCowls[id];
  return [id,{root,entries,meta:{parts,source_commit:yavothRevision,selected_source_keys:parts.map(p=>p.source_key),source_files:rule?[{path:rule.path,sha256:rule.sha256}]:[]}}];
 });
}
check('all exact companion owners including source LED once',()=>assertYavothExactExportedCompanions(variant,fixture()));
reject('one genuine heater/nozzle leaf missing',()=>{const a=fixture();a.find(([id])=>id==='yavoth59_rapido1_uhf')[1].entries.pop();assertYavothExactExportedCompanions(variant,a);},/source leaf/);
reject('required leaf hidden below its owner',()=>{const a=fixture();a[2][1].entries[0].mesh.visible=false;assertYavothExactExportedCompanions(variant,a);},/hidden/);
reject('companion detached from movement owner',()=>{const a=fixture();a[2][1].entries[0].mesh.parent={visible:true,parent:null};assertYavothExactExportedCompanions(variant,a);},/detached/);
reject('missing LED insert',()=>{const a=fixture();a[0][1].entries.pop();assertYavothExactExportedCompanions(variant,a);},/source leaf/);
reject('duplicate LED leaf',()=>{const a=fixture();a[0][1].entries.push(a[0][1].entries[2]);assertYavothExactExportedCompanions(variant,a);},/source leaf/);
reject('obsolete cowl module still visible',()=>{const a=fixture();a.push(['obsolete-cowl',a[0][1]]);assertYavothExactExportedCompanions(variant,a);},/obsolete/);
reject('wrong HF companion selected for UHF',()=>assertYavothExactExportedCompanions({...variant,hotend:'rapido1_hf'},fixture()),/source-specific/);

check('configuration ID JSON save/load roundtrip',()=>{const catalog={machine_id:'source-fixture',variants:[variant]};const saved=JSON.parse(JSON.stringify({machine:catalog.machine_id,configuration:variant.id}));assert.equal(importedVariant(catalog,saved),variant);});
reject('configuration load cannot silently select missing source',()=>importedVariant({machine_id:'source-fixture',variants:[variant]},{machine:'source-fixture',configuration:'obsolete'}),/CAD/);
check('source scope has 16 assembled and 18 archive IDs',()=>assert.equal(expectedStandaloneYavothIds().length,34));
reject('lost standalone/archived consumer rejected',()=>assertYavothCoverage([{machine:'standalone',plans:[]}],expectedStandaloneYavothIds().map(id=>({id,toolhead:'yavoth'}))),/omitted/);

const build=await fs.readFile(new URL('./build_site.py',import.meta.url),'utf8');
check('actual audit required by build before publication',()=>assert.match(build,/subprocess\.run\(\['node'[\s\S]*audit_yavoth_source_assets\.mjs[\s\S]*cwd=ROOT, check=True/));
const runner=await fs.readFile(new URL('./check_machine_regressions.py',import.meta.url),'utf8');
check('check_repository runner discovers permanent source test',()=>assert(runner.includes("glob('test_*.mjs')")));
check('reviewed source-only fixture covers all three actual cowls',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/yavoth-author-cowls.json',import.meta.url),'utf8'));
 assert.equal(fixture.schema,'yavoth-reviewed-author-cowls-v2');assert.equal(fixture.source_revision,yavothRevision);
 assert.deepEqual(Object.keys(fixture.modules).sort(),Object.keys(yavothCowls).sort());
 for(const [id,row]of Object.entries(fixture.modules)){assert.equal(row.author_stl_sha256,yavothCowls[id].sha256);assert.equal(row.triangles,9214);for(const k of ['position','normal','index'])assert.match(row.complete_buffers[k].sha256,/^[0-9a-f]{64}$/);}
});
export const yavothSourceGateUnitReport={passed:true,cases,scope:'Source/algorithm fixtures only; actual GLB/native mounting/browser claims are separate'};
console.log(JSON.stringify({test:'yavoth_source_gate',passed:true,cases:cases.length,actual_assets_tested:false}));
