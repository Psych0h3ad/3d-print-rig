import {probeHasConflict} from './probe-checks.js?v=public-v23';
export const dimensions=['gantry','toolhead','carriage','hotend','extruder','probe'];
export const collections={gantry:'gantries',toolhead:'toolheads',mount:'mounts',carriage:'carriages',hotend:'hotends',extruder:'extruders',probe:'probes',board:'boards',cooling:'cooling_options'};
export const catalogDimensions=catalog=>catalog.dimensions||dimensions;
// Match registered source IDs used by standalone head links; never guess an ID.
export function configurationById(catalog,id){
 return catalog.variants.find(v=>v.id===id)||catalog.variants.find(v=>v.source_head_configuration===id);
}
export const headBuilderDimensions=['toolhead','extruder','hotend','cooling','mount','gantry','carriage','probe','board'];

// The changed choice has priority; all results must have installed CAD.
export function resolveVariant(catalog,selection,changed){
 const exact=catalog.variants.find(v=>catalogDimensions(catalog).every(k=>v[k]===selection[k]));
 if(exact&&(!changed||exact.id===selection.id))return exact;
 const candidates=catalog.variants.filter(v=>!changed||v[changed]===selection[changed]);
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
 const order=catalogDimensions(catalog),prefix=order.slice(0,order.indexOf(dimension));
 const candidates=catalog.variants.filter(v=>prefix.every(k=>v[k]===variant[k]));
 const key=collections[dimension];
 if(!catalog[key])return [];
 return catalog[key].filter(row=>candidates.some(v=>v[dimension]===row.id));
}

export function importedVariant(catalog,data){
 if(data.machine&&data.machine!==(catalog.machine_id||'siboor_trident_350')&&!catalog.import_machine_ids?.includes(data.machine))throw Error('この構成は別のマシン用です。');
 const id=data.configuration||data.id;
 const variant=catalog.variants.find(v=>v.id===id);
 if(!variant)throw Error('この構成のCADは登録されていません。');
 return variant;
}
