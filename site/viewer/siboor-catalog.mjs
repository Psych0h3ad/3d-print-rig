import {assertSiboorIndexInput} from './trinity-alpha-siboor-r2.mjs?v=222cd28251c37c257817';
import {contentSHA256} from './mount-validation.mjs';
export function siboorMachine(href=location.href){
 const id=new URL(href).searchParams.get('machine')||'siboor_trident_350';
 if(!['siboor_trident_300','siboor_trident_350'].includes(id))throw Error('Unknown SIBOOR Trident size');
 const size=Number(id.split('_').at(-1));return {id,size,gantryId:'trident_r2_gantry_'+size,maxX:size,maxY:size+10};
}
export async function loadSiboorRegistration(){
 const response=await fetch(new URL('../SIBOOR_TRIDENT_ASSETS.json?v=9b10bebcaa3b326532fd',import.meta.url),{cache:'no-cache'});
 if(!response.ok)throw Error('SIBOOR Trident registration unavailable');const text=await response.text();assertSiboorIndexInput(await contentSHA256(text));return JSON.parse(text);
}

// Sized stock recipes keep the authored head origin and swap the native gantry.
export function sizedSiboorCatalog(base,index,machine){
 if(machine==='siboor_trident_350')return structuredClone(base);
 if(machine!=='siboor_trident_300'||!index.machines[machine])throw Error('Unregistered SIBOOR size');
 const c=structuredClone(base),omitted=new Set(index.machines[machine].omitted_stock_keys);
 c.machine_id=machine;c.model='SIBOOR Trident 300 / CNC AWD';
 const old=c.assets.trident_r2_gantry_350;delete c.assets.trident_r2_gantry_350;
 c.assets.trident_r2_gantry_300=Object.fromEntries(Object.entries(old).map(([k,v])=>[k,v.replaceAll('trident_r2_gantry_350','trident_r2_gantry_300')]));
 for(const v of c.variants){
  v.removed_stock_keys=v.removed_stock_keys.filter(k=>!omitted.has(k)).map(k=>k.replaceAll('trident_r2_gantry_350_','trident_r2_gantry_300_'));
  v.notes=v.notes.map(n=>n.replaceAll('350 mm','300 mm'));
  for(const m of v.modules)if(m.id==='trident_r2_gantry_350')m.id='trident_r2_gantry_300';
 }
 c.accessories.find(a=>a.id==='trident_bedfans').translation_mm=[0,-25,0];
 return c;
}
export function registerSizedSiboor(index,registry,bank,mods){
 registry.machines.siboor_trident_300=structuredClone(index.registrations.head);
 bank.machines.siboor_trident_300=structuredClone(index.registrations.bank);
 bank.indx.machines.siboor_trident_300=structuredClone(index.registrations.indx_bank);
 mods.machines.siboor_trident_300=structuredClone(index.registrations.mods);
}
