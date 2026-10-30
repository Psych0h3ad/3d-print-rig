// Source/UI affiliate boundary only. No model fetch, rendering or fit claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {sourceRevision,validateTranslations} from './build_locales.mjs';

const option=process.argv.indexOf('--site');
const site=option<0?fileURLToPath(new URL('../site/',import.meta.url)):resolve(process.argv[option+1]);
const {createLayoutUI}=await import(pathToFileURL(resolve(site,'layout/layout-ui.mjs')));
const {createLayoutTranslator,messages,supportedLanguages}=await import(pathToFileURL(resolve(site,'layout/layout-i18n.mjs')));
const S=await import(pathToFileURL(resolve(site,'layout/layout-state.mjs')));
const expectedURL='https://psych0h3ad.link/lxbhIoR';
const labelKey='layout.popstation_affiliate_link',disclosureKey='layout.popstation_affiliate_disclosure';
const selector='[data-layout-affiliate-link]';
const catalog=[{id:S.U1_LAYOUT_MACHINE_ID,label:'Snapmaker U1',widthMm:400,depthMm:400,heightMm:500},
  {id:'other-printer',label:'Other printer',widthMm:200,depthMm:200,heightMm:200}];
const printer=(id,machineId,parentId=null)=>({id,machineId,configurationId:null,
  attachment:{parentId,surfaceId:parentId?'top':'floor',xMm:0,zMm:0,yawDeg:0}});
const pose=xMm=>({xMm,zMm:0,yawDeg:0});
const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),
  furniture:[S.createPopStation({id:'legacy',pose:pose(-2000)}),S.createBiquPopStation({id:'supplied',pose:pose(-1000)}),
    S.createDesk({id:'desk',pose:pose(1000)}),S.createShelf({id:'shelf',pose:pose(2500)})],
  printers:[printer('u1',S.U1_LAYOUT_MACHINE_ID),printer('mounted-u1',S.U1_LAYOUT_MACHINE_ID,'legacy'),printer('other','other-printer')]},catalog);

const tests=[];
function test(name,run){run();tests.push(name);}
function fixture(){
  const doc=new TestDocument(),container=doc.createElement('aside');doc.body.append(container);
  const actions=[];
  const ui=createLayoutUI({container,catalog,t:createLayoutTranslator('en'),onAction:action=>actions.push(action)});
  return {ui,container,actions};
}
function shown(node){for(let n=node;n;n=n.parentNode)assert.equal(n.hidden,false,'Affiliate UI must be in the visible selection panel');}
function check(container,language){
  const links=container.querySelectorAll(selector);assert.equal(links.length,1);
  const link=links[0];assert.equal(link.tagName,'A');assert.equal(link.href,expectedURL);
  assert.equal(link.target,'_blank');assert.deepEqual(link.rel.split(/\s+/).sort(),['noopener','noreferrer','sponsored']);
  assert.equal(link.textContent,messages[language][labelKey]);assert.ok(link.textContent.includes('PopStation Mini'));
  assert.ok(link.textContent.includes('BIQU'));assert.ok(!link.textContent.includes('U1'));
  const note=container.querySelector('#'+link.getAttribute('aria-describedby'));
  assert.ok(note);assert.equal(note.textContent,messages[language][disclosureKey]);
  assert.equal(link.parentNode,note.parentNode);assert.ok(link.parentNode.children.indexOf(note)>link.parentNode.children.indexOf(link));
  shown(link);shown(note);
  return link;
}

test('both cabinet types: exact user URL, visible adjacent disclosure, safe rel, all six languages and reversal',()=>{
  const {ui,container,actions}=fixture();
  for(const language of [...supportedLanguages,'en']){
    ui.setLocale(createLayoutTranslator(language));
    for(const id of ['legacy','supplied','legacy']){
      ui.update(initial,id);check(container,language);
      // Opening another inspector tab and selecting a cabinet must reveal the link again.
      container.querySelector('[data-layout-command="layout.nav.output"]').click();
      ui.update(initial,id==='legacy'?'supplied':'legacy');check(container,language);
    }
  }
  assert.deepEqual(actions,[]);ui.dispose();assert.equal(container.querySelector(selector),null);
});

test('selection A-to-B-to-A removes stale affiliate links for U1, mounted U1, other printer, furniture and no selection',()=>{
  const {ui,container}=fixture();
  for(const cabinet of ['legacy','supplied'])for(const id of ['u1','mounted-u1','other','desk','shelf',null]){
    ui.update(initial,cabinet);check(container,'en');ui.update(initial,id);
    assert.equal(container.querySelector(selector),null,id||'no selection');
    assert.equal(container.querySelector('#layout-popstation-affiliate-disclosure'),null);
    ui.update(initial,cabinet);check(container,'en');
  }
  // A display name or saved URL on a different entity must not opt into the link.
  const misleading={...initial,furniture:initial.furniture.map(f=>f.id==='desk'?{...f,name:'BIQU PopStation Mini',url:expectedURL}:f)};
  ui.update(misleading,'desk');assert.equal(container.querySelector(selector),null);
  ui.dispose();
});

test('live locale changes, plan reload and reset keep the boundary and never read plan URLs',()=>{
  const {ui,container,actions}=fixture(),saved=S.serializeLayout(initial,catalog),loaded=S.parseLayout(saved,catalog);
  ui.update(loaded,'supplied');check(container,'en');
  for(const language of ['ja','de','en']){ui.setLocale(createLayoutTranslator(language));check(container,language);}
  const poisoned={...loaded,furniture:loaded.furniture.map(f=>({...f,url:'javascript:alert(1)',affiliateUrl:'https://wrong.example/',productURL:'https://wrong.example/'}))};
  for(const id of ['legacy','supplied']){ui.update(poisoned,id);check(container,'en');}
  ui.update(S.createDefaultLayout({},catalog),null);assert.equal(container.querySelector(selector),null);
  ui.update(S.parseLayout(saved,catalog),'legacy');check(container,'en');
  assert.equal(S.serializeLayout(initial,catalog),saved);assert.deepEqual(actions,[]);ui.dispose();
});

test('affiliate copy matches authoritative localization source and reviewed revisions without building generated locales',()=>{
  const source=JSON.parse(readFileSync(new URL('../localization/source.json',import.meta.url),'utf8'));
  const subset={...source,entries:Object.fromEntries([labelKey,disclosureKey].map(key=>[key,source.entries[key]]))},dictionaries={};
  for(const language of supportedLanguages){
    const dictionary=['en','ja'].includes(language)?null:JSON.parse(readFileSync(new URL(`../localization/${language}.json`,import.meta.url),'utf8'));
    if(dictionary)dictionaries[language]={...dictionary,messages:Object.fromEntries([labelKey,disclosureKey].map(key=>[key,dictionary.messages[key]]))};
    for(const key of [labelKey,disclosureKey]){
      const entry=source.entries[key];assert.ok(entry,key);
      assert.equal(messages[language][key],dictionary?dictionary.messages[key].text:entry[language]);
      assert.ok(!/\p{Extended_Pictographic}/u.test(messages[language][key]));
      if(dictionary)assert.equal(dictionary.messages[key].source_revision,sourceRevision(entry));
    }
  }
  assert.deepEqual(validateTranslations(subset,dictionaries),[]);
  assert.equal(messages.en[labelKey],'PopStation Mini · BIQU official store');
  assert.equal(messages.en[disclosureKey],'Affiliate link: I may earn a commission on purchases.');
});

const pins=Object.fromEntries(['layout/layout-ui.mjs','layout/layout-i18n.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(resolve(site,file))).digest('hex')]));
console.log(JSON.stringify({status:'PASS',cases:tests.length,tests,languages:supportedLanguages,entityTypes:['popstation_mini','popstation_mini_biqu_v1'],url:expectedURL,pins,
  scope:'Actual layout UI/state/locale modules with a DOM fixture. No model/native geometry, browser visual, served-release or fit validation.'}));
