import {normalizeLanguage} from './languages.mjs?v=fa521b07d4184ded0146';
import {monolithHeadCatalog} from './monolith-head-model.mjs?v=f01febfc759348d89fa7';
import {machinePage} from './machines.js?v=dedc575bbef34e348ec3';
import {machineHeadVariants} from './machine-head-model.mjs?v=03db7c7d900ff7f5b2c0';

export function headPrinterLink(variant,registry,href){
 const source=new URL(href),preferred=source.searchParams.get('return_machine');
 const monolith=monolithPrinterLink(variant,registry,source);if(monolith)return monolith;
 const targets=Object.entries(registry.machines).filter(([id,binding])=>machinePage(id)&&
  (binding.gantries?Object.keys(binding.gantries):[undefined]).some(gantry=>machineHeadVariants({variants:[variant]},registry,id,gantry).length)).map(([id])=>id);
 const defaultMachine=variant.belt_width_mm===6?'voron_trident_350':'siboor_trident_350';
 const machine=[preferred,defaultMachine,...targets].find(id=>targets.includes(id));
 const url=new URL(machinePage(machine)||machinePage(preferred)||'./',source);
 if(machine){url.searchParams.set('machine',machine);const original=machine===preferred&&source.searchParams.get('return_head')===variant.id&&source.searchParams.get('return_configuration');url.searchParams.set('configuration',original||variant.id)}
 else if(machinePage(preferred))url.searchParams.set('machine',preferred);
 const lang=source.searchParams.get('lang');if(normalizeLanguage(lang))url.searchParams.set('lang',normalizeLanguage(lang));
 return {url:url.href,machine,registered:!!machine};
}

export function monolithPrinterLink(variant,registry,source){
 if(!registry.monolith||!registry.monolith_target)return null;
 const {gantries,registrations}=registry.monolith;
 const choices=monolithHeadCatalog({variants:[variant],assets:{},base_assets:{}},registry,gantries).variants;
 if(!choices.length)return null;
 const q=source.searchParams,preferred=q.get('return_machine'),original=q.get('return_configuration');
 const wanted=q.get('return_gantry')||original?.match(/__(monolith_(?:vt|v2)_.+?)__/i)?.[1];
 const eligible=Object.entries(registrations.machines).flatMap(([id,b])=>choices.filter(v=>{
  const g=gantries.variants.find(g=>g.id===v.gantry);return machinePage(id)&&g.machine===b.family&&g.size_mm===b.size_mm&&(!b.gantry_ids||b.gantry_ids.includes(g.id));
 }).map(v=>({machine:id,gantry:v.gantry})));
 const found=eligible.find(v=>v.machine===preferred&&v.gantry===wanted)||eligible.find(v=>v.gantry===wanted)||eligible.find(v=>v.machine===preferred)||eligible.find(v=>v.machine==='voron_trident_350')||eligible[0];
 if(!found)return null;
 const url=new URL(machinePage(found.machine),source);url.searchParams.set('machine',found.machine);url.searchParams.set('gantry',found.gantry);url.searchParams.set('head_configuration',variant.id);
 const lang=q.get('lang');if(normalizeLanguage(lang))url.searchParams.set('lang',normalizeLanguage(lang));
 return {url:url.href,machine:found.machine,registered:true};
}
