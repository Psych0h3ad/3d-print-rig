// DOM contracts for the inspector/drawer workflow. No app startup, renderer,
// browser, model assets, geometry audit or native jobs are executed here.
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const arg=process.argv.indexOf('--site');
const site=arg<0?resolve(dirname(fileURLToPath(import.meta.url)),'../site'):resolve(process.argv[arg+1]);
const {createLayoutUI}=await import(pathToFileURL(resolve(site,'layout/layout-ui.mjs')));
const {createDefaultLayout,createDesk}=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const {createLayoutTranslator,supportedLanguages}=await import(pathToFileURL(resolve(site,'layout/layout-i18n.mjs')));
const catalog=[{id:'source-printer',label:'Source printer',widthMm:200,depthMm:200,heightMm:300}];
const windowOpening={id:'window',type:'window',wallIndex:0,offsetMm:200.125,widthMm:800.375,heightMm:900.625,sillMm:1000.125};
const slidingOpening={id:'sliding',type:'door',wallIndex:1,offsetMm:600.125,widthMm:900.375,heightMm:2100.625,sillMm:0,motion:'sliding',slideDirection:'left',openPercent:37.125};
function fixture(language='en',selection='desk'){
  const document=new TestDocument(),container=document.createElement('aside'),actions=[],openingPicks=[],pickedChanges=[];
  document.body.append(container);document.documentElement={lang:language};
  const state={...createDefaultLayout(),furniture:[createDesk({id:'desk'}),createDesk({id:'other-desk'})],printers:[],groups:[],
    room:{polygonMm:[[-3000,-2000],[3000,-2000],[3000,2000],[-3000,2000]],wallHeightMm:2800,openings:[windowOpening,slidingOpening]}};
  const saved=JSON.stringify(state);let primary=selection,ui;
  ui=createLayoutUI({container,catalog,t:createLayoutTranslator(language),
    onAction:action=>{
      actions.push(action);
      if(action.type==='select'){primary=action.id;ui.update(state,primary);ui.focusSelection();}
      if(action.type==='room-opening-select')ui.setOpeningTool(null);
    },onOpeningSelect:id=>openingPicks.push(id),onPickedChange:ids=>pickedChanges.push(ids)});
  ui.update(state,selection);
  const find=q=>{const n=container.querySelector(q);assert(n,`Missing ${q}`);return n;};
  const command=key=>find(`[data-layout-command="${key}"]`),tab=name=>find(`#layout-tab-${name}`);
  const field=name=>find(`[data-layout-field="${name}"]`),panel=find('#layout-nav-selection').parentNode;
  return {document,container,state,saved,ui,actions,openingPicks,pickedChanges,find,command,tab,field,panel,
    sync:()=>ui.update(state,primary),unchanged:()=>assert.equal(JSON.stringify(state),saved),dispose:()=>ui.dispose()};
}
const results=[];
function test(name,run){let f;try{f=run();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}finally{f?.dispose();}}

test('Items is an explicitly controlled bottom drawer; startup does not invent an opening selection',()=>{
  const f=fixture(),drawer=f.find('#layout-nav-objects'),body=f.find('#layout-browser-body'),toggle=f.find('#layout-browser-toggle');
  const children=drawer.parentNode.children;assert(children.indexOf(f.panel)<children.indexOf(drawer));
  assert.equal(body.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(toggle.getAttribute('aria-controls'),body.id);
  assert.equal(f.find('#layout-opening-editor').hidden,true);assert.equal(f.find('[data-layout-opening-id="window"]').getAttribute('aria-pressed'),'false');
  assert.equal(f.field('xMm').parentNode.parentNode.parentNode.hidden,false);
  for(const name of ['room','add','output','selection']){f.tab(name).click();assert.equal(body.hidden,true);}
  toggle.click();assert.equal(body.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  for(const name of ['room','add','output','selection']){f.tab(name).click();assert.equal(body.hidden,false);}
  f.sync();assert.equal(body.hidden,false);assert.equal(f.find('#layout-opening-editor').hidden,true);assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

test('drawer toggles and all tab roundtrips retain native drafts and independent inspector scroll positions',()=>{
  const f=fixture(),width=f.field('widthMm');width.focus();width.value='1432.125';width.dispatch('input');
  const expected={selection:111,room:222,add:333,output:444};
  // A scroll port clamps against the panel actually visible at assignment time.
  // This catches restoring a tall destination while a shorter panel is still shown.
  let scrollTop=0;Object.defineProperty(f.panel,'scrollTop',{get:()=>scrollTop,set:value=>{
    const active=Object.keys(expected).find(name=>!f.find(`#layout-nav-${name}`).hidden);scrollTop=Math.min(value,expected[active]);
  }});
  for(const [name,scroll]of Object.entries(expected)){f.tab(name).click();f.panel.scrollTop=scroll;}
  f.find('#layout-browser-toggle').click();f.find('#layout-browser-body').scrollTop=75;
  for(const [name,scroll]of Object.entries(expected)){f.tab(name).click();assert.equal(f.panel.scrollTop,scroll);}
  f.find('#layout-browser-toggle').click();f.find('#layout-browser-toggle').click();
  assert.equal(f.panel.scrollTop,444);assert.equal(f.find('#layout-browser-body').scrollTop,75);
  assert.strictEqual(f.field('widthMm'),width);assert.equal(width.value,'1432.125');assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

test('drawer search, explicit checks and group-name draft survive collapse and workspace switches',()=>{
  const f=fixture();assert.equal(f.ui.focusObjectSearch(),true);const search=f.find('#layout-object-search');
  assert.strictEqual(f.document.activeElement,search);search.value='desk';search.dispatch('input');
  const check=f.find('[data-layout-group-member="desk"]');check.checked=true;check.dispatch('change');
  const name=f.find('#layout-group-name');name.value='My bench';name.dispatch('input');
  f.find('#layout-browser-toggle').click();f.tab('room').click();f.tab('selection').click();f.find('#layout-browser-toggle').click();
  assert.strictEqual(f.find('[data-layout-group-member="desk"]'),check);assert.equal(check.checked,true);
  assert.strictEqual(f.find('#layout-group-name'),name);assert.equal(name.value,'My bench');assert.equal(search.value,'desk');
  assert.deepEqual(f.pickedChanges,[['desk']]);f.command('layout.selection.group').click();
  assert.deepEqual(f.actions,[{type:'group-create',name:'My bench',memberIds:['desk']}]);f.unchanged();return f;
});

test('openPrinterCatalog opens Add, scrolls and focuses its search without losing catalog or room drafts',()=>{
  const f=fixture();f.tab('room').click();const roomWidth=f.field('room-width');roomWidth.focus();roomWidth.value='7000.375';roomWidth.dispatch('input');roomWidth.blur();
  const search=f.find('#layout-catalog-search'),scrolls=[];search.scrollIntoView=options=>scrolls.push(options);
  search.value='source';search.dispatch('input');assert.equal(f.ui.openPrinterCatalog(),true);
  assert.equal(f.find('#layout-nav-add').hidden,false);assert.equal(f.tab('add').getAttribute('aria-selected'),'true');
  assert.strictEqual(f.document.activeElement,search);assert.deepEqual(scrolls,[{block:'nearest'}]);assert.equal(search.value,'source');assert.equal(f.find('#layout-machine').value,'source-printer');
  f.tab('room').click();assert.strictEqual(f.field('room-width'),roomWidth);assert.equal(roomWidth.value,'7000.4');
  assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

test('opening scene/list selections share Selected and leave Room inventory and manual tools in Room',()=>{
  const f=fixture();f.tab('room').click();f.ui.setOpeningSelection('window');
  const card=f.find('#layout-opening-editor'),selected=f.find('#layout-nav-selection'),room=f.find('#layout-nav-room');
  assert.strictEqual(card.parentNode,selected);assert.equal(card.hidden,false);assert.equal(selected.hidden,false);assert.equal(room.hidden,true);
  assert.equal(selected.children[1].hidden,true);assert.equal(room.contains(f.find('#layout-opening-list')),true);assert.equal(room.contains(f.find('#layout-opening-add-wall')),true);
  assert.equal(f.find('[data-layout-entity="desk"]').getAttribute('aria-pressed'),'false');
  f.tab('room').click();f.find('[data-layout-opening-id="sliding"]').click();assert.deepEqual(f.openingPicks,['sliding']);
  assert.equal(selected.hidden,false);assert.equal(f.field('opening-openPercent').value,'37.1');
  f.tab('output').click();assert.equal(f.ui.focusSelection(),true);assert.equal(selected.hidden,false);assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

test('same-ID furniture list selection clears opening context; detached opening controls cannot edit it',()=>{
  const f=fixture();f.ui.setOpeningSelection('window');const old=f.field('opening-sillMm');
  old.focus();old.value='1150.875';old.dispatch('input');f.find('[data-layout-entity="desk"]').click();
  assert.equal(f.find('#layout-opening-editor').hidden,true);assert.equal(f.find('#layout-nav-selection').children[1].hidden,false);assert(f.field('widthMm'));
  old.dispatch('change');old.blur();assert.deepEqual(f.actions,[{type:'select',id:'desk'}]);
  for(const name of ['room','add','selection']){f.tab(name).click();f.sync();assert.equal(f.find('#layout-opening-editor').hidden,true);}
  f.ui.setLocale(createLayoutTranslator('ja'));assert.equal(f.find('#layout-opening-editor').hidden,true);f.unchanged();return f;
});

test('changed furniture selection and missing/deleted openings never resurrect the first opening on mirrors or undo',()=>{
  const f=fixture('en',null);f.ui.setOpeningSelection('sliding');f.ui.update(f.state,'other-desk');
  assert.equal(f.find('#layout-opening-editor').hidden,true);assert.equal(f.find('[data-layout-entity="other-desk"]').getAttribute('aria-pressed'),'true');
  f.ui.setOpeningSelection('window');f.ui.update({...f.state,room:{...f.state.room,openings:[slidingOpening]}},null);
  assert.equal(f.find('#layout-opening-editor').hidden,true);f.ui.update(f.state,null);assert.equal(f.find('#layout-opening-editor').hidden,true);
  f.tab('room').click();f.ui.setOpeningSelection('missing');assert.equal(f.find('#layout-nav-room').hidden,false);assert.equal(f.ui.focusSelection(),false);
  f.ui.setOpeningSelection('sliding');f.ui.clearOpeningSelection();f.ui.update(f.state,null);assert.equal(f.find('#layout-opening-editor').hidden,true);
  assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

test('placement setup replaces Room contents and cancels once when selecting properties or opening the catalog',()=>{
  const f=fixture();for(const motion of ['hinged','sliding','hinged']){f.ui.setOpeningTool({kind:'door',motion});assert.equal(f.find('#layout-nav-room').hidden,true);assert.equal(f.ui.openingPlacementContainer.hidden,false);assert.equal(f.ui.openingPlacementContainer.parentNode,f.find('#layout-nav-room').parentNode);assert.equal(f.find('#layout-tab-room').getAttribute('aria-selected'),'true');assert.equal(f.find('#layout-opening-editor').hidden,true);}
  assert.deepEqual(f.actions,[]);f.ui.setOpeningSelection('window');assert.equal(f.find('#layout-nav-selection').hidden,false);assert.equal(f.find('#layout-opening-editor').hidden,false);
  assert.deepEqual(f.actions,[{type:'room-opening-select'}]);
  f.ui.setOpeningTool({kind:'window'});assert.equal(f.ui.openPrinterCatalog(),true);assert.equal(f.find('#layout-nav-add').hidden,false);
  assert.deepEqual(f.actions,[{type:'room-opening-select'},{type:'room-opening-select'}]);assert.equal(f.find('#layout-opening-editor').hidden,true);f.unchanged();return f;
});

test('busy and disposed navigation leave focus, selection, drawer and action counts unchanged',()=>{
  const f=fixture('en',null);f.ui.setOpeningSelection('window');const focused=f.field('opening-widthMm');focused.focus();
  f.ui.setStatus({busy:true});const search=f.find('#layout-catalog-search');search.scrollIntoView=()=>assert.fail('Busy catalog must not scroll');
  assert.equal(f.ui.openPrinterCatalog(),false);assert.equal(f.ui.focusSelection(),false);assert.equal(f.ui.focusObjectSearch(),false);
  f.ui.setOpeningSelection('sliding');f.find('#layout-browser-toggle').click();f.tab('room').click();
  assert.strictEqual(f.document.activeElement,focused);assert.equal(f.find('#layout-nav-selection').hidden,false);assert.equal(f.find('#layout-browser-body').hidden,true);assert.equal(f.field('opening-widthMm').value,'800.4');assert.deepEqual(f.actions,[]);
  f.ui.setStatus({busy:false});search.scrollIntoView=()=>{};assert.equal(f.ui.openPrinterCatalog(),true);f.dispose();
  assert.equal(f.ui.openPrinterCatalog(),false);assert.equal(f.ui.focusSelection(),false);assert.equal(f.ui.focusObjectSearch(),false);assert.deepEqual(f.actions,[]);f.unchanged();return f;
});

for(const language of supportedLanguages)test(`${language}: translations preserve opening identity, focused draft and explicitly closed drawer`,()=>{
  const f=fixture(language,null),t=createLayoutTranslator(language);f.ui.setOpeningSelection('sliding');
  const old=f.field('opening-openPercent');old.focus();old.value='61.875';old.dispatch('input');f.ui.setLocale(t);
  const next=f.field('opening-openPercent');assert.notStrictEqual(next,old);assert.strictEqual(f.document.activeElement,next);assert.equal(next.value,'61.875');
  assert.equal(f.tab('selection').getAttribute('aria-label'),t('layout.nav.selection'));assert.equal(f.tab('selection').getAttribute('aria-selected'),'true');
  assert.equal(f.find('#layout-browser-toggle').getAttribute('aria-label'),t('layout.browser.showItems'));assert.equal(f.find('#layout-browser-body').hidden,true);
  assert.equal(f.find('[data-layout-opening-id="sliding"]').getAttribute('aria-pressed'),'true');assert.equal(f.find('#layout-opening-mode').textContent,t('layout.openings.selectHelp'));
  old.dispatch('change');old.blur();assert.deepEqual(f.actions,[]);next.dispatch('change');assert.deepEqual(f.actions,[{type:'UPDATE_ROOM_OPENING',id:'sliding',patch:{openPercent:61.875}}]);
  assert.equal(f.ui.openPrinterCatalog(),true);assert.equal(f.find('#layout-catalog-search').getAttribute('aria-label'),t('layout.searchPrinters'));f.unchanged();return f;
});

test('scene-tool ports respect busy state and disposal without changing plan state',()=>{
  const document=new TestDocument(),container=document.createElement('aside');document.body.append(container);let refreshes=0,keys=0;
  const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:()=>assert.fail('Tool ports must not mutate the plan'),onToolsRefresh:()=>refreshes++,onBuildToolKey:event=>{keys++;return event.key==='3';}});
  ui.refreshBuildTools();assert.equal(refreshes,1);assert.equal(ui.handleBuildToolKey({key:'3'}),true);assert.equal(keys,1);
  ui.setStatus({busy:true});assert.equal(ui.handleBuildToolKey({key:'3'}),false);assert.equal(keys,1);ui.refreshBuildTools();assert.equal(refreshes,2);
  ui.dispose();ui.refreshBuildTools();assert.equal(refreshes,2);assert.equal(ui.handleBuildToolKey({key:'3'}),false);assert.equal(keys,1);
});
const failures=results.filter(r=>!r.pass);console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',cases:results.length,failures,
  scope:'Actual UI/i18n and DOM event fixtures only; no browser layout, model or native-clearance claim.'}));
assert.deepEqual(failures,[],'Inspector/drawer navigation regressions');
