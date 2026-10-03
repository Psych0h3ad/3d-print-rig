import {probeHasConflict} from './probe-checks.js?v=trident-clearance-35';
export const dimensions=['gantry','toolhead','carriage','hotend','extruder','probe'];
export const collections={gantry:'gantries',toolhead:'toolheads',mount:'mounts',carriage:'carriages',hotend:'hotends',extruder:'extruders',probe:'probes',board:'boards',cooling:'cooling_options'};
export const catalogDimensions=catalog=>catalog.dimensions||dimensions;
// Match registered source IDs used by standalone head links; never guess an ID.
export function configurationById(catalog,id){
 return catalog.variants.find(v=>v.id===id)||catalog.variants.find(v=>v.source_head_configuration===id);
}
export const headBuilderDimensions=['toolhead','extruder','hotend','cooling','mount','gantry','carriage','probe','board'];
const indexedCatalogs=new WeakMap();
function variantIndex(catalog){
 let index=indexedCatalogs.get(catalog);
 if(index?.variants===catalog.variants&&index.length===catalog.variants.length)return index;
 index={variants:catalog.variants,length:catalog.variants.length,fields:new Map()};
 for(const k of new Set([...catalogDimensions(catalog),'toolhead','gantry','mount','extruder','hotend','cooling','carriage'])){
  const values=new Map();for(const v of catalog.variants){if(!values.has(v[k]))values.set(v[k],[]);values.get(v[k]).push(v)}index.fields.set(k,values);
 }
 indexedCatalogs.set(catalog,index);return index;
}

// Keep the printer gantry and head as the browsing context. Other component
// menus may offer a registered combination requiring a companion change.
// Probe/board mounting remains bound to its concrete mechanical assembly.
function candidatesFor(catalog,selection,changed){
 const order=catalogDimensions(catalog),machine=order.indexOf('gantry')>=0&&order.indexOf('gantry')<order.indexOf('toolhead');
 const anchors=[];
 if(machine&&changed!=='gantry')anchors.push('gantry');
 if(!['toolhead','mount'].includes(changed)&&!(machine&&changed==='gantry'))anchors.push('toolhead');
 if(['probe','board'].includes(changed))anchors.push('mount','extruder','hotend','gantry','cooling');
 if(['probe','board'].includes(changed))anchors.push('carriage');
 const fields=[...new Set([...(changed?[changed]:[]),...anchors.filter(k=>selection[k]!==undefined)])],index=variantIndex(catalog);
 let rows=catalog.variants;for(const k of fields){const subset=index.fields.get(k)?.get(selection[k])||[];if(subset.length<rows.length)rows=subset}
 return rows.filter(v=>fields.every(k=>v[k]===selection[k]));
}

// The changed choice has priority; all results must have installed CAD.
export function resolveVariant(catalog,selection,changed){
 const exact=catalog.variants.find(v=>catalogDimensions(catalog).every(k=>v[k]===selection[k]));
 if(exact&&(!changed||exact.id===selection.id))return exact;
 const candidates=changed?candidatesFor(catalog,selection,changed):catalog.variants;
 let best=null,bestScore=-1;
 for(const v of candidates){
  const conflict=probeHasConflict(v);
  const changingHead=changed&&changed!=='probe';
  const order=catalogDimensions(catalog);
  let score=order.reduce((n,k,i)=>n+(v[k]===selection[k]&&!(k==='probe'&&changingHead&&conflict)?2**(order.length-i):0),0);
  if(changingHead&&conflict)score-=1;
  if(score>bestScore){best=v;bestScore=score}
 }
 return best;
}

export function choicesFor(catalog,variant,dimension){
 const key=collections[dimension];
 if(!catalog[key])return [];
 return catalog[key].filter(row=>candidatesFor(catalog,{...variant,[dimension]:row.id},dimension).length);
}

export function choiceChanges(catalog,variant,dimension,value){
 const next=resolveVariant(catalog,{...variant,[dimension]:value},dimension);
 return next?catalogDimensions(catalog).filter(k=>k!==dimension&&next[k]!==variant[k]):[];
}

export function importedVariant(catalog,data){
 if(data.machine&&data.machine!==(catalog.machine_id||'siboor_trident_350')&&!catalog.import_machine_ids?.includes(data.machine))throw Error('この構成は別のマシン用です。');
 const id=data.configuration||data.id;
 const variant=catalog.variants.find(v=>v.id===id);
 if(!variant)throw Error('この構成のCADは登録されていません。');
 return variant;
}
