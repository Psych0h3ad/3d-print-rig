import {v0ManualDataReady} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';
import {translateV0FanCopy} from './v0-fan-copy.mjs?v=66c56c3318956ab3e3ab';
import {translateV0EnclosureCopy} from './v0-enclosure-copy.mjs?v=c87c2a348c18b6eed758';
import {translateV0PanelClosureCopy} from './v0-panel-closure-copy.mjs?v=7f79f2a273787af14201';
import {translateV0PanelDoorCopy} from './v0-panel-door-copy.mjs?v=5c05dd4f87f7a348836e';
import {translateV0TophatCopy} from './v0-tophat-copy.mjs?v=ef62e8c41c1a22e10a21';
import {translateV0SpoolCopy} from './v0-spool-copy.mjs?v=f9a6113be023159c76de';
export function translateV0ManualCopy(text,language,fallback=(value)=>value){
 if(!v0ManualDataReady())return fallback(text,language);
 const copies=[translateV0FanCopy,translateV0EnclosureCopy,translateV0PanelClosureCopy,translateV0PanelDoorCopy,translateV0TophatCopy,translateV0SpoolCopy];
 for(const copy of copies){const value=copy(text,language,(value)=>value);if(value&&value!==text)return value}
 return fallback(text,language);
}
