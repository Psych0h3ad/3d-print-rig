export const dimensions=['gantry','toolhead','carriage','hotend','extruder','probe'];

// The changed choice has priority; all results must have installed CAD.
export function resolveVariant(catalog,selection,changed){
 const candidates=catalog.variants.filter(v=>!changed||v[changed]===selection[changed]);
 let best=null,bestScore=-1;
 for(const v of candidates){
  const conflict=v.fit?.probe?.height_passed===false||v.fit?.probe?.physical_passed===false;
  const changingHead=changed&&changed!=='probe';
  let score=dimensions.reduce((n,k,i)=>n+(v[k]===selection[k]&&!(k==='probe'&&changingHead&&conflict)?2**(dimensions.length-i):0),0);
  if(changingHead&&conflict)score-=1;
  if(score>bestScore){best=v;bestScore=score}
 }
 return best;
}

export function choicesFor(catalog,variant,dimension){
 const prefix=dimensions.slice(0,dimensions.indexOf(dimension));
 const candidates=catalog.variants.filter(v=>prefix.every(k=>v[k]===variant[k]));
 const key={gantry:'gantries',toolhead:'toolheads',carriage:'carriages',hotend:'hotends',extruder:'extruders',probe:'probes'}[dimension];
 if(!catalog[key])return [];
 return catalog[key].filter(row=>candidates.some(v=>v[dimension]===row.id));
}

export function importedVariant(catalog,data){
 if(data.machine&&data.machine!==(catalog.machine_id||'siboor_trident_350'))throw Error('この構成は別のマシン用です。');
 const id=data.configuration||data.id;
 const variant=catalog.variants.find(v=>v.id===id);
 if(!variant)throw Error('この構成のCADは登録されていません。');
 return variant;
}
