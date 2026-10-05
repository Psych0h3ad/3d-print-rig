import {catalogDimensions,collections,resolveVariant} from './configuration-model.js?v=d4b3dda97a404a7575b7';

export const configurationLabels={gantry:'ガントリー',mount:'取付・交換方式',toolhead:'ツールヘッド',extruder:'押出機',hotend:'ホットエンド',probe:'ベッドプローブ',carriage:'キャリッジ',board:'基板',cooling:'冷却'};
export function configurationLabel(catalog,key,value){
 const label=catalog[collections[key]]?.find(row=>row.id===value)?.label||value||'—';
 return key==='gantry'&&catalog.machine_id==='monolith_workbench'?label.replace(/^VT \/ /,'Trident / ').replace(/^V2 \/ /,'VORON 2.4 / ').replace(' · sheet_metal · ',' · 板金 · ').replace(' · printed · ',' · プリント · '):label;
}
export function configurationChanges(catalog,from,to){
 return catalogDimensions(catalog).filter(key=>from&&to&&from[key]!==to[key]).map(key=>({key,label:configurationLabels[key]||key,from:configurationLabel(catalog,key,from[key]),to:configurationLabel(catalog,key,to[key])}));
}

// A draft always names one registered assembly. Choosing parts does not touch
// the installed scene, URL or saved configuration until Apply succeeds.
export function createConfigurationDraft(catalog,initial){
 let applied=initial,current=initial;const automatic=new Set();
 return {
  get current(){return current},
  get changes(){return configurationChanges(catalog,applied,current).map(row=>({...row,automatic:automatic.has(row.key)}))},
  get pending(){return current?.id!==applied?.id},
  choose(key,value){
   const next=resolveVariant(catalog,{...current,[key]:value},key);if(!next)return false;
   for(const row of configurationChanges(catalog,current,next))if(row.key!==key)automatic.add(row.key);
   automatic.delete(key);current=next;return true;
  },
  reset(value=applied){applied=value;current=value;automatic.clear()},
  invalidateApplied(){applied=null},
 };
}
