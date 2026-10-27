// UI contract tests with DOM events; no renderer, browser, models or native jobs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const argument=process.argv.indexOf('--site');
const site=argument<0?resolve(dirname(fileURLToPath(import.meta.url)),'../site'):resolve(process.argv[argument+1]);
const uiPath=resolve(site,'layout/layout-ui.mjs'),languagePath=resolve(site,'layout/layout-i18n.mjs');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const inputs={[uiPath]:hash(uiPath),[languagePath]:hash(languagePath)};
const {createLayoutUI}=await import(pathToFileURL(uiPath));
const {createLayoutTranslator,supportedLanguages,messages}=await import(pathToFileURL(languagePath));
const {createDefaultLayout,createDesk,createShelf}=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const catalog=[{id:'fixture-printer',label:'Workshop printer',widthMm:200,depthMm:180,heightMm:300}];
const printer=(id,parentId=null)=>({id,machineId:catalog[0].id,attachment:{parentId,surfaceId:parentId==='shelf'?'level-1':parentId?'top':'floor',xMm:0,zMm:0,yawDeg:0}});
function plan(){
  return {...createDefaultLayout(),furniture:[createDesk({id:'desk'}),createShelf({id:'shelf'})],
    printers:[printer('desk-child','desk'),printer('shelf-child','shelf'),printer('floor')],
    groups:[{id:'unit',name:'Bench',pose:{xMm:0,zMm:0,yawDeg:0},memberIds:['desk']}]};
}
function setup(state=plan(),onPickedChange){
  const document=new TestDocument(),container=document.createElement('aside'),actions=[],notifications=[];
  document.body.append(container);
  const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:action=>actions.push(action),
    onPickedChange:ids=>{notifications.push([...ids]);onPickedChange?.(ids);}});
  ui.update(state);
  const find=(selector,parent=container)=>{const node=parent.querySelector(selector);assert(node,`Missing control ${selector}`);return node;};
  const command=(key,parent)=>find(`[data-layout-command="${key}"]`,parent);
  const pick=(id,checked=true)=>{const checkbox=find(`[data-layout-group-member="${id}"]`);checkbox.checked=checked;checkbox.dispatch('change');};
  const strip=find('#layout-selection-actions'),count=find('#layout-selection-count');
  return {ui,container,document,actions,notifications,find,command,pick,strip,count,state};
}
const results=[];
function test(name,run){try{run();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}}

test('empty selection hides the strip; the collapsible object body retains hint and actions outside tab panels',()=>{
  const r=setup();assert.equal(r.strip.hidden,true);assert.deepEqual(r.notifications,[]);
  const objects=r.find('#layout-nav-objects'),body=r.find('#layout-browser-body');
  assert.equal(body.parentNode===objects,true,'The collapsible body stays in the object browser');
  assert.equal(r.strip.parentNode===body,true,'Selection actions stay with the collapsible object list');
  assert.equal(r.find('#layout-selection-hint').parentNode===body,true,'The hint stays with its object list');
  assert.equal(r.find('#layout-selection-hint').textContent,'Shift-click to select several. In 2D, Shift-drag a selection box.');
  assert.equal(r.strip.getAttribute('aria-labelledby'),r.count.id);assert.equal(r.count.getAttribute('aria-live'),'polite');
  for(const button of r.strip.querySelectorAll('button'))assert.equal(button.disabled,true);
  r.ui.setPickedRootIds(['desk']);
  for(const name of ['room','add','output','selection']){
    r.command(`layout.nav.${name}`).click();assert.equal(r.strip.hidden,false);
    assert.equal(r.find(`#layout-nav-${name}`).contains(r.strip),false);
  }
  assert.deepEqual(r.notifications,[['desk']]);r.ui.dispose();
});

test('checkboxes notify each distinct set once, including unchecks, with canonical root IDs',()=>{
  const r=setup();r.pick('floor');r.pick('desk');r.pick('desk');
  assert.deepEqual(r.notifications,[['floor'],['desk','floor']]);
  assert.deepEqual(r.ui.getPickedRootIds(),['desk','floor']);assert.equal(r.count.textContent,'Selected: 2');
  assert.equal(r.find('#layout-group-picked').textContent,'Selected: 2 · Printers: 2 · Furniture: 1');
  assert.equal(r.container.querySelector('[data-layout-group-member="desk-child"]'),null);
  r.pick('floor',false);r.pick('floor',false);r.pick('desk',false);
  assert.deepEqual(r.notifications,[['floor'],['desk','floor'],['desk'],[]]);
  assert.equal(r.strip.hidden,true);assert.equal(r.count.textContent,'Selected: 0');assert.deepEqual(r.actions,[]);r.ui.dispose();
});

test('programmatic selection rejects non-roots, deduplicates and synchronizes checkboxes',()=>{
  const r=setup();r.ui.setPickedRootIds(['missing','desk-child','unit',null,42]);assert.deepEqual(r.notifications,[]);
  r.ui.setPickedRootIds(['floor','desk','floor','desk-child',{},null]);
  assert.deepEqual(r.ui.getPickedRootIds(),['desk','floor']);assert.deepEqual(r.notifications,[['desk','floor']]);
  assert.equal(r.find('[data-layout-group-member="desk"]').checked,true);
  assert.equal(r.find('[data-layout-group-member="floor"]').checked,true);
  assert.equal(r.find('[data-layout-group-member="shelf"]').checked,false);
  r.ui.setPickedRootIds(['desk','floor']);r.ui.setPickedRootIds(['floor','desk','missing']);
  r.ui.update(r.state,'shelf');r.ui.setStatus({canUndo:true});r.ui.setProjection('orthographic-floorplan');
  r.command('layout.browser.printers').click();r.find('#layout-object-search').value='no matches';r.find('#layout-object-search').dispatch('input');
  assert.equal(r.strip.hidden,false);assert.deepEqual(r.notifications,[['desk','floor']]);
  const copy=r.ui.getPickedRootIds();copy.push('missing');assert.deepEqual(r.ui.getPickedRootIds(),['desk','floor']);r.ui.dispose();
});

test('select all and both clear controls notify once and include supported printers only via furniture',()=>{
  const r=setup(),bulk=r.find('#layout-nav-farm');
  r.command('layout.selection.all').click();r.command('layout.selection.all').click();
  assert.deepEqual(r.notifications,[['desk','shelf','floor']]);assert.equal(r.count.textContent,'Selected: 3');
  assert.equal(r.find('#layout-group-picked').textContent,'Selected: 3 · Printers: 3 · Furniture: 2');
  r.command('layout.selection.clear',r.strip).click();r.command('layout.selection.clear',bulk).click();
  assert.deepEqual(r.notifications,[['desk','shelf','floor'],[]]);
  r.command('layout.selection.all').click();r.command('layout.selection.clear',bulk).click();
  assert.deepEqual(r.notifications,[['desk','shelf','floor'],[],['desk','shelf','floor'],[]]);
  for(const checkbox of r.container.querySelectorAll('[data-layout-group-member]'))assert.equal(checkbox.checked,false);
  assert.deepEqual(r.actions,[]);r.ui.dispose();
});

test('visible actions reuse group naming and duplicate exactly the checked roots',()=>{
  const r=setup(),before=JSON.stringify(r.state);r.ui.update(r.state,'shelf');r.ui.setPickedRootIds(['floor','desk']);
  r.command('layout.selection.group',r.strip).click();
  r.find('#layout-group-name').value='  West bench  ';r.command('layout.selection.group',r.strip).click();
  r.command('layout.group.create').click();r.command('layout.selection.duplicate',r.strip).click();
  assert.deepEqual(r.actions,[
    {type:'group-create',name:'Printer cell',memberIds:['desk','floor']},
    {type:'group-create',name:'West bench',memberIds:['desk','floor']},
    {type:'group-create',name:'West bench',memberIds:['desk','floor']},
    {type:'duplicate',selectionIds:['desk','floor']}
  ]);
  r.ui.setPickedRootIds(['shelf']);assert.deepEqual(r.actions.at(-1).selectionIds,['desk','floor']);
  assert.equal(JSON.stringify(r.state),before);assert.deepEqual(r.ui.getPickedRootIds(),['shelf']);
  r.command('layout.selection.clear',r.strip).click();
  r.command('layout.selection.group',r.strip).click();r.command('layout.selection.duplicate',r.strip).click();
  assert.equal(r.actions.length,4);r.ui.dispose();
});

test('busy disables selection actions, checks, clear and select all; unbusy restores them',()=>{
  const r=setup();r.ui.setPickedRootIds(['desk']);r.ui.setStatus({busy:true});
  for(const button of r.strip.querySelectorAll('button')){assert.equal(button.disabled,true);button.click();}
  for(const checkbox of r.container.querySelectorAll('[data-layout-group-member]'))assert.equal(checkbox.disabled,true);
  r.command('layout.selection.all').click();r.command('layout.selection.clear',r.find('#layout-nav-farm')).click();r.ui.setPickedRootIds([]);
  r.ui.setLocale(createLayoutTranslator('de'));assert.equal(r.strip.hidden,false);assert.equal(r.count.textContent,'Ausgewählt: 1');
  for(const button of r.strip.querySelectorAll('button'))assert.equal(button.disabled,true);
  assert.deepEqual(r.actions,[]);assert.deepEqual(r.notifications,[['desk']]);assert.deepEqual(r.ui.getPickedRootIds(),['desk']);
  r.ui.setStatus({busy:false});for(const button of r.strip.querySelectorAll('button'))assert.equal(button.disabled,false);
  r.command('layout.selection.duplicate',r.strip).click();assert.deepEqual(r.actions,[{type:'duplicate',selectionIds:['desk']}]);
  r.command('layout.selection.clear',r.strip).click();assert.deepEqual(r.notifications,[['desk'],[]]);r.ui.dispose();
});

test('updates prune removed and newly supported roots, including while busy, without restoring stale picks',()=>{
  const r=setup();r.ui.setPickedRootIds(['desk','shelf','floor']);
  const next={...r.state,furniture:r.state.furniture.filter(f=>f.id!=='desk'),groups:[],
    printers:r.state.printers.filter(p=>p.id!=='desk-child').map(p=>p.id==='floor'?printer('floor','shelf'):p)};
  r.ui.setStatus({busy:true});r.ui.update(next);r.ui.update(next);
  assert.deepEqual(r.ui.getPickedRootIds(),['shelf']);assert.deepEqual(r.notifications,[['desk','shelf','floor'],['shelf']]);
  assert.equal(r.count.textContent,'Selected: 1');assert.equal(r.find('#layout-group-picked').textContent,'Selected: 1 · Printers: 2 · Furniture: 1');
  assert.equal(r.container.querySelector('[data-layout-group-member="floor"]'),null);
  r.ui.update(createDefaultLayout());r.ui.update(createDefaultLayout());assert.equal(r.strip.hidden,true);
  assert.deepEqual(r.notifications,[['desk','shelf','floor'],['shelf'],[]]);
  r.ui.setStatus({busy:false});r.ui.update(r.state);assert.deepEqual(r.ui.getPickedRootIds(),[]);r.ui.dispose();
});

test('group membership changes keep valid checked roots without another notification',()=>{
  const r=setup();r.ui.setPickedRootIds(['desk','floor']);
  r.ui.update({...r.state,groups:[{...r.state.groups[0],memberIds:['desk','floor']}]},'unit');
  assert.deepEqual(r.ui.getPickedRootIds(),['desk','floor']);assert.deepEqual(r.notifications,[['desk','floor']]);
  assert.equal(r.find('[data-layout-group-member="floor"]').checked,true);r.ui.dispose();
});

test('callbacks see refreshed UI and can synchronously update and echo IDs without recursion',()=>{
  let r,depth=0,maxDepth=0,current=plan();
  r=setup(current,ids=>{
    depth++;maxDepth=Math.max(maxDepth,depth);assert(depth<3,'Selection callback recursed');
    assert.deepEqual(r.ui.getPickedRootIds(),ids);assert.equal(r.count.textContent,`Selected: ${ids.length}`);
    r.ui.update(current);r.ui.setPickedRootIds([...ids].reverse());ids.push('callback mutation');depth--;
  });
  r.ui.setPickedRootIds(['floor','desk']);assert.deepEqual(r.notifications,[['desk','floor']]);assert.equal(maxDepth,1);
  current=createDefaultLayout();r.ui.update(current);assert.deepEqual(r.notifications,[['desk','floor'],[]]);assert.equal(maxDepth,1);
  assert.deepEqual(r.ui.getPickedRootIds(),[]);assert.equal(r.find('[role="status"]').hidden,true);r.ui.dispose();
});

test('all six languages translate count, hint and actions, preserve drafts and use local default names',()=>{
  const r=setup();r.ui.setPickedRootIds(['desk','floor']);
  for(const language of [...supportedLanguages].reverse().concat('en')){
    const t=createLayoutTranslator(language);r.ui.setLocale(t);
    for(const key of ['layout.selection.count','layout.selection.group','layout.selection.duplicate','layout.selection.hint']){
      assert(Object.hasOwn(messages[language],key));assert.equal(typeof messages[language][key],'string');assert(messages[language][key].trim());
      assert(!/\p{Extended_Pictographic}/u.test(messages[language][key]));
    }
    assert.equal(r.count.textContent,t('layout.selection.count',{count:2}));assert.equal(r.find('#layout-selection-hint').textContent,t('layout.selection.hint'));
    for(const [command,key] of [['layout.selection.group','layout.selection.group'],['layout.selection.duplicate','layout.duplicate'],['layout.selection.clear','layout.selection.clear']]){
      const button=r.command(command,r.strip);assert.equal(button.getAttribute('aria-label'),t(key));
      assert.equal(button.querySelector('span').textContent,t(key));assert.equal(button.querySelector('svg').getAttribute('aria-hidden'),'true');
    }
    r.find('#layout-group-name').value=' ';r.command('layout.selection.group',r.strip).click();
    assert.deepEqual(r.actions.pop(),{type:'group-create',name:t('layout.group.defaultName'),memberIds:['desk','floor']});
  }
  r.find('#layout-group-name').value='Literal draft';r.ui.setLocale(createLayoutTranslator('ja'));assert.equal(r.find('#layout-group-name').value,'Literal draft');
  assert.deepEqual(r.notifications,[['desk','floor']]);r.ui.dispose();
});

test('disposal removes selection listeners and later selection changes stay inert',()=>{
  const r=setup();r.ui.setPickedRootIds(['desk']);
  const group=r.command('layout.selection.group',r.strip),clear=r.command('layout.selection.clear',r.strip),check=r.find('[data-layout-group-member="desk"]');
  r.ui.dispose();group.click();clear.click();check.checked=false;check.dispatch('change');
  r.ui.setPickedRootIds(['floor']);r.ui.update(r.state);r.ui.setLocale(createLayoutTranslator('ru'));
  assert.deepEqual(r.notifications,[['desk']]);assert.deepEqual(r.actions,[]);assert.deepEqual(r.ui.getPickedRootIds(),[]);assert.equal(r.container.children.length,0);
});

assert.deepEqual(results.filter(result=>!result.pass),[],'Canvas selection UI DOM regressions');
for(const [path,sha256]of Object.entries(inputs))assert.equal(hash(path),sha256,'UI input changed during the run: '+path);
console.log(JSON.stringify({status:'PASS',cases:results.length,languages:supportedLanguages,sourceInputs:inputs,
  scope:'Actual UI/i18n modules with DOM event fixtures; checked-root notifications and actions only. No renderer gesture, browser visual, model or native-clearance claim.'}));
