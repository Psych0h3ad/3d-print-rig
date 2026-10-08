// Strict intersections: never silently substitute a companion in a support table.
export function matchingRows(catalog,selection,except){return catalog.rows.filter(row=>catalog.dimensions.every((d,i)=>d===except||!selection[d]||catalog.options[d][row[i+1]].id===selection[d]))}
export function rowSelection(catalog,row){return Object.fromEntries(catalog.dimensions.map((d,i)=>[d,catalog.options[d][row[i+1]].id]))}
export const configurationId=(catalog,row)=>row[0].map(i=>catalog.idParts[i]).join('__');
export function supportURL(target,catalog,row,base,language){
 const url=new URL('../viewer/'+target.page.replace(/^\.\//,''),base);url.searchParams.set('lang',language);
 if(target.kind==='machine'||target.kind==='v0'||target.kind==='community')url.searchParams.set('machine',target.id);
 if(row){
  if(target.kind==='v0')url.searchParams.set('v0_mods',JSON.stringify(rowSelection(catalog,row)));
  else url.searchParams.set('configuration',configurationId(catalog,row));
 }
 return url.href;
}
