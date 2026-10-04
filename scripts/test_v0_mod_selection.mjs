import assert from 'node:assert/strict';
import {v0ModCategories,componentViews,componentViewKeys,resolveComponentView,partLabel} from '../site/viewer/v0-mod-library.mjs';
assert.equal(new Set(v0ModCategories.flatMap(c=>c.mods)).size,20);
const parts=[
 {key:'a',name:'SOLID',source_file:'a/Board_A.step',source_path:['assembly','PCB','SOLID']},
 {key:'b',name:'Connector',source_file:'a/Board_A.step',source_path:['assembly','PCB','Connector']},
 {key:'c',name:'(Unsaved)',source_file:'a/Board_B.step',source_path:['assembly','(Unsaved)']},
];
const views=componentViews({id:'v0mod_umbilical',select_parts:true},parts);
assert.equal(views.length,2);assert.deepEqual(componentViewKeys(views[0],'all'),['a','b']);
assert.deepEqual(componentViewKeys(views[1],'c'),['c']);assert.throws(()=>componentViewKeys(views[1],'a'));
assert.equal(resolveComponentView(views,{part:'c'}).view,views[1]);
assert.equal(resolveComponentView(views,{view:views[1].id,part:'a'}).part,'all');
assert.equal(resolveComponentView(views,{view:'missing',part:'missing'}).view,views[0]);
assert.equal(partLabel(parts[0]),'PCB');assert.equal(partLabel(parts[2]),'Board B');
const alternatives=componentViews({id:'v0mod_dragon_burner_v8',select_parts:true},parts.map(p=>({...p,source_file:'single.step'})));
assert.ok(alternatives.every(v=>!v.assembly));assert.throws(()=>componentViewKeys(alternatives[0],'all'));
assert.throws(()=>componentViews({id:'v0mod_official_bowden'},parts),'Missing native couplers must not produce plausible-looking configurations');
const frontParts=[
 {key:'cover',name:'Stealth front / support omitted',source_file:'front.3mf'},
 {key:'surround',name:'Voron logo surround',source_file:'surround.3mf'},
 {key:'insert',name:'Voron logo insert',source_file:'insert.3mf'},
];
const frontViews=componentViews({id:'v0mod_fysetc_cnc_stealth_front'},frontParts);
assert.equal(frontViews.length,3);
assert(frontViews.every(v=>!v.assembly),'Print-layout source files must not be advertised as an assembled front');
assert.deepEqual(componentViewKeys(frontViews[0],'cover'),['cover']);
assert.throws(()=>componentViewKeys(frontViews[0],'insert'));
assert.throws(()=>componentViewKeys(frontViews[0],'all'));
assert.equal(resolveComponentView(frontViews,{part:'insert'}).part,'insert');
const fanParts=[
 {key:'fan',name:'Fan bracket',source_file:'original.3mf'},
 {key:'connection',name:'Connection mount · original',source_file:'original.3mf'},
 {key:'mirror',name:'Connection mount · mirrored',source_file:'mirrored.3mf'},
];
const fanViews=componentViews({id:'v0mod_fysetc_cnc_bed_fans'},fanParts);
assert.equal(fanViews.length,3);
assert.equal(new Set(fanViews.map(v=>v.id)).size,3,'Objects sharing a 3MF file need distinct choices');
assert(fanViews.every(v=>!v.assembly&&v.parts.length===1),'Slicer objects must never be stacked as an assembly');
for(const v of fanViews){assert.deepEqual(componentViewKeys(v,v.parts[0].key),[v.parts[0].key]);assert.throws(()=>componentViewKeys(v,'all'))}
assert.equal(resolveComponentView(fanViews,{part:'mirror'}).view,fanViews[2]);
assert.throws(()=>componentViewKeys(fanViews[0],'mirror'));
console.log('V0 mod selection: category coverage, variant isolation, intact source assemblies, legacy links, invalid selections and readable labels passed.');
