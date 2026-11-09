import {checkedTridentManualData} from './trident-manual-data.mjs?v=19bb83f1fe559b8920ac';
// Source-specific manual references. Visibility uses final CAD placements;
// these operations do not certify insertion, native interference or retention.
const fail=message=>{throw Error('Trident filament manual: '+message)};
const fields=['key','name','group','motion','source_leaf','source_component','appearance_role'];
const rearIds=Array.from({length:31},(_,i)=>String(1189+i));
const filamentIds=Array.from({length:28},(_,i)=>String(1382+i));
const operationRows=[
 ['inlet-plate-inserts','Cover-plate inserts',307,['1394','1399','1401'],['1394','1399','1401']],
 ['inlet-body-inserts','Filament-inlet inserts',307,['1395','1398','1400'],['1395','1398','1400']],
 ['inlet-to-plate','Attach the filament inlet',308,['1397'],['1394','1395','1397','1399']],
 ['inlet-tube-clamp','Prepare the inlet tube clamp',308,['1403'],['1395','1403','1398']],
 ['inlet-to-rear-frame','Mount the cover plate',309,['1404','1405'],['1394','1395','1404','1405','1406','1407']],
 ['inlet-grill','Attach the exhaust grill',310,['1396','1402','1408'],['1394','1395','1396','1402','1408','1401','1400']],
 ['spool-holder','Assemble the spool holder',311,['1382','1383','1384','1385','1386','1387'],['1382','1383','1384','1385','1386','1387']],
 ['spool-support-liner','Fit the spool-support PTFE liner',312,['1388'],['1382','1383','1388']],
 ['retainer-inserts','Filament-retainer inserts',313,['1393','1391','1392'],['1393','1391','1392']],
 ['retainer-tube-clamp','Prepare the retainer tube clamp',313,['1390'],['1393','1390','1392']],
 ['retainer-frame','Attach the filament retainer',314,['1389'],['1393','1389','1391']],
 ['reverse-bowden','Route the reverse Bowden tube',315,['1409'],['1393','1395','1409','1390','1403']]
];
export function refineTridentFilamentManual(machine,stages,raw,components){
 if(machine!=='voron_trident_250')return stages;
 const spec=checkedTridentManualData().filament[machine];if(!spec)fail('Missing exact source binding');
 const component=components.find(c=>c.path===spec.component);
 if(!component||component.metadata.bytes!==spec.metadata.bytes||component.metadata.sha256!==spec.metadata.sha256||component.model.bytes!==spec.model.bytes||component.model.sha256!==spec.model.sha256)fail('Received model/metadata changed');
 const full=id=>spec.component+'#'+machine+'_base_'+id,keys=ids=>ids.map(full),same=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(v=>b.includes(v));
 for(const expected of spec.parts){const row=raw.get(spec.component+'#'+expected.key);if(!row||row.component!==spec.component||fields.some(k=>(row.p[k]??null)!==expected[k]))fail('Source owner or identity changed: '+expected.key);if(Object.hasOwn(expected,'rigid_translation_mm')){const a=row.p.rigid_translation_mm,b=expected.rigid_translation_mm;if(!Array.isArray(a)||a.length!==3||a.some((v,i)=>!Number.isFinite(v)||v!==b[i]))fail('Source occurrence frame changed: '+expected.key)}}
 const rear=keys(rearIds),filament=keys(filamentIds),oldWiring=stages.find(s=>s.id==='wiring'),oldFilament=stages.find(s=>s.id==='filament');
 if(!oldWiring||!rear.every(k=>oldWiring.part_keys.includes(k))||!oldFilament||!same(oldFilament.part_keys,filament))fail('Source chapter cohort changed');
 const note='Source reference at the original CAD positions. Follow the linked manual; insertion, tightening and physical fit remain unverified.';
 const create=(id,title,page,added,operation,extra={})=>({id,title,note,page_start:page,page_end:page,part_keys:keys(added),operation_part_keys:keys(operation),...extra});
 const out=[];
 for(const stage of stages){
  if(stage.id==='wiring'){out.push({...stage,part_keys:stage.part_keys.filter(k=>!rear.includes(k))});continue}
  if(stage.id==='panels'){
   out.push(create('rear-frame-preload','Prepare the rear-frame M5 nuts',292,['1406','1407'],['1406','1407'],{note:'Prepare these two rear-frame M5 nuts before fitting the rear panel. They are reused for the cover plate on page 309; the right-front spool holder uses a different pair.'}));
   out.push({id:'rear-panel',title:'Fit the rear panel',note:'Original-source rear panel and clip references. The source M3x12 screws differ from the manual M3x8 specification; clearance and fastening remain unresolved.',page_start:293,page_end:294,part_keys:rear,operation_part_keys:rear});
   out.push({...stage,page_start:295,page_end:306});continue;
  }
  if(stage.id==='filament'){
   for(const [id,title,page,added,operation]of operationRows){const extra={};if(id==='inlet-to-rear-frame')extra.reused_receivers=keys(['1407','1406']);if(id==='spool-support-liner')extra.note='The short source PTFE support liner is separate from the continuous reverse Bowden tube on page 315. Length, holding and insertion still require the source instructions.';out.push(create(id,title,page,added,operation,extra))}
   continue;
  }
  out.push(stage);
 }
 const owners=new Map();for(const [index,stage]of out.entries())for(const key of stage.part_keys){if(owners.has(key))fail('Source occurrence introduced twice');owners.set(key,index)}
 for(const [index,stage]of out.entries()){const refs=stage.operation_part_keys||stage.part_keys;if(new Set(refs).size!==refs.length||stage.part_keys.some(k=>!refs.includes(k))||refs.some(k=>!owners.has(k)||owners.get(k)>index))fail('Missing, duplicate or future operation source')}
 if(owners.size!==stages.reduce((n,s)=>n+s.part_keys.length,0)||!same(out.flatMap(s=>s.part_keys),stages.flatMap(s=>s.part_keys)))fail('Incomplete original source accounting');
 return out;
}
