// Actual state/UI and authoritative copy; DOM events are fixtures, not GPU or
// native-solid evidence. This test never fetches models or rewrites locales.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {sourceRevision} from './build_locales.mjs';

const option=process.argv.indexOf('--site');
const site=option<0?fileURLToPath(new URL('../site/',import.meta.url)):resolve(process.argv[option+1]);
const S=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const F=await import(pathToFileURL(resolve(site,'layout/layout-finishes.mjs')));
const {createLayoutUI}=await import(pathToFileURL(resolve(site,'layout/layout-ui.mjs')));
const {messages,createLayoutTranslator,supportedLanguages}=await import(pathToFileURL(resolve(site,'layout/layout-i18n.mjs')));
const tests=[];
function test(id,run){run();tests.push(id);}
const clone=value=>JSON.parse(JSON.stringify(value));
const appearance={wall:'stripe',floor:'tile'};
const replace=(state,finish)=>S.applyAction(state,{type:'SET_ROOM',room:{...state.room,appearance:finish}});

test('old-plans-normalize-on-create-parse-export-without-rounding-or-mutation',()=>{
  const legacy={...JSON.parse(readFileSync(new URL('./fixtures/layout_short_number_room.json',import.meta.url),'utf8')),furniture:[],printers:[]};
  const before=JSON.stringify(legacy);
  assert.equal(S.validateState(legacy).ok,true);
  const expected={...legacy,room:{...legacy.room,appearance:{wall:'paint',floor:'oak'}}};
  assert.deepEqual(S.parseLayout(before),expected);
  assert.deepEqual(JSON.parse(S.serializeLayout(legacy)),expected);
  assert.deepEqual(S.createDefaultLayout({room:legacy.room}),expected);
  assert.equal(JSON.stringify(legacy),before);
  assert.ok(Object.isFrozen(S.parseLayout(before).room.appearance));
  assert.deepEqual(F.WALL_FINISHES,['paint','linen','stripe']);assert.deepEqual(F.FLOOR_FINISHES,['oak','concrete','tile']);
  assert.deepEqual(F.DEFAULT_ROOM_APPEARANCE,{wall:'paint',floor:'oak'});
  for(const value of [F.WALL_FINISHES,F.FLOOR_FINISHES,F.DEFAULT_ROOM_APPEARANCE])assert.ok(Object.isFrozen(value));
});

test('all-nine-finish-pairs-roundtrip-and-reverse-with-identical-placement',()=>{
  const initial=S.createDefaultLayout({furniture:[S.createDesk({pose:{xMm:123.456789,zMm:-120.123456789,yawDeg:15}})]});
  const scene=S.deriveScene(initial),warnings=S.validatePlacement(initial);
  for(const wall of F.WALL_FINISHES)for(const floor of F.FLOOR_FINISHES){
    const next=replace(initial,{wall,floor}),saved=S.serializeLayout(next);
    assert.deepEqual(next.room.appearance,{wall,floor});assert.deepEqual(S.parseLayout(saved),next);
    assert.deepEqual(S.deriveScene(next),scene);assert.deepEqual(S.validatePlacement(next),warnings);
    assert.deepEqual(replace(next,F.DEFAULT_ROOM_APPEARANCE),initial);
  }
});

test('malformed-appearance-is-rejected-at-every-state-entry-point',()=>{
  const initial=S.createDefaultLayout(),original=S.serializeLayout(initial);
  const bad=[null,[],true,'linen',{}, {wall:'linen'}, {floor:'tile'},
    {wall:'oak',floor:'tile'},{wall:'linen',floor:'paint'},{wall:5,floor:'tile'},
    {wall:'paint',floor:{}},{wall:'paint',floor:'oak',scale:2},
    JSON.parse('{"wall":"paint","floor":"oak","__proto__":{}}')];
  for(const finish of bad){
    const invalid={...initial,room:{...initial.room,appearance:finish}};
    assert.equal(S.validateState(invalid).ok,false);
    for(const run of [()=>replace(initial,finish),()=>S.createDefaultLayout({room:invalid.room}),
      ()=>S.serializeLayout(invalid),()=>S.parseLayout(JSON.stringify(invalid))])assert.throws(run,S.LayoutValidationError);
    assert.equal(S.serializeLayout(initial),original);
  }
  assert.throws(()=>replace(initial,undefined),S.LayoutValidationError);
});

test('shape-only-SET_ROOM-keeps-finishes-and-explicit-appearance-replaces-them',()=>{
  let state=replace(S.createDefaultLayout(),appearance);
  for(const room of [S.createRoomRect({widthMm:6000,depthMm:5000}),
    S.createRoomL({widthMm:6000,depthMm:5000,cutWidthMm:1000,cutDepthMm:1500}),
    S.createRoomPolygon({polygonMm:[[.123456789,.234567891],[5000.123456789,0],[4500,4000],[0,3000]],wallHeightMm:2555.123456789})]){
    assert.ok(!Object.hasOwn(room,'appearance'));
    state=S.applyAction(state,{type:'SET_ROOM',room});assert.deepEqual(state.room,{...room,appearance});
    assert.deepEqual(S.parseLayout(S.serializeLayout(state)),state);
  }
  for(const create of [S.createRoomRect,S.createRoomL,options=>S.createRoomPolygon({polygonMm:state.room.polygonMm,...options})]){
    const room=create({appearance:{wall:'linen',floor:'concrete'}});
    assert.deepEqual(S.applyAction(state,{type:'SET_ROOM',room}).room.appearance,{wall:'linen',floor:'concrete'});
  }
  const before=S.serializeLayout(state);
  assert.throws(()=>S.applyAction(state,{type:'SET_ROOM',room:{polygonMm:[[0,0],[100,100],[0,100],[100,0]],wallHeightMm:2400}}),S.LayoutValidationError);
  assert.equal(S.serializeLayout(state),before);
});

test('finish-edits-retain-boundary-repair-and-cannot-bypass-room-constraints',()=>{
  const initial=S.createDefaultLayout({furniture:[S.createDesk()]});
  const next=replace(initial,appearance);
  assert.throws(()=>S.applyAction(next,{type:'SET_ROOM',room:S.createRoomRect({widthMm:100,depthMm:100})}),S.LayoutValidationError);
  assert.deepEqual(next.room.appearance,appearance);
  const raw=clone(initial);raw.furniture[0].pose.xMm=10000;delete raw.room.appearance;
  const legacy=S.parseLayout(JSON.stringify(raw)),warnings=S.placementViolations(legacy);
  assert.equal(warnings[0].code,'ROOM_OUT_OF_BOUNDS');
  const changed=replace(legacy,appearance);
  assert.deepEqual(changed.furniture,legacy.furniture);assert.deepEqual(S.placementViolations(changed),warnings);
});

test('five-runtime-languages-match-authoritative-message-text-and-revisions',()=>{
  const source=JSON.parse(readFileSync(new URL('../localization/source.json',import.meta.url),'utf8'));
  const keys=['layout.room_appearance','layout.appearance.wall','layout.appearance.floor','layout.appearance.invalid',
    ...F.WALL_FINISHES.map(value=>`layout.appearance.wall.${value}`),...F.FLOOR_FINISHES.map(value=>`layout.appearance.floor.${value}`)];
  for(const language of supportedLanguages){
    const dictionary=['en','ja'].includes(language)?null:JSON.parse(readFileSync(new URL(`../localization/${language}.json`,import.meta.url),'utf8'));
    for(const key of keys){
      const entry=source.entries[key];assert.ok(entry,key);
      assert.equal(messages[language][key],dictionary?dictionary.messages[key].text:entry[language],`${language}/${key}`);
      if(dictionary)assert.equal(dictionary.messages[key].source_revision,sourceRevision(entry),`${language}/${key} revision`);
    }
  }
});

function fixture(){
  const doc=new TestDocument(),container=doc.createElement('aside');doc.body.append(container);
  let state=S.createDefaultLayout();const actions=[];
  const ui=createLayoutUI({container,t:createLayoutTranslator('en'),onAction:action=>{
    actions.push(action);state=S.applyAction(state,action);ui.update(state);
  }});
  ui.update(state);
  const control=id=>container.querySelector(`#${id}`);
  const change=(node,value)=>{node.value=String(value);node.dispatch('input');node.dispatch('change');};
  return {container,ui,control,change,actions,get:()=>state,load:next=>{state=next;ui.update(state);}};
}

test('selectors-translate-labels-restore-values-and-disable-while-rendering',()=>{
  const f=fixture(),wall=f.control('layout-room-wall-finish'),floor=f.control('layout-room-floor-finish');
  assert.equal(wall.value,'paint');assert.equal(floor.value,'oak');
  for(const language of supportedLanguages){
    f.ui.setLocale(createLayoutTranslator(language));
    for(const [surface,select,values]of [['wall',wall,F.WALL_FINISHES],['floor',floor,F.FLOOR_FINISHES]]){
      assert.equal(select.parentNode.firstChild.textContent,messages[language][`layout.appearance.${surface}`]);
      assert.deepEqual(select.options.map(o=>o.value),values);
      assert.deepEqual(select.options.map(o=>o.textContent),values.map(value=>messages[language][`layout.appearance.${surface}.${value}`]));
    }
  }
  f.change(wall,'linen');f.change(floor,'concrete');const saved=S.serializeLayout(f.get());
  const count=f.actions.length;f.change(wall,'linen');assert.equal(f.actions.length,count);
  f.ui.setStatus({busy:true});assert.ok(wall.disabled&&floor.disabled);f.change(wall,'stripe');assert.equal(f.actions.length,count);
  f.ui.setStatus({busy:false});f.load(S.createDefaultLayout());assert.equal(wall.value,'paint');assert.equal(floor.value,'oak');
  f.load(S.parseLayout(saved));assert.equal(wall.value,'linen');assert.equal(floor.value,'concrete');
  const legacy=clone(S.createDefaultLayout());delete legacy.room.appearance;const before=JSON.stringify(legacy);
  f.load(legacy);assert.equal(wall.value,'paint');assert.equal(floor.value,'oak');assert.equal(JSON.stringify(legacy),before);
  f.ui.dispose();
});

test('appearance-change-preserves-L-and-custom-drafts-and-exact-height-until-apply',()=>{
  const f=fixture(),shape=f.control('layout-room-shape'),apply=f.control('layout-room-apply');
  f.change(shape,'l');
  f.change(f.control('layout-field-room-width'),6000);f.change(f.control('layout-field-room-depth'),5000);
  f.change(f.control('layout-field-room-height'),2555.123456789);
  f.change(f.control('layout-field-room-cut-width'),1234.56789);f.change(f.control('layout-field-room-cut-depth'),1500);
  const polygon=clone(f.get().room.polygonMm);f.change(f.control('layout-room-wall-finish'),'linen');
  assert.equal(shape.value,'l');assert.equal(f.control('layout-field-room-cut-width').value,'1234.56789');
  assert.deepEqual(f.get().room.polygonMm,polygon);assert.equal(f.get().room.wallHeightMm,2400);
  f.ui.setLocale(createLayoutTranslator('ja'));apply.click();
  assert.equal(f.get().room.wallHeightMm,2555.123456789);assert.equal(f.get().room.polygonMm[3][0],3000-1234.56789);
  assert.deepEqual(f.get().room.appearance,{wall:'linen',floor:'oak'});
  f.change(shape,'custom');const points=f.control('layout-room-points');
  const draft='0, 0\n5000.123456789, 0\n4500, 4000\n0, 3000';points.value=draft;points.dispatch('input');
  f.change(f.control('layout-room-floor-finish'),'tile');assert.equal(points.value,draft);assert.equal(shape.value,'custom');
  apply.click();assert.equal(f.get().room.polygonMm[1][0],5000.123456789);
  assert.deepEqual(f.get().room.appearance,{wall:'linen',floor:'tile'});
  const accepted=f.get();points.value='0, 0\n100, 100\n0, 100\n100, 0';points.dispatch('input');apply.click();
  assert.strictEqual(f.get(),accepted);assert.deepEqual(f.get().room.appearance,{wall:'linen',floor:'tile'});
  f.ui.dispose();
});

console.log(JSON.stringify({status:'PASS',cases:tests.length,tests,languages:supportedLanguages,scope:'State/UI/authoritative locale regression with DOM fixtures; no renderer or native-solid claim.'}));
