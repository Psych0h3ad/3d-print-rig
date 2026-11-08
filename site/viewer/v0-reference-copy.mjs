import {checkedV0ManualData} from './v0-manual-data.mjs?v=02c5ea8d6a8687e71f2b';

export function translateV0ReferenceCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-reference-copy');const lang=String(language||'en').toLowerCase().split('-')[0];return lang==='en'?text:copy[text]?.[lang]??fallback(text,language)}
