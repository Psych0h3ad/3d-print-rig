// Actual presentation modules, public numerical fixtures only. No browser/model/native claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=process.argv.indexOf('--site'),site=option<0?path.join(root,'site'):path.resolve(process.argv[option+1]);
const names=['layout-ui.mjs','layout.css','layout-i18n.mjs','layout-group-labels.mjs'];
const pins=()=>Object.fromEntries(names.map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(site,'layout',n))).digest('hex')]));
const before=pins();
const {createLayoutUI}=await import(pathToFileURL(path.join(site,'layout/layout-ui.mjs')));
const {createLayoutTranslator,supportedLanguages}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const S=await import(pathToFileURL(path.join(site,'layout/layout-state.mjs')));
const G=await import(pathToFileURL(path.join(site,'layout/layout-groups.mjs')));
const {groupLabel}=await import(pathToFileURL(path.join(site,'layout/layout-group-labels.mjs')));
const catalog=[{id:'public-fixture',label:'Workshop printer',widthMm:200,depthMm:180,heightMm:300}];
function seed(){
 const printer=(id,parentId,xMm=0,zMm=0)=>({id,machineId:catalog[0].id,configurationId:null,attachment:{parentId,surfaceId:parentId?'top':'floor',xMm,zMm,yawDeg:0}});
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000}),furniture:[S.createDesk({id:'desk-a',widthMm:800,depthMm:600,pose:{xMm:-1500,zMm:0,yawDeg:0}}),S.createDesk({id:'desk-b',widthMm:800,depthMm:600,pose:{xMm:1500,zMm:0,yawDeg:0}})],printers:[printer('child-a','desk-a'),printer('child-b','desk-b'),printer('floor',null,0,1000)]},catalog);
 state=G.createGroup(state,{id:'unit-a',name:'North bench',memberIds:['desk-a']},catalog);
 return G.createGroup(state,{id:'unit-b',name:'South bench',memberIds:['desk-b','floor']},catalog);
}
function fixture(selection='desk-a',initial=seed()){
 const document=new TestDocument(),container=document.createElement('aside');document.body.append(container);const actions=[];let escapes=0;
 const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:a=>actions.push(a),onObjectSearchEscape:()=>escapes++});ui.update(initial,selection);
 const find=q=>{const n=container.querySelector(q);assert.ok(n,'Missing '+q);return n;};
 const command=k=>find(`[data-layout-command="${k}"]`);
 const query=value=>{const input=find('#layout-object-search');input.value=value;input.dispatch('input');};
 const filter=type=>find(`[data-layout-filter="${type}"]`).click();
 const visible=()=>[...find('#layout-objects').children,...find('#layout-groups').children].filter(n=>!n.hidden).map(n=>n.querySelector('button').dataset.layoutEntity||n.querySelector('button').dataset.layoutGroup);
 const key=(n,k,extra={})=>{let prevented=0,stopped=0;for(const fn of n.listeners.get('keydown')||[])fn({key:k,preventDefault(){prevented++;},stopPropagation(){stopped++;},...extra});return {prevented,stopped};};
 return {ui,document,container,actions,initial,find,command,query,filter,visible,key,escapes:()=>escapes};
}
const results=[];async function test(name,run){try{await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
await test('four real panels default to Selection; browser and unit tools remain outside panels',()=>{
 const x=fixture();assert.deepEqual(x.container.querySelectorAll('[role="tab"]').map(n=>n.dataset.layoutTab),['selection','add','room','output']);
 for(const name of ['selection','add','room','output']){const tab=x.find(`#layout-tab-${name}`),panel=x.find(`#layout-nav-${name}`);assert.equal(panel.hidden,name!=='selection');assert.equal(tab.getAttribute('aria-selected'),String(name==='selection'));assert.equal(tab.tabIndex,name==='selection'?0:-1);assert.equal(tab.getAttribute('aria-controls'),panel.id);assert.equal(panel.getAttribute('aria-labelledby'),tab.id);assert.equal(panel.contains(x.find('#layout-nav-objects')),false);}
 assert.equal(x.find('#layout-nav-objects').hidden,false);assert.equal(x.container.querySelectorAll('[data-layout-jump]').length,0);x.ui.dispose();
});
await test('object types and counts include each physical object and unit once',()=>{
 const x=fixture(),cases=[['all',7],['printers',3],['furniture',2],['units',2]];
 for(const [type,count]of cases){x.filter(type);assert.equal(x.visible().length,count);assert.equal(x.find(`[data-layout-filter="${type}"]`).getAttribute('aria-pressed'),'true');assert.ok(x.find(`[data-layout-filter="${type}"]`).getAttribute('aria-label').endsWith(`(${count})`));}
 assert.deepEqual(x.actions,[]);x.ui.dispose();
});
for(const code of ['A','B'])await test('exact stable code '+code+' finds the unit and all supported/root members',()=>{
 const x=fixture(),expected=code==='A'?['child-a','desk-a','unit-a']:['child-b','desk-b','floor','unit-b'];x.query(code.toLowerCase());assert.deepEqual(x.visible().sort(),expected.sort());
 x.filter('printers');assert.equal(x.visible().length,code==='A'?1:2);x.filter('units');assert.deepEqual(x.visible(),[code==='A'?'unit-a':'unit-b']);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('name and parent context search, no matches and reset never mutate state or picked roots',()=>{
 const x=fixture(),original=JSON.stringify(x.initial);x.ui.setPickedRootIds(['desk-a','floor']);x.query('North bench');assert.deepEqual(x.visible().sort(),['child-a','desk-a','unit-a']);
 x.query('Workshop printer');assert.deepEqual(x.visible().sort(),['child-a','child-b','floor']);x.query('not present');assert.equal(x.visible().length,0);assert.equal(x.find('#layout-object-no-matches').hidden,false);
 assert.deepEqual(x.ui.getPickedRootIds(),['desk-a','floor']);assert.equal(x.find('#layout-reveal-selected').hidden,false);x.find('#layout-reveal-selected').click();assert.equal(x.visible().length,7);assert.equal(x.find('#layout-object-no-matches').hidden,true);assert.equal(JSON.stringify(x.initial),original);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('badge and aria show code plus base name; rename sends base name only',()=>{
 const x=fixture('unit-a'),row=x.find('[data-layout-group="unit-a"]');assert.equal(row.getAttribute('aria-label'),'A · North bench');assert.equal(x.find('#layout-selected-unit').getAttribute('aria-label'),'A · North bench');
 const name=x.find('#layout-group-edit-name');assert.equal(name.value,'North bench');name.value='Renamed';name.dispatch('input');name.dispatch('change');assert.deepEqual(x.actions,[{type:'group-rename',id:'unit-a',name:'Renamed'}]);assert.equal(x.initial.groups[0].name,'North bench');x.ui.dispose();
});
await test('explicit six-letter code and hostile names stay literal text',()=>{
 const base=seed(),initial={...base,groups:base.groups.map((g,i)=>i===0?{...g,label:'ABCDEF',name:'<img src=x onerror=alert(1)>'}:g)};const original=JSON.stringify(initial),x=fixture('unit-a',initial);
 assert.equal(x.find('[data-layout-group="unit-a"]').getAttribute('aria-label'),'ABCDEF · <img src=x onerror=alert(1)>');x.query('ABCDEF');assert.deepEqual(x.visible().sort(),['child-a','desk-a','unit-a']);assert.equal(x.container.querySelector('img'),null);assert.equal(JSON.stringify(initial),original);x.ui.dispose();
});
await test('delete/rename and save-load mirrors retain surviving stable codes',()=>{
 const x=fixture('unit-b');const next=G.renameGroup(G.ungroup(x.initial,'unit-a',catalog),'unit-b','Retained',catalog);assert.equal(groupLabel(next,'unit-b'),'B');
 const loaded=S.parseLayout(S.serializeLayout(next,catalog),catalog);x.ui.update(loaded,'unit-b');assert.equal(x.find('[data-layout-group="unit-b"]').getAttribute('aria-label'),'B · Retained');x.query('B');assert.deepEqual(x.visible().sort(),['child-b','desk-b','floor','unit-b']);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('tabs use local Arrow/Home/End handling without changing text or dispatching actions',()=>{
 const x=fixture();let tab=x.find('#layout-tab-selection');assert.equal(x.key(tab,'ArrowRight').prevented,1);assert.equal(x.document.activeElement,x.find('#layout-tab-add'));assert.equal(x.find('#layout-nav-add').hidden,false);
 x.key(x.find('#layout-tab-add'),'End');assert.equal(x.document.activeElement,x.find('#layout-tab-output'));x.key(x.find('#layout-tab-output'),'Home');assert.equal(x.document.activeElement,tab);
 assert.equal(x.key(tab,'ArrowRight',{ctrlKey:true}).prevented,0);assert.equal(x.key(tab,'ArrowRight',{isComposing:true}).prevented,0);
 const input=x.find('[data-layout-field="xMm"]');assert.equal(x.key(input,'ArrowRight').prevented,0);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('tab/filter A-B-A retains exact numeric draft nodes; mirrors do not switch tabs',()=>{
 const x=fixture(),field=x.find('[data-layout-field="widthMm"]');field.focus();field.value='799.123456789';field.dispatch('input');
 for(const name of ['room','output','add','selection'])x.command(`layout.nav.${name}`).click();x.query('B');x.query('');assert.strictEqual(x.find('[data-layout-field="widthMm"]'),field);assert.equal(field.value,'799.123456789');
 x.command('layout.nav.room').click();x.ui.update(x.initial,'desk-a');assert.equal(x.find('#layout-nav-room').hidden,false);assert.equal(field.value,'799.123456789');assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('genuine new selection opens inspector; busy selection is revealed after completion',()=>{
 const x=fixture();x.command('layout.nav.room').click();x.ui.update(x.initial,'unit-a');assert.equal(x.find('#layout-nav-selection').hidden,false);
 x.command('layout.nav.add').click();x.ui.setStatus({busy:true});x.ui.update(x.initial,'unit-b');assert.equal(x.find('#layout-nav-add').hidden,false);x.ui.setStatus({busy:false});assert.equal(x.find('#layout-nav-selection').hidden,false);assert.equal(x.find('#layout-selected-unit').getAttribute('aria-label'),'B · South bench');x.ui.dispose();
});
await test('panels remember only their own scroll; a new selection starts at the inspector top',()=>{
 const x=fixture(),host=x.find('#layout-nav-selection').parentNode;x.container.scrollTop=71;host.scrollTop=140;
 x.command('layout.nav.room').click();assert.equal(host.scrollTop,0);host.scrollTop=390;x.command('layout.nav.selection').click();assert.equal(host.scrollTop,140);
 x.command('layout.nav.room').click();assert.equal(host.scrollTop,390);x.ui.update(x.initial,'unit-b');assert.equal(host.scrollTop,0);assert.equal(x.container.scrollTop,71);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('explicit reselection API opens the inspector even for the same ID without a state action',()=>{
 const x=fixture('unit-b');x.command('layout.nav.room').click();x.ui.update(x.initial,'unit-b');assert.equal(x.find('#layout-nav-room').hidden,false);
 assert.equal(x.ui.focusSelection(),true);assert.equal(x.find('#layout-nav-selection').hidden,false);assert.equal(x.find('#layout-nav-selection').parentNode.scrollTop,0);assert.deepEqual(x.actions,[]);
 x.ui.setStatus({busy:true});assert.equal(x.ui.focusSelection(),false);x.ui.setStatus({busy:false});x.ui.update(x.initial,null);assert.equal(x.ui.focusSelection(),false);x.ui.dispose();assert.equal(x.ui.focusSelection(),false);
});
await test('native room change/blur and Add-Room tabs preserve 8000-to-8200 draft until Update room',()=>{
 const x=fixture(),original=JSON.stringify(x.initial);x.command('layout.nav.room').click();const width=x.find('[data-layout-field="room-width"]');assert.equal(width.value,'8000.0');width.focus();width.value='8200';width.dispatch('input');width.dispatch('change');width.blur();
 x.command('layout.nav.add').click();x.command('layout.nav.room').click();x.ui.update(x.initial,'desk-a');assert.equal(width.value,'8200.0');assert.equal(width._draftValue,8200);assert.equal(JSON.stringify(x.initial),original);assert.deepEqual(x.actions,[]);
 x.find('#layout-room-apply').click();assert.equal(x.actions.length,1);assert.equal(x.actions[0].type,'SET_ROOM');const xs=x.actions[0].room.polygonMm.map(p=>p[0]);assert.equal(Math.max(...xs)-Math.min(...xs),8200);x.ui.dispose();
});
await test('room draft survives a blur without change and retains exact fractional value',()=>{
 const x=fixture();x.command('layout.nav.room').click();const width=x.find('[data-layout-field="room-width"]');width.focus();width.value='8200.123456789';width.dispatch('input');width.blur();x.command('layout.nav.add').click();x.command('layout.nav.room').click();assert.equal(width.value,'8200.1');assert.equal(width._draftValue,8200.123456789);assert.deepEqual(x.actions,[]);
 x.find('#layout-room-apply').click();const xs=x.actions[0].room.polygonMm.map(p=>p[0]);assert.equal(Math.max(...xs)-Math.min(...xs),8200.123456789);x.ui.dispose();
});
await test('compact selected-unit heading contains the editable base name and primary coordinates precede actions',()=>{
 const x=fixture('unit-b'),identity=x.find('#layout-selected-unit'),name=x.find('#layout-group-edit-name');assert.equal(identity.contains(name),true);assert.equal(identity.querySelector('[data-layout-unit-code]').textContent,'B');assert.equal(name.value,'South bench');
 const editor=identity.parentNode,pose=x.find('[data-layout-field="xMm"]').parentNode.parentNode.parentNode;assert.ok([...editor.children].indexOf(pose)<[...editor.children].indexOf(x.command('layout.group.save').parentNode));x.ui.update(G.renameGroup(x.initial,'unit-b','Changed',catalog),'unit-b');assert.strictEqual(x.find('#layout-group-edit-name'),name);assert.equal(name.value,'Changed');assert.equal(identity.getAttribute('aria-label'),'B · Changed');x.ui.dispose();
});
await test('locale mirrors preserve uncommitted precise numeric text and native source value',()=>{
 const x=fixture(),field=x.find('[data-layout-field="xMm"]'),original=JSON.stringify(x.initial);field.focus();field.value='-1499.123456789';field.dispatch('input');
 for(const language of supportedLanguages){x.ui.setLocale(createLayoutTranslator(language));const current=x.find('[data-layout-field="xMm"]');assert.equal(current.value,'-1499.123456789');assert.equal(current._dirty,true);assert.equal(current._sourceValue,-1500);}
 assert.equal(JSON.stringify(x.initial),original);assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('search API and two-stage Escape stay local and dispose cleanly',()=>{
 const x=fixture();assert.equal(x.ui.focusObjectSearch(),true);const search=x.find('#layout-object-search');assert.strictEqual(x.document.activeElement,search);x.query('A');
 assert.deepEqual(x.key(search,'Escape'),{prevented:1,stopped:1});assert.equal(search.value,'');assert.equal(x.escapes(),0);x.key(search,'Escape');assert.equal(x.escapes(),1);
 assert.equal(x.key(search,'/').prevented,0);x.ui.setStatus({busy:true});assert.equal(x.ui.focusObjectSearch(),false);x.ui.setStatus({busy:false});x.ui.dispose();assert.equal(x.ui.focusObjectSearch(),false);x.key(search,'Escape');assert.equal(x.escapes(),1);
});
await test('errors, progress and cancel remain visible while Output is inactive',()=>{
 const x=fixture();x.command('layout.nav.add').click();x.ui.setStatus({busy:true,error:true,message:'Visible failure',renderProgress:{loaded:1,total:2,message:'Still working'}});
 assert.equal(x.find('#layout-nav-output').hidden,true);assert.equal(x.find('[role="status"]').hidden,false);assert.equal(x.find('[role="status"]').textContent,'Visible failure');assert.equal(x.find('#layout-workspace-progress').hidden,false);
 assert.equal(x.find('#layout-workspace-progress').contains(x.command('cancel')),true);assert.equal(x.command('cancel').disabled,false);assert.equal(x.find('#layout-object-search').disabled,true);x.command('cancel').click();assert.deepEqual(x.actions,[{type:'cancel'}]);
 x.ui.setStatus({busy:false,error:false,message:''});assert.equal(x.find('#layout-workspace-progress').hidden,true);assert.equal(x.find('[role="status"]').hidden,true);x.ui.dispose();
});
await test('all five locales retain filter/query, active tab, unit identity and dirty native input',()=>{
 const x=fixture('unit-a');x.query('A');x.filter('units');x.command('layout.nav.room').click();let field=x.find('#layout-group-edit-name');field.focus();field.value='Uncommitted draft';field.dispatch('input');
 for(const locale of supportedLanguages){const t=createLayoutTranslator(locale);x.ui.setLocale(t);assert.equal(x.find('#layout-object-search').value,'A');assert.equal(x.find('#layout-nav-room').hidden,false);assert.equal(x.find('[data-layout-filter="units"]').getAttribute('aria-pressed'),'true');assert.equal(x.find('#layout-group-edit-name').value,'Uncommitted draft');assert.equal(x.find('#layout-selected-unit').getAttribute('aria-label'),'A · North bench');for(const tab of ['selection','room','add','output'])assert.equal(x.command(`layout.nav.${tab}`).getAttribute('aria-label'),t(`layout.nav.${tab}`));assert.equal(x.find('#layout-object-search').getAttribute('aria-label'),t('layout.browser.search'));}
 assert.deepEqual(x.actions,[]);x.ui.dispose();
});
await test('empty selection and empty layout preserve navigation and actionable unit controls',()=>{
 const x=fixture(null);assert.equal(x.find('#layout-nav-selection').hidden,false);assert.equal(x.command('layout.nav.selection').disabled,false);x.ui.setPickedRootIds(['desk-a']);assert.equal(x.command('layout.group.create').disabled,false);x.command('layout.group.create').click();assert.equal(x.actions[0].type,'group-create');
 x.ui.update(S.createDefaultLayout(),null);assert.equal(x.visible().length,0);assert.equal(x.find('#layout-object-no-matches').hidden,true);assert.equal(x.command('layout.group.create').disabled,true);x.ui.dispose();
});
assert.deepEqual(pins(),before,'Presentation inputs changed while the focused job ran');
const report={status:results.every(t=>t.pass)?'PASS':'FAIL',cases:results.length,results,sourceSHA256:before,languages:supportedLanguages,scope:'Actual UI, label helper and state/group source with DOM fixtures. No browser pixels, layout sizing, provider/model assets or native-clearance evidence.'};
const reportOption=process.argv.indexOf('--report');if(reportOption>=0)fs.writeFileSync(process.argv[reportOption+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));assert.deepEqual(results.filter(t=>!t.pass),[],'Desktop workspace regressions');
