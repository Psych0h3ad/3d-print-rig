// One list for the picker, browser preferences, navigation and shared links.
export const supportedLanguages=Object.freeze(['ja','en','es','ko','ru']);
export const languageNames=Object.freeze({ja:'日本語',en:'English',es:'Español',ko:'한국어',ru:'Русский'});
export function normalizeLanguage(value){
 if(typeof value!=='string')return undefined;
 const base=value.trim().toLowerCase().split('-')[0];
 return supportedLanguages.includes(base)?base:undefined;
}
export function chooseLanguage({query,stored,languages=[]}={}){
 return normalizeLanguage(query)||normalizeLanguage(stored)||languages.map(normalizeLanguage).find(Boolean)||'en';
}
export function languageURL(href,language){const url=new URL(href),value=normalizeLanguage(language);if(value)url.searchParams.set('lang',value);return url.href}
