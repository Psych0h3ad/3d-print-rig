import {formatMessage} from './i18n.mjs?v=628c8b0455eaed91f60d';
import {e3ngModModel} from './source-assembly-runtime/e3ng-mod-data.mjs?v=6c0d243d5a84b25d0ea1';
const machineId='rh3d_e3ng_v12_235',schema='e3ng-mods-v1';
const copy=language=>Object.fromEntries(['base','stock','reinforced','cable','hole','panels','hex'].map(key=>[key,formatMessage(key==='stock'?'text.0258':'e3ng.mods.'+key,{},typeof language==='function'?language():language)]));
function selection(value){
 const keys=value&&Object.keys(value).sort().join(),legacy=keys==='base,cable,schema';
 if(!value||Array.isArray(value)||(!legacy&&keys!=='base,cable,panels,schema')||value.schema!==schema||!['stock','reinforced'].includes(value.base)||!['stock','cable-hole'].includes(value.cable)||(!legacy&&!['stock','hex'].includes(value.panels)))return null;
 return {schema,base:value.base,cable:value.cable,panels:legacy?'stock':value.panels};
}

// Appearance transfer intentionally excludes assembly choices. Carry these
// separately for the same machine, after the existing source identity guard.
export function captureE3NGModSelection(machine,state){
 if(machine!==machineId||state?.e3ng_mods===undefined)return null;
 const mods=selection(state.e3ng_mods);if(!mods)throw Error('Invalid E3NG mod selection');return mods;
}
export function transferE3NGModSelection(machine,state,captured){
 if(machine!==machineId||captured===null||captured===undefined)return state;
 const mods=selection(captured);if(!mods||!selection(state?.e3ng_mods))throw Error('E3NG mod selection unavailable in this view');
 return {...state,e3ng_mods:mods};
}

export function setupE3NGModControls({host,machine,language,getState,getAvailability=()=>null,apply,owned,messages}){
 host.hidden=machine!==machineId;
 if(host.hidden)return {sync(){},refresh(){}};
 const controls={},rows={},bindings=[];
 function text(node,key){bindings.push([node,key]);return messages.dynamic(node,()=>copy(language)[key]);}
 for(const[key,title,choices]of[
  ['base','base',[['stock','stock'],['reinforced','reinforced']]],
  ['cable','cable',[['stock','stock'],['cable-hole','hole']]],
  ['panels','panels',[['stock','stock'],['hex','hex']]]
 ]){
  const id='sourceE3NGMod-'+key,row=owned('label',{htmlFor:id}),input=owned('select',{id,disabled:true});
  row.append(text(owned('span'),title),input);
  for(const[value,label]of choices)input.append(text(owned('option',{value}),label));
  host.append(row);controls[key]=input;rows[key]=row;
  input.onchange=()=>{
   const state=getState(),mods=selection(state?.e3ng_mods);
   if(!mods||input.disabled||rows[key].hidden){sync();return;}
   try{return apply({...state,e3ng_mods:{...mods,[key]:input.value}});}
   finally{sync();}
  };
 }
 function sync(){
  const mods=selection(getState()?.e3ng_mods),availability=getAvailability();
  for(const[key,input]of Object.entries(controls)){
   input.disabled=!mods||availability?.[key]!==true;input.value=mods?.[key]??'stock';
   rows[key].hidden=key==='panels'&&availability?.panels!==true;
  }
 }
 function refresh(){for(const[node,key]of bindings)node.textContent=copy(language)[key];sync();}
 sync();return {sync,refresh};
}

export function appendE3NGModCredits({hosts,machine,packet,language,owned,messages}){
 if(machine!==machineId)return;
 for(const[url,title,choice,version]of[
  ['https://www.printables.com/model/1378246-ender-ng-3-v12-toolhead-base-with-large-reinforcem','base','reinforced','STEP 6207809 · 2025-11-09'],
  ['https://www.printables.com/model/1348213-ender-3-ng-v12-toolhead-cable-mount-with-cable-hol','cable','hole','STEP 5672858 · 2025-07-07']
 ])for(const host of hosts){
  const row=owned('li'),link=messages.dynamic(owned('a',{href:url,target:'_blank',rel:'noopener noreferrer'}),()=>{const t=copy(language);return 'Synthead · '+t[title]+': '+t[choice];});
  const license=owned('a',{href:'https://creativecommons.org/licenses/by-nc-sa/4.0/',textContent:'CC-BY-NC-SA 4.0',target:'_blank',rel:'noopener noreferrer'});
  const note=owned('small');note.append(owned('span',{textContent:' · '+version+' · '}),license);row.append(link,note);host.append(row);
 }
 if(packet?.machine!=='e3ng'||packet.model?.sha256!==e3ngModModel)return;
 for(const[id,file]of[
  ['4093353','electronics_panel_upper_left_dual_color.stl'],
  ['4093350','electronics_panel_upper_right_dual_color.stl'],
  ['4093351','electronics_panel_lower_left_dual_color.stl'],
  ['4093352','electronics_panel_lower_right_dual_color.stl']
 ])for(const host of hosts){
  const row=owned('li'),link=messages.dynamic(owned('a',{href:'https://www.printables.com/model/922401-ender-3-ng-v12-corexy-conversion',target:'_blank',rel:'noopener noreferrer'}),()=>{const t=copy(language);return 'RH3D · '+t.panels+': '+t.hex;});
  const note=owned('small'),license=owned('a',{href:'https://creativecommons.org/licenses/by-nc-sa/4.0/',textContent:'CC-BY-NC-SA 4.0',target:'_blank',rel:'noopener noreferrer'});
  note.append(owned('span',{textContent:' · '+file+' · STL '+id+' · 2024-08-16 · '}),license);row.append(link,note);host.append(row);
 }
}
