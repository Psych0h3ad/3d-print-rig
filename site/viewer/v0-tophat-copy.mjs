import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

export function translateV0TophatCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-tophat-copy');
 const lang=String(language||'en').toLowerCase().split('-')[0];
 if(lang==='en')return text;
 return copy[text]?.[lang]??fallback(text,language);
}
