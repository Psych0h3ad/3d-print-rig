// The Rapido X cartridge keeps its manufacturer meshes. The surrounding
// shell and its two lower LEDs use the original UHF assembly, at native scale.
export const rapidoXUhfCover=Object.freeze({
 variants:['rapido51__siboor_awd__stealthburner__rapido_x__cw2','rapido51__trident_r2__stealthburner__rapido_x__cw2'],
 original_keys:['412','413','423'],
 replaced_keys:['sb_rapido_x_common_6','sb_rapido_x_common_7','sb_rapido_x_common_8'],
 metadata_sha256:'4a516030dd823a0bac1fb198005029f07540022325c7cad0ae9f59d0c490418b',
 decoded_model_sha256:'5b139696ecbd801076863c3c3e752a4c1630f6f39ca70e8f817a15a2ae0404d5'
});
export function withRapidoXUhfCover(catalog){
 const selected=catalog.variants.filter(v=>rapidoXUhfCover.variants.includes(v.id));
 if(!selected.length)return catalog;
 const result=structuredClone(catalog);
 if(!result.base_assets?.stealthburner)throw Error('Original UHF Stealthburner asset missing');
 Object.assign(result.base_assets.stealthburner,{metadata_sha256:rapidoXUhfCover.metadata_sha256,decoded_model_sha256:rapidoXUhfCover.decoded_model_sha256});
 for(const v of result.variants.filter(v=>rapidoXUhfCover.variants.includes(v.id))){
  const cover=v.modules.filter(m=>m.id==='sb_rapido_x');
  if(v.hotend!=='rapido_x_uhf'||v.toolhead!=='stealthburner'||v.mount!=='fixed'||v.extruder!=='cw2'||v.base_asset&&v.base_asset!=='stealthburner'||cover.length!==1)throw Error('Rapido X UHF source configuration changed');
  const hidden=v.base_hidden_keys||v.removed_stock_keys;
  if(v.cover_source?.kind==='original_uhf'){
   if(!Array.isArray(hidden)||rapidoXUhfCover.original_keys.some(key=>hidden.includes(key))||!rapidoXUhfCover.replaced_keys.every(key=>cover[0].hidden_keys?.includes(key)))throw Error('Rapido X UHF selection changed');
   continue;
  }
  if(!Array.isArray(hidden)||!rapidoXUhfCover.original_keys.every(key=>hidden.includes(key)))throw Error('Rapido X original shell selection changed');
  v.base_hidden_keys=hidden.filter(key=>!rapidoXUhfCover.original_keys.includes(key));
  cover[0].hidden_keys=[...new Set([...(cover[0].hidden_keys||[]),...rapidoXUhfCover.replaced_keys])];
  v.cover_source={kind:'original_uhf',keys:[...rapidoXUhfCover.original_keys],source_asset:'stealthburner',source_geometry_changed:false};
 }
 return result;
}
// Float32 export collapsed fourteen seam triangles in the original UHF shell.
// Omit only those zero-area draw elements. Restore the original index bytes
// and draw range when leaving this variant; positions and hardware stay intact.
export function setRapidoXUhfSurface(entries,active){
 for(const e of entries){
  if(e.key!=='423')continue;
  const g=e.mesh.geometry,index=g.index,a=g.attributes.position;
  if(!e.uhfSurface&&active){
   if(!index)throw Error('Original UHF shell index missing');
   const source=index.array.slice(),kept=[];
   for(let i=0;i<source.length;i+=3){
    const [j,k,l]=source.slice(i,i+3),u=[a.getX(k)-a.getX(j),a.getY(k)-a.getY(j),a.getZ(k)-a.getZ(j)],v=[a.getX(l)-a.getX(j),a.getY(l)-a.getY(j),a.getZ(l)-a.getZ(j)];
    const q=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(!q.every(Number.isFinite))throw Error('Non-finite original UHF surface');
    if(q.some(n=>n!==0))kept.push(j,k,l);
   }
   const omitted=(source.length-kept.length)/3;
   if(omitted!==14)throw Error('Original UHF source tessellation changed');
   e.uhfSurface={source,kept:new source.constructor(kept),draw:{...g.drawRange},omitted};
  }
  if(e.uhfSurface){index.array.set(active?e.uhfSurface.kept:e.uhfSurface.source);index.needsUpdate=true;const draw=active?{start:0,count:e.uhfSurface.kept.length}:e.uhfSurface.draw;g.setDrawRange(draw.start,draw.count);}
 }
}
