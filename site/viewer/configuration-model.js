import {probeHasConflict} from './probe-checks.js?v=0f70f5c099338db857e7';
import {hasDeclaredHeadHardware,registeredConfigurationId} from './head-companion-presets.mjs?v=142ddcf204a96d847c30';
export const dimensions=['gantry','toolhead','carriage','hotend','extruder','probe'];
export const collections={gantry:'gantries',toolhead:'toolheads',mount:'mounts',carriage:'carriages',hotend:'hotends',extruder:'extruders',probe:'probes',board:'boards',cooling:'cooling_options'};
export const catalogDimensions=catalog=>catalog.dimensions||dimensions;
function restoredConfigurationId(catalog,id,index){
 const resolved=registeredConfigurationId(catalog,id);
 if(resolved!==id||typeof id!=='string')return resolved;
 // Monolith composes the same source presets under two additional ID prefixes.
 // A migration must retain the complete host/gantry prefix and land on an
 // existing row with the exact source identity; never choose another mount.
 if(!id.startsWith('monolith_installed__')&&!id.startsWith('monolith_machine__'))return id;
 for(const [from,to]of Object.entries(catalog.configuration_aliases||{})){
  const suffix='__'+from;if(!id.endsWith(suffix))continue;
  const target=id.slice(0,-suffix.length)+'__'+to,row=index.byId.get(target);
  if(row?.source_head_configuration===to)return target;
 }
 return id;
}
// Match registered source IDs used by standalone head links; never guess an ID.
export function configurationById(catalog,id){
 const index=variantIndex(catalog);
 const resolved=restoredConfigurationId(catalog,id,index);
 if(resolved!==resolved)return undefined;
 return index.byId.get(resolved)||index.bySource.get(resolved);
}
export const headBuilderDimensions=['toolhead','extruder','hotend','cooling','mount','gantry','carriage','probe','board'];
// An explicitly archived mount model does not include the selected hardware.
export function isHeadMountReference(v){return v?.head_only===true&&!v.hardware_assembled&&v.base_asset?.startsWith('head_print_')&&v.fit?.complete_head_native?.state==='reference';}
function preserveAssemblyParts(index,selection,changed,rows){
 const current=index.byId.get(selection.id);
 return changed&&changed!=='toolhead'&&current&&!isHeadMountReference(current)?rows.filter(v=>!isHeadMountReference(v)):rows;
}
const indexedCatalogs=new WeakMap();
function variantIndex(catalog){
 let index=indexedCatalogs.get(catalog);
 const order=catalogDimensions(catalog);
 if(index?.variants===catalog.variants&&index.length===catalog.variants.length&&index.order.length===order.length&&index.order.every((k,i)=>k===order[i])){
  let unchanged=true;
  for(let i=0;i<index.length&&unchanged;i++){
   const v=catalog.variants[i],snapshot=index.snapshots[i];
   if(snapshot[0]!==v){unchanged=false;break;}
   for(let j=0;j<index.keys.length;j++)if(!Object.is(snapshot[j+1],v[index.keys[j]])){unchanged=false;break;}
  }
  if(unchanged)return index;
 }
 const fields=[...new Set([...order,'toolhead','gantry','mount','extruder','hotend','cooling','carriage'])];
 index={variants:catalog.variants,length:catalog.variants.length,order:[...order],fields:new Map(),byId:new Map(),bySource:new Map(),keys:[...new Set(['id','source_head_configuration',...fields])]};
 index.snapshots=catalog.variants.map(v=>[v,...index.keys.map(k=>v[k])]);
 for(const v of catalog.variants){
  // Retain Array.find's first match for duplicate IDs and source aliases.
  if(!index.byId.has(v.id))index.byId.set(v.id,v);
  if(!index.bySource.has(v.source_head_configuration))index.bySource.set(v.source_head_configuration,v);
 }
 for(const k of fields){
  const values=new Map();for(const v of catalog.variants){if(!values.has(v[k]))values.set(v[k],[]);values.get(v[k]).push(v)}index.fields.set(k,values);
 }
 indexedCatalogs.set(catalog,index);return index;
}

// Keep the printer gantry and head as the browsing context. Other component
// menus may offer a registered combination requiring a companion change.
// Probe/board mounting remains bound to its concrete mechanical assembly.
function candidateContext(catalog,selection,changed,index){
 const order=catalogDimensions(catalog),machine=order.indexOf('gantry')>=0&&order.indexOf('gantry')<order.indexOf('toolhead');
 const anchors=[];
 if(machine&&changed!=='gantry')anchors.push('gantry');
 if(!['toolhead','mount'].includes(changed)&&!(machine&&changed==='gantry'))anchors.push('toolhead');
 if(['probe','board'].includes(changed))anchors.push('mount','extruder','hotend','gantry','cooling');
 if(['probe','board'].includes(changed))anchors.push('carriage');
 const fields=[...new Set([...(changed?[changed]:[]),...anchors.filter(k=>selection[k]!==undefined)])];
 return {machine,fields,index};
}
function narrowestRows(index,selection,fields){
 let rows=index.variants;for(const k of fields){const subset=index.fields.get(k)?.get(selection[k])||[];if(subset.length<rows.length)rows=subset}
 return rows;
}
function candidatesFor(catalog,selection,changed,index){
 const {machine,fields}=candidateContext(catalog,selection,changed,index);
 const anchored=narrowestRows(index,selection,fields).filter(v=>fields.every(k=>v[k]===selection[k]));
 // Offer an installed head on the same printer even when it needs another
 // registered gantry. Keep existing gantry choices whenever they fit.
 if(anchored.length||!machine||changed!=='toolhead')return preserveAssemblyParts(index,selection,changed,anchored);
 return (index.fields.get('toolhead')?.get(selection.toolhead)||[]).filter(v=>fields.filter(k=>k!=='gantry').every(k=>v[k]===selection[k]));
}

// The changed choice has priority; all results must have installed CAD.
export function resolveVariant(catalog,selection,changed){
 return resolveIndexedVariant(catalog,selection,changed,variantIndex(catalog));
}
function resolveIndexedVariant(catalog,selection,changed,index){
 const order=catalogDimensions(catalog);
 const exact=narrowestRows(index,selection,order).find(v=>order.every(k=>v[k]===selection[k]));
 if(exact&&(!changed||exact.id===selection.id))return exact;
 // Companion adjustment belongs to a named menu change. An explicit tuple
 // without that intent must not silently install the nearest available head.
 if(!changed)return null;
 let candidates=changed?candidatesFor(catalog,selection,changed,index):catalog.variants;
 // Prefer a hardware assembly when entering a head family that also retains
 // archived print-only references. Explicit component/reference choices still work.
 if(changed==='toolhead'&&candidates.some(hasDeclaredHeadHardware))candidates=candidates.filter(hasDeclaredHeadHardware);
 let best=null,bestScore=-1;
 for(const v of candidates){
  const conflict=probeHasConflict(v);
  const changingHead=changed&&changed!=='probe';
  let score=order.reduce((n,k,i)=>n+(v[k]===selection[k]&&!(k==='probe'&&changingHead&&conflict)?2**(order.length-i):0),0);
  if(changingHead&&conflict)score-=1;
  if(score>bestScore){best=v;bestScore=score}
 }
 return best;
}

export function choicesFor(catalog,variant,dimension){
 return indexedChoices(catalog,variant,dimension,variantIndex(catalog));
}
function indexedChoices(catalog,variant,dimension,index){
 const key=collections[dimension];
 if(!catalog[key])return [];
 const {machine,fields}=candidateContext(catalog,variant,dimension,index);
 // The fixed context is identical for every option in this menu. Scan it once
 // rather than intersecting and allocating candidates again for each option.
 const anchors=fields.filter(k=>k!==dimension),values=new Set();
 const current=index.byId.get(variant.id),assembled=dimension!=='toolhead'&&current&&!isHeadMountReference(current);
 for(const v of narrowestRows(index,variant,anchors)){
  if(anchors.every(k=>v[k]===variant[k])&&(!assembled||!isHeadMountReference(v)))values.add(v[dimension]);
 }
 if(machine&&dimension==='toolhead')for(const value of index.fields.get('toolhead').keys())values.add(value);
 return catalog[key].filter(row=>row.id===row.id&&values.has(row.id));
}

export function choiceOptions(catalog,variant,dimension){
 // Validate mutable catalog inputs once for this synchronous menu batch.
 return indexedOptions(catalog,variant,dimension,variantIndex(catalog));
}
export function configurationOptions(catalog,variant,dimensions=catalogDimensions(catalog)){
 const index=variantIndex(catalog);
 return new Map(dimensions.map(dimension=>[dimension,indexedOptions(catalog,variant,dimension,index)]));
}
function indexedOptions(catalog,variant,dimension,index){
 return indexedChoices(catalog,variant,dimension,index).map(row=>{
  const candidate=resolveIndexedVariant(catalog,{...variant,[dimension]:row.id},dimension,index);
  const changes=candidate?catalogDimensions(catalog).filter(k=>k!==dimension&&candidate[k]!==variant[k]):[];
  return {row,candidate,changes};
 });
}

export function choiceChanges(catalog,variant,dimension,value){
 const next=resolveVariant(catalog,{...variant,[dimension]:value},dimension);
 return next?catalogDimensions(catalog).filter(k=>k!==dimension&&next[k]!==variant[k]):[];
}

export function importedVariant(catalog,data){
 if(data.machine&&data.machine!==(catalog.machine_id||'siboor_trident_350')&&!catalog.import_machine_ids?.includes(data.machine))throw Error('この構成は別のマシン用です。');
 const id=data.configuration||data.id;
 const index=variantIndex(catalog),resolved=restoredConfigurationId(catalog,id,index);
 const variant=resolved===resolved?index.byId.get(resolved):undefined;
 if(!variant)throw Error('この構成のCADは登録されていません。');
 for(const key of catalogDimensions(catalog))if(Object.hasOwn(data,key)&&data[key]!==variant[key])throw Error('この構成のCADは登録されていません。');
 return variant;
}
