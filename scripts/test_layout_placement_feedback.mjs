import assert from 'node:assert/strict';
import {placementStatus} from '../site/layout/layout-placement-feedback.mjs';
import {createLayoutTranslator,supportedLanguages} from '../site/layout/layout-i18n.mjs';
import {createDefaultLayout,createDesk} from '../site/layout/layout-state.mjs';
import {proposePlacement} from '../site/layout/layout-placement.mjs';
const catalog=[{id:'probe-printer',widthMm:240,depthMm:230,heightMm:300}];
const state=createDefaultLayout({furniture:[createDesk({id:'table',widthMm:600,depthMm:600,heightMm:750})]},catalog);
const original=JSON.stringify(state),cases=[];
for(const [name,input,code]of [
 ['wall',{kind:'desk',xMm:9000,zMm:0},'ROOM_OUT_OF_BOUNDS'],
 ['overlap',{kind:'desk',xMm:0,zMm:0},'ENVELOPE_OVERLAP'],
 ['overhang',{kind:'printer',machineId:'probe-printer',parentId:'table',surfaceId:'top',xMm:600,zMm:0},'SURFACE_OVERHANG']
]){
 const p=proposePlacement(state,{id:'new',yawDeg:0,snapMm:0,...input},catalog);assert(!p.valid);assert(p.issues.some(i=>i.code===code),name);assert.equal(p.state,null);
 for(const language of supportedLanguages){const t=createLayoutTranslator(language),text=placementStatus(p,t);assert(text.startsWith(t('layout.place.blocked')));assert(text.includes(t('layout.warning.'+code)));cases.push(name+'/'+language);}
}
const valid=proposePlacement(state,{kind:'desk',id:'new',xMm:1200,zMm:0,yawDeg:0,snapMm:0},catalog);assert(valid.valid);
for(const language of supportedLanguages){const t=createLayoutTranslator(language);assert.equal(placementStatus(valid,t),t('layout.place.ready'));assert.equal(placementStatus({valid:false,issues:[{code:'unknown'}]},t),t('layout.place.blocked'));assert.equal(placementStatus({valid:false,issues:[{code:'unknown',params:{}},{code:'ENVELOPE_OVERLAP'}]},t),t('layout.place.blocked')+' · '+t('layout.warning.ENVELOPE_OVERLAP'));}
assert.equal(JSON.stringify(state),original,'Feedback must not mutate or commit the plan');
console.log(JSON.stringify({passed:true,cases:cases.length+supportedLanguages.length*3,scope:'Real rejected/accepted proposals and localized feedback only; planning envelopes, not native-solid clearance.'}));
