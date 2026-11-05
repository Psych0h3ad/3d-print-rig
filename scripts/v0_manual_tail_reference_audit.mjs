// Independent declarative masks from the received original manual source tables.
// This compares visible source membership; it does not certify mounting or fit.
import assert from 'node:assert/strict';
const tableNames=['v0-fan-assembly','v0-enclosure-assembly','v0-panel-closure','v0-panel-door','v0-tophat-assembly','v0-spool-assembly'];
export function auditManualTailOwnership({id,spec,manifest,data}){
 const ids=spec.stages.map(s=>s.id),keys=new Set(manifest.parts.map(p=>p.key)),visited=new Set();let operations=0;
 for(const name of tableNames){const source=data[name][id];assert(source);assert.equal(source.model,spec.model_sha256);assert.equal(source.manifest,spec.manifest_sha256);
  for(const op of source.operations){const stage=spec.stages.find(s=>s.id===op.id);assert(stage,'Missing manual operation '+op.id);for(const field of['page_start','page_end','part_keys','operation_part_keys'])assert.deepEqual(stage[field]??stage.part_keys,op[field]);for(const key of op.operation_part_keys){assert(keys.has(key));visited.add(key)}operations++;}
 }
 const originalMotorScrew=(id==='voron_v02_120'?'v02_':'v02r1_')+'00017';assert(!spec.stages[ids.indexOf('frame-front')].part_keys.includes(originalMotorScrew));assert(spec.stages[ids.indexOf('motor-strain-relief')].part_keys.includes(originalMotorScrew));
 return {operations,sourcePartsReferenced:visited.size,tables:6,originalMotorScrewIntroducedOnceAtReceiver:true,physicalFitQualified:false};
}
export function applyReviewedManualTailMask(shown,{id,spec,index,data}){
 const ids=spec.stages.map(s=>s.id),stage=ids[index];let result=new Set(shown);
 for(const name of tableNames){const source=data[name][id],operation=source.operations.find(r=>r.id===stage);let only=null,stored=[];
  if(name==='v0-fan-assembly'){
   if(operation?.isolated)only=operation.operation_part_keys;
   else if(index<ids.indexOf(source.install))stored=source.prepared;
  }else if(name==='v0-enclosure-assembly'){
   if(operation?.displayIntent.startsWith('prepare-'))only=operation.operation_part_keys;
   else stored=source.preparedGroups.filter(g=>index<ids.indexOf(g.install)).flatMap(g=>g.keys);
  }else if(name==='v0-panel-closure'){
   if(stage==='bottom-panel-position')stored=source.rubberFeet;
  }else if(name==='v0-tophat-assembly'||name==='v0-spool-assembly'){
   if(operation?.isolated)only=operation.shownKeys;
  }
  if(only){const allowed=new Set(only);result=new Set([...result].filter(key=>allowed.has(key)))}
  else if(stored.length){const parked=new Set(stored);result=new Set([...result].filter(key=>!parked.has(key)))}
 }
 return result;
}
