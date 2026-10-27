import assert from 'node:assert/strict';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {createLayoutBuildToolbar} from '../site/layout/layout-build-toolbar.mjs';
import {createLayoutTranslator} from '../site/layout/layout-i18n.mjs';

const doc=new TestDocument(),container=doc.createElement('nav'),actions=[];
doc.body.append(container);
const toolbar=createLayoutBuildToolbar({container,t:createLayoutTranslator('en'),onAction:a=>actions.push(a)});
const button=kind=>container.querySelector(`[data-layout-build=${kind}]`);
const expected=[{type:'select-tool'},{type:'open-printer-catalog'},{type:'add',kind:'desk'},{type:'add',kind:'shelf'},
  {type:'room-opening-place',kind:'window'},{type:'room-opening-place',kind:'door',motion:'hinged'},{type:'room-opening-place',kind:'door',motion:'sliding'}];
for(const kind of ['select','printer','desk','shelf','window','hinged','sliding'])button(kind).click();
assert.deepEqual(actions,expected,'Scene tools must use normal placement commands, not directly create objects');
assert.equal(button('sliding').tabIndex,0);assert.equal(button('select').tabIndex,-1);
assert.equal(button('select').getAttribute('aria-pressed'),'true');
for(const [state,kind]of [[{placementKind:'desk'},'desk'],[{placementKind:'shelf'},'shelf'],[{placementKind:'printer'},'printer'],[{openingTool:{kind:'window'}},'window'],[{openingTool:{kind:'door',motion:'sliding'}},'sliding'],[{},'select']]){
  toolbar.setState(state);assert.equal(button(kind).getAttribute('aria-pressed'),'true');
  assert.equal(container.querySelectorAll('button').filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
}
toolbar.setState({placementKind:'group'});assert(!container.querySelectorAll('button').some(b=>b.getAttribute('aria-pressed')==='true'));
const key=(value,extra={})=>{const e={key:value,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;},...extra};return {handled:toolbar.handleKey(e),event:e};};
for(let n=1;n<=7;n++){const r=key(String(n));assert(r.handled&&r.event.defaultPrevented);assert.deepEqual(actions.at(-1),expected[n-1]);}
for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{defaultPrevented:true},{target:{closest:()=>({})}}]){
  const before=actions.length;assert.equal(key('3',extra).handled,false);assert.equal(actions.length,before);
}
for(const state of [{busy:true},{roomEditing:true}]){
  toolbar.setState(state);const before=actions.length;
  for(const b of container.querySelectorAll('button')){assert(b.disabled);b.click();}
  assert.equal(key('5').handled,false);assert.equal(actions.length,before);
}
toolbar.setState({});
const first=button('select');for(const fn of first.listeners.get('keydown'))fn({key:'ArrowRight',preventDefault(){},stopPropagation(){}});
assert.equal(doc.activeElement,button('printer'));assert.equal(button('printer').tabIndex,0);assert.equal(first.tabIndex,-1);
for(const language of ['en','ja','es','ko','ru','de']){
  toolbar.setLocale(createLayoutTranslator(language));
  for(const b of container.querySelectorAll('button')){assert(b.getAttribute('aria-label'));assert(!b.textContent.includes('layout.'));assert.equal(b.querySelector('svg').getAttribute('aria-hidden'),'true');}
}
toolbar.dispose();const before=actions.length;assert.equal(key('1').handled,false);first.click();assert.equal(actions.length,before);assert(container.hidden&&!container.children.length);
console.log(JSON.stringify({passed:true,scene_tools:7,languages:6,normal_commands:true,busy_and_text_shortcut_guards:true,roving_focus:true,scope:'Build-toolbar DOM transactions; application/browser and actual catalog placement checked separately.'}));
