import {normalizeLanguage} from '../viewer/languages.mjs?v=2e376566920474c0f57c';
import {funMessages} from '../viewer/locales/fun.mjs?v=8d513897a5d5c1f6ecf1';

const messageId=key=>'fun.'+key.replace(/[A-Z]/gu,letter=>'_'+letter.toLowerCase());
export function funWords(language='en'){
 const dictionary=funMessages[normalizeLanguage(language)||'en'];
 return Object.fromEntries(Object.entries(dictionary).map(([id,text])=>[id.slice(4).replace(/_([a-z])/gu,(_,letter)=>letter.toUpperCase()),text]));
}
export function formatFunMessage(key,values={},language='en'){
 const dictionary=funMessages[normalizeLanguage(language)||'en'],id=key.startsWith('fun.')?key:messageId(key);
 if(!Object.hasOwn(dictionary,id))throw new RangeError('Unknown wallpaper message: '+id);
 return dictionary[id].replace(/\{(\d+)\}/gu,(_,name)=>{
  if(!Object.hasOwn(values,name))throw new TypeError('Missing wallpaper message value: '+name);
  return String(values[name]);
 });
}
