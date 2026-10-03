export const changerDimensions=['system','interface','toolhead'];
export function changerChoice(catalog,selection,changed){
 const candidates=catalog.variants.filter(v=>!changed||String(v[changed])===String(selection[changed]));
 if(!candidates.length)throw Error('このツールチェンジャー構成は登録されていません');
 const score=v=>changerDimensions.reduce((n,k)=>n+(String(v[k])===String(selection[k])?1:0),0);
 const best=[...candidates].sort((a,b)=>score(b)-score(a))[0];
 if(!best.modules?.length||best.modules.some(m=>!catalog.assets[m.id]))throw Error('必要なCADが揃っていません');
 return best;
}
export function changerChoices(catalog,actual,key){
 const previous=changerDimensions.slice(0,changerDimensions.indexOf(key));
 return [...new Set(catalog.variants.filter(v=>previous.every(k=>v[k]===actual[k])).map(v=>v[key]))];
}
export function changerPlacement(variant,entry,{probe=0,explode=0}={}){
 if(!Number.isFinite(probe)||!Number.isFinite(explode)||explode<0||explode>50)throw Error('表示変位が範囲外です');
 if(probe&&(!variant.probe_travel_mm||probe<variant.probe_travel_mm[0]||probe>variant.probe_travel_mm[1]))throw Error('この機構のストロークは未登録です');
 const p=[...entry.translation_mm];
 if(entry.role==='tool'){
  const direction=entry.explode_vector_mm||[0,-1,.5];
  if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))throw Error('分解表示の方向が不正です');
  for(let i=0;i<3;i++)p[i]+=direction[i]*explode;
  p[2]+=probe;
 }
 return p;
}
