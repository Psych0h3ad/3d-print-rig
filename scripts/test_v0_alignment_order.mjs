// Official V0.2r1 manual page111: lock four M3x8 frame screws BEFORE
// re-locking the two M3x12 nut-holder screws. V0.2 page106 is a separate guide.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
const raw=await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),doc=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');
const source=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url))),id='v0.feet.manual.edb68c9afec35ea1',entry=source.entries[id];
const r1=doc.machines.voron_v02r1_120,step=r1.stages.find(s=>s.id==='z-motor-center');
assert.equal(r1.manual.sha256,'5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f');
assert.equal(step.page_start,111);assert.equal(step.page_end,111);
assert.equal(step.note,entry.en);assert.equal(step.note_ja,entry.ja);
function order(text){const first=text.indexOf('M3x8'),last=text.indexOf('M3x12');return first>=0&&last>first}
for(const language of ['en','ja','de','es','ru','ko']){
 const text=['en','ja'].includes(language)?entry[language]:(await import('../site/viewer/locales/'+language+'.mjs')).default[id][1];
 assert(order(text),language+': frame M3x8 must be described before holder M3x12');
}
for(const stale of ['Tighten the two M3x12 holder screws, then the four M3x8 frame screws.','Tighten the same two top holder screws, then the four motor-to-frame screws.'])assert(!order(stale));
const frame=[546,548,549,550].map(n=>'v02r1_'+String(n).padStart(5,'0')),holder=[457,473].map(n=>'v02r1_'+String(n).padStart(5,'0'));
assert.deepEqual(r1.stages.find(s=>s.id==='z-motor-mount').part_keys,frame);
assert([...frame,...holder].every(k=>step.operation_part_keys.includes(k)));
const v02=doc.machines.voron_v02_120;
// Separately reviewed exact manual tail and one original screw ownership change.
const reviewedElectronicsAndPower=new Set(["bottom-feet-remove", "bottom-panel", "bottom-panel-position", "display", "display-faceplate-prep", "display-fasteners", "display-knob", "display-pcb-mounts", "display-position", "display-self-tappers", "door-handle", "door-handle-magnets", "door-handle-vhb", "door-latch-magnets", "door-latches", "door-lift-off-check", "door-panel", "door-panel-vhb", "electronics-boards", "electronics-cleat-install", "electronics-cleat-tape", "electronics-control-board", "electronics-control-board-fixing", "electronics-dc", "electronics-dc-controller", "electronics-dc-hotend", "electronics-dc-motors", "electronics-dc-pi", "electronics-fan", "electronics-fan-3010", "electronics-fan-inserts", "electronics-fan-lower", "electronics-fan-m3x12", "electronics-fan-m3x16", "electronics-fan-upper", "electronics-guard", "electronics-mains", "electronics-mains-acdc", "electronics-mains-inlet-install", "electronics-mains-inlet-prewire", "electronics-mains-psu", "electronics-mount-height", "electronics-mount-install", "electronics-mounts", "electronics-pi-board", "electronics-pi-board-fixing", "electronics-psu", "electronics-psu-voltage", "frame-front", "mid-panel", "mid-panel-alignment", "motor-cable-route", "motor-panel", "motor-panel-position", "motor-strain-relief", "panel-left", "panel-left-clips", "panel-left-position", "panel-right", "panel-right-clips", "panel-right-position", "rear-bottom-hinges", "rear-panel-clips", "rear-panel-fasteners", "rear-panel-position", "rear-panels", "reverse-bowden", "skirt-front", "skirt-front-left-prep", "skirt-front-position", "skirt-front-right-prep", "skirt-left", "skirt-left-position", "skirt-rear", "skirt-rear-position", "skirt-right", "skirt-right-position", "spool-cut-flush", "spool-holder", "spool-lower-supplement", "spool-upper-liner", "spool-upper-mount", "tophat-attach", "tophat-check", "tophat-frame", "tophat-frame-close", "tophat-front-clips", "tophat-front-fasteners", "tophat-front-position", "tophat-front-posts-preload", "tophat-front-u", "tophat-hinge-washers", "tophat-left-clips", "tophat-left-position", "tophat-lock", "tophat-locks-open", "tophat-long-front-prep", "tophat-long-left-prep", "tophat-long-rear-prep", "tophat-long-right-prep", "tophat-nut-check", "tophat-nuts-front", "tophat-nuts-left", "tophat-nuts-rear", "tophat-nuts-right", "tophat-rear", "tophat-rear-clips", "tophat-rear-fasteners", "tophat-rear-position", "tophat-rear-posts-preload", "tophat-rear-u", "tophat-right-clips", "tophat-right-fasteners", "tophat-right-position", "tophat-sides", "tophat-source-lock-studs", "tophat-top", "tophat-top-clips", "tophat-top-position", "tophat-upper-hinges-loose"]),unchangedPins={"voron_v02_120":"1bf78d8da16c3e4380ab7a894c545f218def6178ac47211ecbd91dd478a7009a","voron_v02r1_120":"dc54fa7ead6cd0d8d9261fbf5698b2af76ad3a3cec06f71ff5b7826566a2d8c3"};
for(const[mid,machine]of Object.entries(doc.machines)){const unchanged={...machine,stages:machine.stages.filter(s=>!reviewedElectronicsAndPower.has(s.id))};assert.equal(createHash('sha256').update(JSON.stringify(unchanged)).digest('hex'),unchangedPins[mid],'Every row outside the separately reviewed electronics/power operations must remain unchanged');}
assert.equal(v02.stages.find(s=>s.id==='z-align').page_start,106);assert(!v02.stages.some(s=>s.id==='z-motor-center'));
const previous='64ffe3c0359d11e1c1ff523cfc8eda6b63fb51a5ce7cba3b6c857112c2fcc3e8';let cases=0;
for(const[mid,machine]of Object.entries(doc.machines)){
 const manifest={machine_id:mid,parts:machine.stages.flatMap(s=>s.part_keys).map(key=>({key,name:key}))},index=createAssemblyIndex({manifest,machine,receipts:{'model.glb':machine.model_sha256,'assembly_manifest.json':machine.manifest_sha256,'assembly_stages.json':sha}}),isR1=mid==='voron_v02r1_120',stages=['head-install','z-rail-position',...(isR1?['z-motor-center']:['z-align'])],keys=isR1?holder:v02.stages.find(s=>s.id==='z-align').operation_part_keys.slice(0,2);
 for(const version of [1,2]){
  const old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:previous},current_stage:isR1?'z-motor-center':'z-align',checked_stages:stages,...(version===2?{checked_parts:keys}:{})};
  const result=validateAssemblyProgress(index,old);
  assert.deepEqual(new Set(result.checked_stages),new Set(isR1?stages.filter(s=>s!=='z-motor-center'):stages));
  assert.deepEqual(new Set(result.checked_parts),new Set(version===2?keys:[]));assert.equal(result.current_stage,old.current_stage);cases++;
 }
}
console.log(JSON.stringify({passed:true,languages:6,previousProgressCases:cases,scope:'Pinned R1manual111 instruction order, exact original screw groups, unchanged V02guide and source-specific v1/v2 stage recheck/part preservation. Source-key fixtures, not native fitting.'}));
