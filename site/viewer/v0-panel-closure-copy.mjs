import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

export function translateV0PanelClosureCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-panel-closure-copy');const key=String(text??""),lang=String(language??"en").toLowerCase().split("-")[0];return lang==="en"?key:copy[key]?.[lang]??fallback(key,language);}
