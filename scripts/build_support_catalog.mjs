import {augmentTrinityAlphaHosts,TRINITY_ALPHA_HOST_SOURCE} from '../site/viewer/trinity-alpha-host-extensions.mjs';
import {augmentTrinitySiboorR2,TRINITY_SIBOOR_SOURCE,assertSiboorIndexInput} from '../site/viewer/trinity-alpha-siboor-r2.mjs';
import {augmentTrinityAlpha,TRINITY_ALPHA_SOURCE} from '../site/viewer/trinity-alpha-installation.mjs';
// The support index uses the same exported catalogs and composition functions
// as the viewer. Missing inputs fail the build, never become 'unsupported'.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {machineChoices} from '../site/viewer/machines.js';
import {collections,headBuilderDimensions,catalogDimensions} from '../site/viewer/configuration-model.js';
import {expandedPrinterCatalog,v24HeadCatalog} from '../site/viewer/machine-head-model.mjs';
import {withEmbeddedBoards,xolEmbeddedBoard,sbEmbeddedBoard} from '../site/viewer/embedded-boards.mjs';
import {withMonolithMachines} from '../site/viewer/monolith-machine-model.mjs';
import {monolithHeadCatalog} from '../site/viewer/monolith-head-model.mjs';
import {v0Slots,validateV0Mods} from '../site/viewer/v0-installations.mjs';
import {bankChoices,bankCapacity,bankSpec} from '../site/viewer/changer-bank-model.mjs';
import {sizedSiboorCatalog,registerSizedSiboor} from '../site/viewer/siboor-catalog.mjs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {withInternalSpool,INTERNAL_SPOOL_CATALOG} from '../site/viewer/internal-spool.mjs';
import {mergeRequestedMods} from '../site/viewer/requested-mods.mjs';

export function enumerateV0(registry){
 const dimensions=v0Slots.map(([id])=>id),options=Object.fromEntries(dimensions.map(d=>[d,[{id:'stock',label:d==='toolhead'?'Mini Stealthburner / BMG / Revo Voron':'純正'},...(d==='accelerometer'?[{id:'none',label:'なし'}]:[]),...registry.options.filter(o=>o.slot===d&&o.id!=='stock').map(o=>({id:o.id,label:o.label}))]]));
 const variants=[];
 function visit(i,state){if(i===dimensions.length){try{validateV0Mods(registry,state);variants.push({...state,id:dimensions.map(k=>state[k]).join('__')})}catch{}return}const key=dimensions[i];for(const o of options[key])visit(i+1,{...state,[key]:o.id})}
 visit(0,{});return {dimensions,options,variants};
}
export function buildSupport(root){
 const input_sha256={};
 const read=name=>{const bytes=fs.readFileSync(path.join(root,name));input_sha256[name]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes)};
 const raw=read('TOOLHEAD_CONFIGURATIONS.json'),registry=read('MACHINE_HEAD_REGISTRATIONS.json'),gantries=read('GANTRY_CONFIGURATIONS.json'),mounts=read('MONOLITH_MACHINE_REGISTRATIONS.json'),bank=read('TOOLCHANGER_BANK.json'),v0=read('V0_INSTALLATIONS.json'),library=read('COMPONENT_LIBRARY.json'),mods=read('MACHINE_MODS.json');
 const siboor=read('SIBOOR_TRIDENT_ASSETS.json');registerSizedSiboor(siboor,registry,bank,mods);
 const internalSpool=read(INTERNAL_SPOOL_CATALOG);
 const requestedMods=read('REQUESTED_MOD_INSTALLATIONS.json');
 const community=read('COMMUNITY_INSTALLATIONS.json');
 const heads=withEmbeddedBoards(withHeadAdditions(raw,read('HEAD_ADDITIONS.json')),[xolEmbeddedBoard(read(raw.base_assets.xol.meta)),sbEmbeddedBoard(read(raw.base_assets.stealthburner.meta))]);heads.dimensions=headBuilderDimensions;
 const alpha=read(TRINITY_ALPHA_SOURCE.file);if(input_sha256[TRINITY_ALPHA_SOURCE.file]!==TRINITY_ALPHA_SOURCE.sha256)throw Error('Trinity alpha support sidecar hash mismatch');augmentTrinityAlpha({heads,registry},null,alpha,input_sha256['MACHINE_HEAD_REGISTRATIONS.json']);
 const alphaHosts=read(TRINITY_ALPHA_HOST_SOURCE.file);if(input_sha256[TRINITY_ALPHA_HOST_SOURCE.file]!==TRINITY_ALPHA_HOST_SOURCE.sha256)throw Error('Trinity alpha support host-sidecar hash mismatch');augmentTrinityAlphaHosts({heads,registry},alphaHosts,input_sha256['MACHINE_HEAD_REGISTRATIONS.json']);
 assertSiboorIndexInput(input_sha256['SIBOOR_TRIDENT_ASSETS.json']);
 const siboorAlpha=read(TRINITY_SIBOOR_SOURCE.file);if(input_sha256[TRINITY_SIBOOR_SOURCE.file]!==TRINITY_SIBOOR_SOURCE.sha256)throw Error('Trinity SIBOOR support sidecar checksum mismatch');augmentTrinitySiboorR2({heads,registry},siboorAlpha,input_sha256['MACHINE_HEAD_REGISTRATIONS.json']);
 const targets=[],details=new Map();
 function compact(target,catalog){
  const dimensions=catalogDimensions(catalog),options=catalog.options||Object.fromEntries(dimensions.map(d=>[d,(catalog[collections[d]]||[]).map(o=>({id:o.id,label:o.label.replace(/^VT \/ /,'Trident / ').replace(/^V2 \/ /,'VORON V2.4 / ').replace('sheet_metal','板金').replace('printed','プリント')}))]));
  const notes=[],noteMap=new Map();
  function noteIndex(v){const text=JSON.stringify(v.notes||[]);if(!noteMap.has(text)){noteMap.set(text,notes.length);notes.push(v.notes||[])}return noteMap.get(text)}
  const idParts=[],partIndex=new Map();
  const encodeId=id=>id.split('__').map(part=>{if(!partIndex.has(part)){partIndex.set(part,idParts.length);idParts.push(part)}return partIndex.get(part)});
  const rows=catalog.variants.map(v=>[encodeId(v.id),...dimensions.map(d=>{const i=options[d].findIndex(o=>o.id===v[d]);if(i<0)throw Error(`Unknown option ${target.id}/${d}/${v[d]}`);return i}),noteIndex(v)]);
  target.count=rows.length;target.heads=options.toolhead?.filter(o=>catalog.variants.some(v=>v.toolhead===o.id)).map(o=>o.id)||[];
  target.file=target.id+'.json';
  details.set(target.file,{schema:1,id:target.id,kind:target.kind,page:target.page,dimensions,options,idParts,rows,notes,
   accessories:(catalog.accessories||[]).map(o=>({id:o.id,label:o.label,label_id:o.label_id,notes:o.notes,notice_id:o.notice_id,exclusive_group:o.exclusive_group,gantry_ids:o.gantry_ids,compatible_selection:o.compatible_selection})),
   banks:target.kind==='machine'?catalog.gantries.flatMap(g=>['stealthchanger','indx','madmax'].map(system=>({gantry:g.id,system,permitted:bankSpec(bank,system)?.machines[target.id]?.bank_permitted!==false,capacity:bankCapacity(bank,target.id,system),choices:bankChoices(catalog,bank,g.id,system).length}))).filter(r=>catalog.variants.some(v=>v.gantry===r.gantry&&(r.system==='indx'?v.toolhead==='indx':v.mount===r.system))):[]});
 }
 for(const m of machineChoices){
  const target={id:m.id,label:m.label,family:m.family,size:m.size,page:m.page,kind:'machine',status:m.available===false?'missing':'stock',reason:m.unavailable_reason||null,count:0};targets.push(target);
  let catalog;
  if(m.available===false)continue;
  if(registry.machines[m.id]){
   if(m.family==='trident')catalog=expandedPrinterCatalog(m.id.startsWith('siboor_trident_')?sizedSiboorCatalog(read('ASSEMBLY_CONFIGURATIONS.json'),siboor,m.id):read(`machines/${m.id}/configurations.json`),heads,registry,m.id);
   else if(m.family==='v24')catalog={...v24HeadCatalog(heads,registry,m.id,read(`machines/${m.id}/machine_profile.json`)),accessories:[]};
   else throw Error('Unclassified registered printer '+m.id);
   let frame=withInternalSpool(mods.machines[m.id],internalSpool,m.id);if(frame){frame=mergeRequestedMods({...frame,assets:mods.assets},requestedMods,m.id);catalog.accessories=[...(catalog.accessories||[]),...frame.accessories.filter(a=>!catalog.accessories?.some(b=>a.id===b.id))];}
   catalog=withMonolithMachines(catalog,heads,registry,gantries,mounts);target.status='supported';compact(target,catalog);
  }else if(v0.machines[m.id]){
   target.status='supported';target.kind='v0';catalog=enumerateV0(v0.machines[m.id]);compact(target,catalog);
   details.get(target.file).mods=library.items.filter(i=>i.id.startsWith('v0mod_')).map(item=>({id:item.id,label:item.label,options:v0.machines[m.id].options.filter(o=>o.attachments.some(a=>a.module===item.module||a.module===item.id)).map(o=>({id:o.id,slot:o.slot,label:o.label,requires:o.requires||{},conflicts:o.conflicts||{}}))}));
  }else if(community.machines[m.id]){
   const registration=community.machines[m.id],files=read('COMMUNITY_MACHINES_ASSETS.json').machines[m.id].files;
   if(registration.profile_sha256!==files['machine_profile.json'].sha256)throw Error('Stale community installation registry');
   const names={toolhead:'head',zdrive:'z',probe:'probe'};catalog={dimensions:Object.keys(names),options:Object.fromEntries(Object.entries(names).map(([k,v])=>[k,Object.entries(registration.controls[v]).map(([id,c])=>({id,label:c.label}))])),variants:Object.entries(registration.configurations).map(([id,c])=>({id,...Object.fromEntries(Object.entries(names).map(([k,v])=>[k,c.selection[v]])),notes:c.notices})),accessories:[]};target.status='supported';target.kind='community';compact(target,catalog);
  }
 }
 for(const [id,label,page,catalog] of [['toolheads','ツールヘッド単体','./toolheads.html',heads],['gantries','Monolithガントリー単体','./gantries.html',monolithHeadCatalog(heads,registry,gantries)]]){const target={id,label,page,kind:'standalone',status:'standalone'};targets.push(target);compact(target,{...catalog,accessories:[]})}
 const index={schema:1,scope:'Viewer registration only. Counts exclude independent accessories, dock-bank selections, colors and motion. Not physical compatibility certification.',model_bundle:read('ASSET_BUNDLE.json'),targets,head_families:heads.toolheads.map(h=>({id:h.id,label:h.label,configuration:heads.variants.find(v=>v.toolhead===h.id)?.id})),input_sha256};
 return {index,details};
}
export function portableSupportGzip(decoded,compress=gzipSync){
 const compressed=Buffer.from(compress(decoded,{level:9}));
 // Gzip's OS marker describes the compressor, not the catalog. Pin "unknown"
 // before hashing so Windows review builds and Linux Pages builds are identical.
 compressed[9]=255;
 return compressed;
}

export function writeSupport(root,output=path.join(root,'support/data')){
 const {index,details}=buildSupport(root);fs.mkdirSync(output,{recursive:true});
 index.resources={};
 for(const [name,value]of details){
  const decoded=Buffer.from(JSON.stringify(value)+'\n'),compressed=portableSupportGzip(decoded);
  fs.writeFileSync(path.join(output,name+'.gz'),compressed);
  // Only these freshly generated reports are replaced; native inputs stay exact.
  fs.rmSync(path.join(output,name),{force:true});
  index.resources[name]={file:name+'.gz',encoding:'gzip',bytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex'),decoded_bytes:decoded.length,decoded_sha256:createHash('sha256').update(decoded).digest('hex')};
 }
 fs.writeFileSync(path.join(output,'index.json'),JSON.stringify(index)+'\n');
 console.log(JSON.stringify({targets:index.targets.length,configurable:index.targets.filter(t=>t.kind!=='standalone'&&t.status==='supported').length,missing:index.targets.filter(t=>t.status==='missing').length,registered_rows:[...details.values()].reduce((n,d)=>n+d.rows.length,0),bytes:[...[...details.keys()].map(f=>f+'.gz'),'index.json'].reduce((n,f)=>n+fs.statSync(path.join(output,f)).size,0)}));
 return {index,details};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(!process.argv[2])throw Error('Pass an assembled site root');writeSupport(process.argv[2],process.argv[3])}
