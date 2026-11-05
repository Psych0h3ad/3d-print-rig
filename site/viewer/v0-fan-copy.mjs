import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

const tails=["Keep this prepared subassembly aside until installation.", "Original source positions are retained; no insertion or thermal deformation is simulated."];
const prep="Prepare the four original threaded inserts in the lower fan mount as shown in the official heat-set diagram. Keep the prepared subassembly aside until the fan-mount installation.";
export function translateV0FanCopy(text,language,fallback){
 const copy=checkedV0ManualData('v0-fan-copy');
 const lang=String(language||'en').split('-')[0].toLowerCase(),direct=copy[text];
 if(direct)return lang==='en'?text:direct[lang]??fallback(text,language);
 for(const tail of tails){const suffix=' '+tail;if(!String(text).endsWith(suffix))continue;const base=text.slice(0,-suffix.length);if(!copy[base])continue;const a=lang==='en'?base:copy[base][lang];const b=lang==='en'?tail:copy[tail][lang];if(a&&b)return base===prep?a:a+' '+b;}
 return fallback(text,language);
}
