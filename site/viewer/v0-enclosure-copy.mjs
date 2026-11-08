import {checkedV0ManualData} from './v0-manual-data.mjs?v=02c5ea8d6a8687e71f2b';

export function translateV0EnclosureCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-enclosure-copy');const key=String(text??""),lang=String(language??"en").toLowerCase().split("-")[0];return lang==="en"?key:copy[key]?.[lang]??fallback(key,language);}
