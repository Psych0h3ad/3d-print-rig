import {machinePage} from './machines.js?v=public-v24';
import {machineHeadVariants} from './machine-head-model.mjs?v=public-v24';

export function headPrinterLink(variant,registry,href){
 const source=new URL(href),preferred=source.searchParams.get('return_machine');
 const targets=Object.entries(registry.machines).filter(([id,binding])=>machinePage(id)&&
  (binding.gantries?Object.keys(binding.gantries):[undefined]).some(gantry=>machineHeadVariants({variants:[variant]},registry,id,gantry).length)).map(([id])=>id);
 const defaultMachine=variant.belt_width_mm===6?'voron_trident_350':'siboor_trident_350';
 const machine=[preferred,defaultMachine,...targets].find(id=>targets.includes(id));
 const url=new URL(machinePage(machine)||machinePage(preferred)||'./',source);
 if(machine){url.searchParams.set('machine',machine);const original=machine===preferred&&source.searchParams.get('return_head')===variant.id&&source.searchParams.get('return_configuration');url.searchParams.set('configuration',original||variant.id)}
 else if(machinePage(preferred))url.searchParams.set('machine',preferred);
 const lang=source.searchParams.get('lang');if(['ja','en'].includes(lang))url.searchParams.set('lang',lang);
 return {url:url.href,machine,registered:!!machine};
}
