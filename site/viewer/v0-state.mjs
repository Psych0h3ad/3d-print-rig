import {validateV0Mods,v0Slots,v0TophatMaxAngle} from './v0-installations.mjs?v=2687e9168ef1a3b0b82a';

export const v0ConfigurationSchema='v0-configuration-v1';
export const v0ModsParameter='v0_mods';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const stockV0Mods=()=>Object.fromEntries(v0Slots.map(([slot])=>[slot,'stock']));

// Files keep the existing schema, including the older four-selector migration.
// Return detached, canonical data so edits during an async load cannot alter it.
export function validateV0State({profile,registry},value){
 if(!record(value)||value.schema!==v0ConfigurationSchema||value.machine_id!==profile.machine_id)throw Error('この機種の設定ファイルではありません');
 const mods=validateV0Mods(registry,value.mods);
 if(!Array.isArray(value.pose)||value.pose.length!==3||value.pose.some((n,i)=>typeof n!=='number'||!Number.isFinite(n)||n<profile.display_limits_mm['XYZ'[i]][0]||n>profile.display_limits_mm['XYZ'[i]][1]))throw Error('XYZ設定が不正です');
 const roles=['base','accent','frame'];
 if(!record(value.palette)||Object.keys(value.palette).sort().join()!=='accent,base,frame'||roles.some(k=>value.palette[k]!==null&&(typeof value.palette[k]!=='string'||!/^#[0-9a-f]{6}$/i.test(value.palette[k]))))throw Error('色設定が不正です');
 if(['enclosure','belts','grid'].some(k=>typeof value[k]!=='boolean'))throw Error('表示設定が不正です');
 const angle=(key,max)=>{const n=value[key]===undefined?0:value[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>max)throw Error(key==='door_angle_deg'?'ドア角度が不正です':'トップハット角度が不正です');return n};
 return {schema:v0ConfigurationSchema,machine_id:profile.machine_id,mods,pose:[...value.pose],palette:Object.fromEntries(roles.map(k=>[k,value.palette[k]])),enclosure:value.enclosure,belts:value.belts,grid:value.grid,door_angle_deg:angle('door_angle_deg',110),tophat_angle_deg:angle('tophat_angle_deg',v0TophatMaxAngle(registry,mods))};
}

// The URL contract covers installed choices only. Source-library views and
// display preferences remain independent, as on other machine pages.
export function readV0ModsURL(href,{machine_id,registry}){
 const url=new URL(href),values=url.searchParams.getAll(v0ModsParameter);
 if(!values.length)return null;
 if(values.length!==1||!values[0]||values[0].length>4096)throw Error('共有リンクのV0 Mod設定が不正です');
 const machine=url.searchParams.getAll('machine');
 if(machine.length>1||machine.length===1&&machine[0]!==machine_id)throw Error('この機種の共有リンクではありません');
 let value;try{value=JSON.parse(values[0])}catch{throw Error('共有リンクのV0 Mod設定が不正です')}
 return validateV0Mods(registry,value);
}
export function v0ModsURL(href,{machine_id,registry},mods){
 const value=validateV0Mods(registry,mods),url=new URL(href);
 url.searchParams.set('machine',machine_id);
 url.searchParams.set(v0ModsParameter,JSON.stringify(Object.fromEntries(v0Slots.map(([slot])=>[slot,value[slot]]))));
 return url.href;
}

// Selection, reset, file restore and startup links share one commit boundary.
// Invalid input cannot cancel an in-flight valid request; only the newest
// successfully prepared installation may commit pose/palette/UI/URL state.
export function createV0StateRestorer({profile,registry,installations,commit,busy=()=>{},error=()=>{}}){
 let request=0;
 async function apply(mods,configuration){
  const sequence=++request;busy(true);
  try{
   const applied=await installations.setState(mods);
   if(!applied||sequence!==request)return false;
   commit(configuration);return true;
  }catch(e){if(sequence===request)error(e);throw e}
  finally{if(sequence===request)busy(false)}
 }
 return {
  setMods(value){return apply(validateV0Mods(registry,value))},
  restore(value){const configuration=validateV0State({profile,registry},value);return apply(configuration.mods,configuration)},
 };
}
