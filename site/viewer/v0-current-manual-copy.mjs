import {translateV0ReferenceCopy} from './v0-reference-copy.mjs?v=f873cd289f790b320f45';
import {v0ManualDataReady} from './v0-manual-data.mjs?v=02c5ea8d6a8687e71f2b';
import {translateV0FanCopy} from './v0-fan-copy.mjs?v=06acccdc998183291d6f';
import {translateV0EnclosureCopy} from './v0-enclosure-copy.mjs?v=b519aa0b432c20ea12d7';
import {translateV0PanelClosureCopy} from './v0-panel-closure-copy.mjs?v=c25efd85dd2ad27972f4';
import {translateV0PanelDoorCopy} from './v0-panel-door-copy.mjs?v=74fbc50fa0695878ba59';
import {translateV0TophatCopy} from './v0-tophat-copy.mjs?v=65a4678f3b0a76d6f65d';
import {translateV0SpoolCopy} from './v0-spool-copy.mjs?v=a70abe495ea3e9e80860';
export function translateV0ManualCopy(text,language,fallback=(value)=>value){
 if(!v0ManualDataReady())return fallback(text,language);
 const copies=[translateV0ReferenceCopy,translateV0FanCopy,translateV0EnclosureCopy,translateV0PanelClosureCopy,translateV0PanelDoorCopy,translateV0TophatCopy,translateV0SpoolCopy];
 for(const copy of copies){const value=copy(text,language,(value)=>value);if(value&&value!==text)return value}
 return fallback(text,language);
}
