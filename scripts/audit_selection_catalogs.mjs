import {xolEmbeddedBoard,sbEmbeddedBoard,withEmbeddedBoards} from '../site/viewer/embedded-boards.mjs';
import {headPrinterLink} from '../site/viewer/head-navigation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {catalogDimensions,collections,choicesFor,resolveVariant,headBuilderDimensions,configurationById} from '../site/viewer/configuration-model.js';
import {expandedPrinterCatalog,v24HeadCatalog} from '../site/viewer/machine-head-model.mjs';
import {headPlan} from '../site/viewer/head-assembly.js';
const root=process.argv[2];if(!root)throw Error('Pass assembled site root');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const heads=withEmbeddedBoards(read('TOOLHEAD_CONFIGURATIONS.json'),[xolEmbeddedBoard(read(read('TOOLHEAD_CONFIGURATIONS.json').base_assets.xol.meta)),sbEmbeddedBoard(read(read('TOOLHEAD_CONFIGURATIONS.json').base_assets.stealthburner.meta))]),assembly=read('ASSEMBLY_CONFIGURATIONS.json'),registry=read('MACHINE_HEAD_REGISTRATIONS.json');
heads.dimensions=headBuilderDimensions;
const catalogs={heads,kit:expandedPrinterCatalog(assembly,heads,registry,'siboor_trident_350')};
const vanilla=read('machines/voron_trident_350/configurations.json');
catalogs.trident=expandedPrinterCatalog(vanilla,heads,registry,'voron_trident_350');
for(const machine of Object.keys(registry.machines).filter(id=>/v24/.test(id)))catalogs[machine]=v24HeadCatalog(heads,registry,machine);
const report={catalogs:[],failures:[],sameGeometry:[],unusedOptions:[],missingAssets:[],invalidHiddenKeys:[],unreachable:[],nonIdempotent:[],linkLosses:[]};
const metadata=new Map();
function signature(c,v){
 const p=v.machine_head||headPlan(v),entries=[{id:p.base,translation_mm:p.translation,hidden_keys:[...p.hidden]},...p.modules];
 const rows=[];
 for(const e of entries){
  if(e.role==='dock')continue;
  const spec=c.base_assets?.[e.id]||c.assets?.[e.id];
  if(!spec){report.missingAssets.push([v.id,e.id]);continue}
  for(const file of [spec.meta,spec.glb])if(!fs.existsSync(path.join(root,file))&&!fs.existsSync(path.join(root,file+'.gz')))report.missingAssets.push([v.id,file]);
  if(!metadata.has(spec.meta))metadata.set(spec.meta,read(spec.meta));
  const meta=metadata.get(spec.meta),keys=new Set(meta.parts.map(p=>String(p.key)));
  const hidden=new Set((e.hidden_keys||[]).map(String));
  // Assembly stock masks also contain frame and old-gantry parts outside the extracted head.
  if(c===heads||v.machine_head)for(const key of hidden)if(!keys.has(key))report.invalidHiddenKeys.push([v.id,e.id,key]);
  const visible=meta.parts.filter(r=>!hidden.has(String(r.key))&&!['rail_reference','shuttle_reference','dock'].includes(r.component)).map(r=>String(r.key)).sort();
  if(visible.length)rows.push(JSON.stringify([spec.glb,e.translation_mm,visible]));
 }
 return rows.sort().join('|');
}
for(const [name,c] of Object.entries(catalogs)){
 const dims=catalogDimensions(c),ids=new Set(),groups=new Map(),edges=new Map();let transitions=0;
 for(const v of c.variants){
  edges.set(v.id,new Set());
  if(ids.has(v.id))report.failures.push([name,'duplicate-id',v.id]);ids.add(v.id);
  for(const d of dims){
   if(!c[collections[d]]?.some(o=>o.id===v[d]))report.failures.push([name,'missing-option',v.id,d,v[d]]);
   if(resolveVariant(c,v,d)?.id!==v.id)report.nonIdempotent.push([name,v.id,d]);
   const choices=choicesFor(c,v,d);
   if(!choices.some(o=>o.id===v[d]))report.failures.push([name,'current-not-selectable',v.id,d]);
   for(const option of choices){const n=resolveVariant(c,{...v,[d]:option.id},d);if(n?.[d]!==option.id)report.failures.push([name,'selection-not-retained',v.id,d,option.id]);if(n)edges.get(v.id).add(n.id);transitions++}
  }
  if(v.source_head_configuration&&configurationById(c,v.source_head_configuration)?.source_head_configuration!==v.source_head_configuration)report.linkLosses.push([name,v.id]);
  const s=signature(c,v);if(!groups.has(s))groups.set(s,[]);groups.get(s).push(v);
 }
 const reached=new Set([c.variants[0].id]),queue=[c.variants[0].id];for(let i=0;i<queue.length;i++)for(const id of edges.get(queue[i])||[])if(!reached.has(id)){reached.add(id);queue.push(id)}
 for(const v of c.variants)if(!reached.has(v.id))report.unreachable.push([name,v.id,'no-menu-path']);
 for(const vs of groups.values())if(vs.length>1){const changed=dims.filter(d=>new Set(vs.map(v=>v[d])).size>1);if(changed.length)report.sameGeometry.push({catalog:name,changed,ids:vs.map(v=>v.id)})}
 for(const d of dims)for(const row of c[collections[d]]||[])if(!c.variants.some(v=>v[d]===row.id))report.unusedOptions.push([name,d,row.id]);
 report.catalogs.push({name,variants:c.variants.length,transitions,geometrySignatures:groups.size});
}
fs.writeFileSync(process.argv[3]||'selection-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,sameGeometry:report.sameGeometry.slice(0,10),unusedOptions:report.unusedOptions.length,invalidHiddenKeys:report.invalidHiddenKeys.slice(0,10),unreachable:report.unreachable.slice(0,10)},null,2));

if(['failures','sameGeometry','missingAssets','invalidHiddenKeys','unreachable','nonIdempotent','linkLosses'].some(k=>report[k].length))process.exitCode=1;

let registeredLinks=0,unregisteredHeads=0;for(const v of heads.variants){const link=headPrinterLink(v,registry,'https://example.test/viewer/toolheads.html');if(!link.registered){unregisteredHeads++;continue}const c=link.machine==='siboor_trident_350'?catalogs.kit:link.machine==='voron_trident_350'?catalogs.trident:catalogs[link.machine];const resolved=configurationById(c,new URL(link.url).searchParams.get('configuration'));if(!resolved||['toolhead','extruder','hotend','mount','probe','board','cooling'].some(k=>resolved[k]!==v[k]))throw Error('Lost printer link: '+v.id);registeredLinks++}console.log(JSON.stringify({registeredLinks,unregisteredHeads}));
