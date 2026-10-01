export const gantryDimensions=['size_mm','machine','build','belt_width_mm','xy_motors'];
export function gantryChoice(catalog,selection){
 const matches=catalog.variants.filter(v=>gantryDimensions.every(k=>String(v[k])===String(selection[k])));
 if(matches.length!==1)throw Error('このガントリー構成は登録されていません');
 const v=matches[0];if(!v.modules.length||v.modules.some(id=>!catalog.assets[id]))throw Error('ガントリーのCADが揃っていません');return v;
}
export function gantryAssets(catalog,variant){return variant.modules.map(id=>({id,...catalog.assets[id]}))}
