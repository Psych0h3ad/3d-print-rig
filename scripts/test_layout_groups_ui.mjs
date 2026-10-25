// Actual UI/i18n modules with DOM event fixtures; no browser, models or native jobs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const argument=process.argv.indexOf('--site');
const site=argument<0?resolve(dirname(fileURLToPath(import.meta.url)),'../site'):resolve(process.argv[argument+1]);
const uiPath=resolve(site,'layout/layout-ui.mjs'), languagePath=resolve(site,'layout/layout-i18n.mjs');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const inputs={[uiPath]:hash(uiPath),[languagePath]:hash(languagePath)};
const {createLayoutUI}=await import(pathToFileURL(uiPath));
const {createLayoutTranslator,supportedLanguages,messages}=await import(pathToFileURL(languagePath));
const {createDefaultLayout,createDesk,createShelf}=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const catalog=[{id:'printer-model',label:'Test printer',widthMm:200,depthMm:200,heightMm:300}];
const printer=(id,parentId=null)=>({id,machineId:'printer-model',attachment:{parentId,surfaceId:parentId==='shelf-1'?'level-1':parentId?'top':'floor',xMm:0,zMm:0,yawDeg:0}});
const unit=()=>({id:'unit-1',name:'North bench',pose:{xMm:123.456789,zMm:-234.567891,yawDeg:17.891234},memberIds:['desk-1','floor-1']});
function plan(groups){
  return {...createDefaultLayout(),furniture:[createDesk({id:'desk-1'}),createShelf({id:'shelf-1'})],
    printers:[printer('desk-child-1','desk-1'),printer('desk-child-2','desk-1'),printer('shelf-child','shelf-1'),printer('floor-1'),printer('floor-2')],...(groups===undefined?{}:{groups})};
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
const results=[];
async function test(name,run){try{await run();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}}
function setup(state=plan(),selection=null,onAction){
  const doc=new TestDocument(),container=doc.createElement('aside'),actions=[];doc.body.append(container);
  const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:action=>{actions.push(action);return onAction?.(action);}});
  ui.update(state,selection);
  const find=selector=>{const node=container.querySelector(selector);assert(node,`Missing control ${selector}`);return node;};
  const command=key=>find(`[data-layout-command="${key}"]`);
  const field=key=>find(`[data-layout-field="${key}"]`);
  const change=(node,value)=>{node.value=String(value);node.dispatch('input');node.dispatch('change');};
  const pick=(id,checked=true)=>{const n=find(`[data-layout-group-member="${id}"]`);n.checked=checked;n.dispatch('change');return n;};
  return {doc,container,ui,actions,find,command,field,change,pick};
}

await test('optional groups preserve normal object editing and native empty reset',()=>{
  const r=setup(plan(),'desk-1');assert.equal(r.field('widthMm').value,'1200.0');
  assert.equal(r.find('#layout-groups').children.length,0);assert.equal(r.command('layout.group.create').disabled,true);
  r.ui.update(createDefaultLayout());assert.equal(r.container.querySelectorAll('[data-layout-group-member]').length,0);
  assert.equal(r.command('layout.nav.selection').disabled,false);r.ui.dispose();
});
await test('only furniture and floor printer rows have labelled native checkboxes',()=>{
  const r=setup(),checks=r.container.querySelectorAll('[data-layout-group-member]');
  assert.deepEqual(checks.map(n=>n.dataset.layoutGroupMember),['desk-1','shelf-1','floor-1','floor-2']);
  for(const n of checks){assert.equal(n.type,'checkbox');assert.equal(n.parentNode.tagName,'LABEL');assert.equal(n.parentNode.parentNode.tagName,'LI');assert.equal(n.parentNode.parentNode.querySelector('button').contains(n),false);assert(n.getAttribute('aria-describedby').includes('layout-group-help'));assert(n.parentNode.textContent.includes('Include'));}
  assert.equal(r.container.querySelectorAll('[data-layout-entity]').length,7);r.ui.dispose();
});
await test('create emits a descriptive name and distinct roots, including attached children only implicitly',()=>{
  const state=freeze(plan()),before=JSON.stringify(state),r=setup(state);
  r.pick('desk-1');r.pick('desk-1');r.pick('floor-1');r.change(r.find('#layout-group-name'),'  West printers  ');
  assert.equal(r.find('#layout-group-picked').textContent,'Selected: 2 · Printers: 3 · Furniture: 1');
  assert.equal(r.command('layout.group.create').disabled,false);r.command('layout.group.create').click();
  assert.deepEqual(r.actions,[{type:'group-create',name:'West printers',memberIds:['desk-1','floor-1']}]);
  assert.equal(JSON.stringify(state),before);assert.equal(r.find('#layout-groups').children.length,0,'Application must provide the committed state');r.ui.dispose();
});
await test('unnamed selections use a default name; no selected roots disable creation',()=>{
  const r=setup();r.change(r.find('#layout-group-name'),'   ');r.pick('desk-1');assert.equal(r.command('layout.group.create').disabled,false);
  r.command('layout.group.create').click();assert.deepEqual(r.actions.pop(),{type:'group-create',name:'Printer cell',memberIds:['desk-1']});
  r.change(r.find('#layout-group-name'),'Bench');assert.equal(r.command('layout.group.create').disabled,false);
  r.pick('desk-1',false);assert.equal(r.command('layout.group.create').disabled,true);r.command('layout.group.create').click();assert.equal(r.actions.length,0);r.ui.dispose();
});
await test('Enter and form submission delegate the same create action once',()=>{
  const r=setup();r.pick('floor-1');r.change(r.find('#layout-group-name'),'Floor row');let prevented=0;
  const event={key:'Enter',preventDefault(){prevented++;}};
  for(const listener of r.find('#layout-group-name').listeners.get('keydown'))listener(event);
  assert.equal(prevented,1);assert.deepEqual(r.actions,[{type:'group-create',name:'Floor row',memberIds:['floor-1']}]);
  const form=r.find('#layout-group-name').parentNode.parentNode;
  for(const listener of form.listeners.get('submit'))listener({preventDefault(){prevented++;}});
  assert.equal(prevented,2);assert.equal(r.actions.length,2);r.ui.dispose();
});
await test('assigned roots can be copied or regrouped after busy and locale changes',()=>{
  const state=freeze(plan([unit()])),r=setup(state),desk=r.find('[data-layout-group-member="desk-1"]');
  assert.equal(desk.disabled,false);assert.equal(r.find('[data-layout-group-member="floor-1"]').disabled,false);
  const help=desk.getAttribute('aria-describedby').split(' ').map(id=>r.find(`#${id}`).textContent).join(' ');assert(help.includes('North bench'));assert(help.includes('new group'));
  r.ui.setStatus({busy:true});assert.equal(desk.disabled,true);r.ui.setStatus({busy:false});assert.equal(desk.disabled,false);assert.equal(r.find('[data-layout-group-member="floor-2"]').disabled,false);
  for(const language of supportedLanguages){r.ui.setLocale(createLayoutTranslator(language));assert.equal(r.find('[data-layout-group-member="desk-1"]').disabled,false);}
  assert.equal(r.actions.length,0);r.ui.dispose();
});
await test('grouped roots stay selected; removed and newly attached roots are pruned',()=>{
  const state=plan(),r=setup(state);r.change(r.find('#layout-group-name'),'Draft');r.pick('desk-1');r.pick('floor-1');r.pick('floor-2');
  const next={...state,groups:[{...unit(),memberIds:['desk-1']}],printers:state.printers.filter(p=>p.id!=='floor-2').map(p=>p.id==='floor-1'?printer(p.id,'shelf-1'):p)};
  r.ui.update(next);assert.equal(r.command('layout.group.create').disabled,false);assert.equal(r.find('#layout-group-picked').textContent,'Selected: 1 · Printers: 2 · Furniture: 1');
  assert.equal(r.container.querySelector('[data-layout-group-member="floor-1"]'),null);r.pick('shelf-1');r.command('layout.group.create').click();
  assert.deepEqual(r.actions.at(-1),{type:'group-create',name:'Draft',memberIds:['desk-1','shelf-1']});r.ui.dispose();
});
await test('group rows select their own IDs and count attached printers once',()=>{
  const r=setup(plan([unit()]),'unit-1'),row=r.find('[data-layout-group="unit-1"]');
  assert.equal(row.getAttribute('aria-label'),'A · North bench');assert.equal(row.getAttribute('aria-pressed'),'true');
  assert(row.textContent.includes('Printers: 3 · Furniture: 1'));row.click();assert.deepEqual(r.actions,[{type:'select',id:'unit-1'}]);
  assert.equal(r.container.querySelectorAll('[data-layout-group]').filter(n=>n.getAttribute('aria-pressed')==='true').length,1);r.ui.dispose();
});
await test('group selection remains available in real workspace panels without editing state',()=>{
  const state=plan([unit()]),r=setup(state,{id:'unit-1'}),before=JSON.stringify(state);
  r.container.scrollTo=()=>{throw Error('Tabs must not scroll the page');};
  r.command('layout.nav.room').click();assert.equal(r.find('#layout-nav-selection').hidden,true);
  r.command('layout.nav.selection').click();assert.equal(r.find('#layout-nav-selection').hidden,false);
  assert.equal(r.command('layout.nav.selection').getAttribute('aria-selected'),'true');assert.equal(JSON.stringify(state),before);assert.equal(r.actions.length,0);r.ui.dispose();
});
await test('group editor ignores internal fields and exposes world pose without furniture controls',()=>{
  const group={...unit(),originPose:{xMm:999,zMm:999,yawDeg:999},memberPoses:[{id:'desk-1',xMm:999,zMm:999,yawDeg:999}],type:'desk',machineId:'ignored-internal',attachment:{xMm:999,zMm:999,yawDeg:999},levels:[{id:'ignored'}]},r=setup(freeze(plan([group])),'unit-1');
  assert.equal(r.find('#layout-group-edit-name').value,group.name);assert.equal(r.field('xMm').value,'123.5');assert.equal(r.field('zMm').value,'-234.6');assert.equal(r.field('yawDeg').value,'17.9');
  for(const name of ['widthMm','depthMm','heightMm','topThicknessMm','boardThicknessMm','support'])assert.equal(r.container.querySelector(`[data-layout-field="${name}"]`),null);
  assert(r.find('#layout-nav-selection').textContent.includes('Room position and rotation'));assert.equal(r.container.querySelector('#layout-detach'),null);r.ui.dispose();
});
await test('group rename, exact world transforms and lifecycle buttons emit only contracted actions',()=>{
  const state=freeze(plan([unit()])),before=JSON.stringify(state),r=setup(state,'unit-1');
  r.change(r.find('#layout-group-edit-name'),'  East bench  ');r.change(r.field('xMm'),-50.123456789);r.change(r.field('zMm'),180.987654321);r.change(r.field('yawDeg'),-37.125);
  for(const key of ['layout.group.save','layout.duplicate','layout.group.ungroup','layout.delete'])r.command(key).click();
  assert.deepEqual(r.actions,[{type:'group-rename',id:'unit-1',name:'East bench'},{type:'group-transform',id:'unit-1',patch:{xMm:-50.123456789}},{type:'group-transform',id:'unit-1',patch:{zMm:180.987654321}},{type:'group-transform',id:'unit-1',patch:{yawDeg:-37.125}},{type:'group-save',id:'unit-1'},{type:'duplicate',id:'unit-1'},{type:'group-ungroup',id:'unit-1'},{type:'delete',id:'unit-1'}]);
  assert.equal(JSON.stringify(state),before);r.ui.dispose();
});
await test('invalid numeric and blank rename commits do not emit; rounded no-op fields remain exact',()=>{
  const r=setup(plan([unit()]),'unit-1');r.change(r.find('#layout-group-edit-name'),' ');assert.equal(r.find('#layout-group-edit-name').getAttribute('aria-invalid'),'true');
  r.find('#layout-group-edit-name').blur();assert.equal(r.find('#layout-group-edit-name').value,'North bench');
  r.change(r.field('xMm'),'');r.change(r.field('zMm'),'Infinity');r.field('yawDeg').focus();r.field('yawDeg').blur();r.field('yawDeg').dispatch('change');assert.equal(r.actions.length,0);r.ui.dispose();
});
await test('external transforms, rename, membership, A-to-B-to-A and reset refresh the editor',()=>{
  const state=plan([unit(),{id:'unit-2',name:'Shelf bank',pose:{xMm:800,zMm:900,yawDeg:90},memberIds:['shelf-1']}]),r=setup(state,'unit-1');
  const x=r.field('xMm');r.ui.update({...state,groups:[{...unit(),name:'Changed',pose:{xMm:-888.123,zMm:44.567,yawDeg:-90}},state.groups[1]]},'unit-1');
  assert.strictEqual(r.field('xMm'),x);assert.equal(x.value,'-888.1');assert.equal(r.find('#layout-group-edit-name').value,'Changed');
  r.ui.update(state,'unit-2');assert.equal(r.find('#layout-group-edit-name').value,'Shelf bank');assert.equal(r.field('xMm').value,'800.0');
  r.ui.update(JSON.parse(JSON.stringify(state)),'unit-1');assert.equal(r.find('#layout-group-edit-name').value,'North bench');assert.equal(r.field('xMm').value,'123.5');
  r.ui.update({...state,groups:[{...unit(),memberIds:['floor-2']}]},'unit-1');assert.deepEqual(r.container.querySelectorAll('[data-layout-group-object]').map(n=>n.dataset.layoutGroupObject),['floor-2']);
  r.ui.update(createDefaultLayout(),null);assert.equal(r.container.querySelector('#layout-group-edit-name'),null);assert.equal(r.command('layout.nav.selection').disabled,false);assert.equal(r.actions.length,0);r.ui.dispose();
});
await test('group members individually select furniture, implicit attached printers and floor printers',()=>{
  const r=setup(plan([unit()]),'unit-1'),members=r.container.querySelectorAll('[data-layout-group-object]');
  assert.deepEqual(members.map(n=>n.dataset.layoutGroupObject),['desk-1','desk-child-1','desk-child-2','floor-1']);
  assert.equal(r.find('#layout-nav-selection').querySelectorAll('input').filter(n=>n.type==='checkbox').length,0);
  for(const b of members)b.click();assert.deepEqual(r.actions,members.map(b=>({type:'select',id:b.dataset.layoutGroupObject})));
  r.ui.update(plan([unit()]),'desk-child-1');assert(r.container.querySelector('#layout-support'));assert.equal(r.container.querySelector('#layout-group-edit-name'),null);r.ui.dispose();
});
await test('saved units library copies metadata and delegates placement and removal without state edits',()=>{
  const state=freeze(plan([unit()])),before=JSON.stringify(state),r=setup(state);
  const items=freeze([{id:'template-1',name:'Bench set',printerCount:3,furnitureCount:1,internal:'ignored'}]);r.ui.setGroupLibrary(items);
  const row=r.find('[data-layout-template="template-1"]');assert(row.textContent.includes('Bench set'));assert(row.textContent.includes('Printers: 3 · Furniture: 1'));assert(!row.textContent.includes('ignored'));
  for(const key of ['layout.group.place','layout.group.removeTemplate'])assert(r.find(`#${r.command(key).getAttribute('aria-describedby')}`).textContent.includes('Bench set'));
  r.command('layout.group.place').click();r.command('layout.group.removeTemplate').click();
  assert.deepEqual(r.actions,[{type:'group-place',templateId:'template-1'},{type:'group-template-remove',templateId:'template-1'}]);assert.equal(JSON.stringify(state),before);assert.equal(r.find('#layout-group-library').children.length,1,'Removal waits for app confirmation');
  r.ui.setGroupLibrary([]);assert.equal(r.find('#layout-group-library').children.length,0);assert.equal(r.find('[data-layout-i18n="layout.group.libraryEmpty"]').hidden,false);r.ui.dispose();
});
await test('library replacement and locale rebuilds remove detached listeners',()=>{
  const r=setup();r.ui.setGroupLibrary([{id:'old',name:'Old',printerCount:1,furnitureCount:0}]);const old=r.command('layout.group.place');
  r.ui.setGroupLibrary([{id:'new',name:'New',printerCount:2,furnitureCount:1}]);old.click();assert.equal(r.actions.length,0);
  const replaced=r.command('layout.group.place');r.ui.setLocale(createLayoutTranslator('ja'));replaced.click();assert.equal(r.actions.length,0);
  r.command('layout.group.place').click();assert.deepEqual(r.actions,[{type:'group-place',templateId:'new'}]);r.ui.dispose();
});
await test('busy freezes new group controls, draft and library while cancel stays available',()=>{
  const r=setup(plan([unit()]),'unit-1');r.ui.setGroupLibrary([{id:'saved',name:'Saved',printerCount:2,furnitureCount:1}]);r.pick('shelf-1');r.change(r.find('#layout-group-name'),'Draft');r.ui.setStatus({busy:true});
  for(const key of ['layout.group.create','layout.group.save','layout.group.ungroup','layout.duplicate','layout.delete','layout.group.place','layout.group.removeTemplate']){assert.equal(r.command(key).disabled,true);r.command(key).click();}
  assert.equal(r.find('#layout-group-name').disabled,true);assert.equal(r.find('#layout-group-edit-name').disabled,true);assert.equal(r.field('xMm').disabled,true);assert.equal(r.command('layout.nav.selection').disabled,true);assert.equal(r.actions.length,0);
  r.ui.setGroupLibrary([{id:'new-saved',name:'New saved',printerCount:1,furnitureCount:0}]);assert.equal(r.command('layout.group.place').disabled,true);
  r.ui.setLocale(createLayoutTranslator('ko'));assert.equal(r.command('layout.group.save').disabled,true);r.command('cancel').click();assert.deepEqual(r.actions,[{type:'cancel'}]);r.ui.setStatus({busy:false});
  assert.equal(r.command('layout.group.create').disabled,false);assert.equal(r.find('#layout-group-name').value,'Draft');assert.equal(r.find('[data-layout-group-member="shelf-1"]').checked,true);assert.equal(r.find('[data-layout-group-member="desk-1"]').disabled,false);r.ui.dispose();
});
await test('all five languages retranslate dynamic group text and library while keeping user names and exact state',()=>{
  const state=freeze(plan([unit()])),before=JSON.stringify(state),r=setup(state,'unit-1');r.ui.setGroupLibrary([{id:'saved',name:'Literal saved name',printerCount:3,furnitureCount:1}]);
  r.pick('floor-2');r.change(r.find('#layout-group-name'),'Draft name');
  for(const language of [...supportedLanguages].reverse().concat('en')){
    const t=createLayoutTranslator(language);r.ui.setLocale(t);
    for(const node of r.container.querySelectorAll('[data-layout-i18n]'))assert.equal(node.textContent,t(node.dataset.layoutI18n,node._layoutValues||{}),`${language}: ${node.dataset.layoutI18n}`);
    for(const key of ['layout.group.create','layout.group.save','layout.group.ungroup','layout.group.place','layout.group.removeTemplate'])assert.equal(r.command(key).getAttribute('aria-label'),t(key));
    assert.equal(r.find('#layout-group-name').value,'Draft name');assert.equal(r.find('#layout-group-edit-name').value,'North bench');assert.equal(r.field('xMm').value,'123.5');assert(r.find('#layout-group-library').textContent.includes('Literal saved name'));assert.equal(r.command('layout.nav.selection').disabled,false);
    for(const key of Object.keys(messages.en).filter(k=>k.startsWith('layout.group.')||k==='layout.farm'))assert(!/\p{Extended_Pictographic}/u.test(messages[language][key]));
  }
  assert.equal(r.actions.length,0);assert.equal(JSON.stringify(state),before);r.ui.dispose();
});
await test('untrusted unit names are literal text; new icons are hidden vector SVG paths',()=>{
  const name='<img src=x onerror=alert(1)>',r=setup(plan([{...unit(),name}]),'unit-1');r.ui.setGroupLibrary([{id:'literal',name,printerCount:1,furnitureCount:0}]);
  assert.equal(r.find('[data-layout-group="unit-1"]').getAttribute('aria-label'),`A · ${name}`);assert.equal(r.find('#layout-group-edit-name').value,name);assert(r.find('#layout-group-library').textContent.includes(name));assert.equal(r.container.querySelector('img'),null);assert.equal(r.container.querySelector('script'),null);
  for(const key of ['layout.group.create','layout.group.save','layout.group.ungroup','layout.group.place']){const svg=r.command(key).querySelector('svg');assert(svg);assert.equal(svg.getAttribute('aria-hidden'),'true');assert(svg.querySelector('path').getAttribute('d'));}r.ui.dispose();
});
await test('app group names, browser-local save status and validation codes have explicit translations',()=>{
  const keys=['layout.group.defaultName','layout.group.saved','layout.group.libraryUnavailable',
    ...['GROUP_NAME','GROUP_MEMBERS','GROUP_MEMBER_ASSIGNED','GROUP_ROOT_REQUIRED','GROUP_LIMIT','GROUP_TEMPLATE','GROUP_LIBRARY_LIMIT','GROUP_LIBRARY_STORAGE','GROUP_POSE_MISMATCH','ENVELOPE_OVERLAP','ROOM_HEIGHT_EXCEEDED'].map(code=>`layout.error.${code}`)];
  for(const language of supportedLanguages){const t=createLayoutTranslator(language);for(const key of keys){assert(Object.hasOwn(messages[language],key),`${language}: ${key}`);assert.equal(t(key),messages[language][key]);assert.notEqual(t(key),messages[language]['layout.error.generic']);}}
  assert.equal(createLayoutTranslator('ja')('layout.group.defaultName'),'プリンターセット');
  assert.match(createLayoutTranslator('en')('layout.group.saved'),/this browser/);
});
await test('failed app transactions report errors and leave draft, library and state owned by the app',async()=>{
  const r=setup(plan([unit()]),'unit-1',()=>Promise.reject(new Error('Storage unavailable')));r.ui.setGroupLibrary([{id:'saved',name:'Saved',printerCount:1,furnitureCount:0}]);r.command('layout.group.save').click();await Promise.resolve();await Promise.resolve();
  assert.equal(r.find('[role="status"]').textContent,'Storage unavailable');assert.equal(r.find('#layout-group-library').children.length,1);assert.equal(r.find('#layout-group-edit-name').value,'North bench');r.ui.dispose();
});
await test('dispose disables retained controls and later library or locale updates',()=>{
  const r=setup(plan([unit()]),'unit-1');r.ui.setGroupLibrary([{id:'saved',name:'Saved',printerCount:1,furnitureCount:0}]);const save=r.command('layout.group.save'),place=r.command('layout.group.place');r.ui.dispose();
  save.click();place.click();r.ui.setGroupLibrary([{id:'late',name:'Late',printerCount:0,furnitureCount:0}]);r.ui.setLocale(createLayoutTranslator('ru'));r.ui.update(plan([unit()]),'unit-1');assert.equal(r.actions.length,0);assert.equal(r.container.children.length,0);
});

await test('bulk selection includes assigned roots and supported printers once, then clears',()=>{
  const r=setup(plan([unit()]));r.command('layout.selection.all').click();
  assert.deepEqual(r.ui.getPickedRootIds(),['desk-1','shelf-1','floor-1','floor-2']);
  assert.equal(r.find('#layout-group-picked').textContent,'Selected: 4 · Printers: 5 · Furniture: 2');
  r.command('layout.selection.copy').click();assert.deepEqual(r.actions.pop(),{type:'copy',selectionIds:r.ui.getPickedRootIds()});
  r.command('layout.selection.clear').click();assert.deepEqual(r.ui.getPickedRootIds(),[]);assert.equal(r.command('layout.selection.copy').disabled,true);r.ui.dispose();
});
await test('copy and paste controls reflect current selection, buffer and busy state',()=>{
  const r=setup();assert.equal(r.command('copy').disabled,true);assert.equal(r.command('paste').disabled,true);
  r.ui.update(plan(),'desk-1');assert.equal(r.command('copy').disabled,false);r.command('copy').click();assert.deepEqual(r.actions.pop(),{type:'copy'});
  r.ui.setStatus({canPaste:true});r.command('paste').click();assert.deepEqual(r.actions.pop(),{type:'paste'});
  r.ui.setStatus({busy:true});assert.equal(r.command('copy').disabled,true);assert.equal(r.command('paste').disabled,true);
  r.command('layout.selection.all').click();assert.deepEqual(r.ui.getPickedRootIds(),[]);
  r.ui.setStatus({busy:false});assert.equal(r.command('paste').disabled,false);r.ui.dispose();
});
await test('clipboard and bulk controls translate without emoji and retain SVG labels',()=>{
  const r=setup(plan(),'desk-1');r.ui.setStatus({canPaste:true});
  for(const language of supportedLanguages){const translate=createLayoutTranslator(language);r.ui.setLocale(translate);
    for(const [command,key]of [['copy','layout.clipboard.copy'],['paste','layout.clipboard.paste'],['layout.selection.all','layout.selection.all'],['layout.selection.clear','layout.selection.clear']]){
      const b=r.command(command);assert.equal(b.getAttribute('aria-label'),translate(key));assert.equal(b.querySelector('svg').getAttribute('aria-hidden'),'true');
    }
    assert.equal(r.find('#layout-group-name').placeholder,translate('layout.group.defaultName'));
  }r.ui.dispose();
});
assert.deepEqual(results.filter(r=>!r.pass),[],'Farm grouping DOM regressions');
for(const [path,sha256]of Object.entries(inputs))assert.equal(hash(path),sha256,'UI input changed during the run: '+path);
console.log(JSON.stringify({status:'PASS',cases:results.length,languages:supportedLanguages,sourceInputs:inputs,
  scope:'Actual UI/i18n modules with DOM event fixtures; action delegation, no app transactions, browser, model or native-clearance claim.'}));
