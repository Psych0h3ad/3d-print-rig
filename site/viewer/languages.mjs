// One list for the picker, browser preferences, navigation and shared links.
export const supportedLanguages=Object.freeze(['en','ja','es','ko','ru']);
export const languageNames=Object.freeze({ja:'日本語',en:'English',es:'Español',ko:'한국어',ru:'Русский'});
export function normalizeLanguage(value){
 if(typeof value!=='string')return undefined;
 const base=value.trim().toLowerCase().split('-')[0];
 return supportedLanguages.includes(base)?base:undefined;
}
export function chooseLanguage({query,stored}={}){
 // Shared links and the user's explicit preference take precedence. New
 // visitors start in English, independent of the browser/OS locale.
 return normalizeLanguage(query)||normalizeLanguage(stored)||'en';
}
export function languageURL(href,language){const url=new URL(href),value=normalizeLanguage(language);if(value)url.searchParams.set('lang',value);return url.href}
