import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

export function translateV0SpoolCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-spool-copy');const lang=String(language||'en').toLowerCase().split('-')[0];return lang==='en'?text:copy[text]?.[lang]??fallback(text,language)}
