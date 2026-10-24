import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDefaultLayout,createDesk} from '../site/layout/layout-state.mjs';
import {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard} from '../site/layout/layout-clipboard.mjs';

const file=new URL('../site/layout/layout-app.mjs',import.meta.url),source=readFileSync(file,'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const catalog=[{id:'test-printer',widthMm:200,depthMm:200,heightMm:250}];
const state=createDefaultLayout({furniture:[createDesk({id:'desk',pose:{xMm:-900,zMm:0,yawDeg:0}})],printers:[{id:'p',machineId:'test-printer',configurationId:'saved-config',attachment:{parentId:'desk',surfaceId:'top',xMm:100,zMm:0,yawDeg:90}}]},catalog);
const before=JSON.stringify(state),results=[];
function replay(){
 const actions=[],placements=[],messages=[];let picks=[];
 const ui={getPickedRootIds:()=>picks,setPickedRootIds:ids=>{picks=[...ids];},setStatus:()=>{}};
 const setup=new Function('deps',`
 let state=deps.state,catalog=deps.catalog,ui=deps.ui,selected='desk',clipboardText='',disposed=false,busy=false,roomEditing=false,placement=null;
 const t=k=>k,message=(value,error)=>deps.messages.push({value:typeof value==='function'?value():value,error}),humanError=e=>e.code||e.errors?.[0]?.code;
 const {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard}=deps;
 const beginPlacement=value=>deps.placements.push(value),cancelPlacement=()=>{placement=null;};
 const act=action=>{deps.actions.push(action);if(action.type==='paste')try{pasteSelection(action.text)}catch(e){message(()=>humanError(e),true)}};
 ${section('function selectionIds(){','function refreshGroupLibrary(){')}
 ${section('function placementKey(event){','function historyKey(event){')}
 return {copyEvent,pasteEvent,copySelection,pasteSelection,placementKey,setSelected:id=>{selected=id;},flags:v=>{busy=!!v.busy;roomEditing=!!v.roomEditing;disposed=!!v.disposed;},buffer:()=>clipboardText};`);
 const app=setup({state,catalog,ui,actions,placements,messages,captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard});
 return {...app,actions,placements,messages,ui};
}
const event=(key,{editing=false,ctrlKey=false,metaKey=false,shiftKey=false,text=''}={})=>{
 const data=new Map([['text/plain',text]]);
 return {key,ctrlKey,metaKey,shiftKey,target:{closest:()=>editing?{}:null},prevented:false,
   preventDefault(){this.prevented=true;},clipboardData:{setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||''},data};
};
function test(name,fn){fn();results.push(name);}
test('native copy writes the selected desk and its supported printer without changing the scene',()=>{
 const app=replay(),e=event('c');app.copyEvent(e);assert(e.prevented);
 const template=decodeLayoutClipboard(e.data.get('text/plain'),catalog);
 assert.equal(template.furniture.length,1);assert.equal(template.printers.length,1);assert.equal(template.printers[0].configurationId,'saved-config');
 assert.equal(app.placements.length,0);assert.equal(JSON.stringify(state),before);
});
test('paste decodes a cross-tab payload and starts a cancellable placement, not a direct scene edit',()=>{
 const a=replay(),c=event('c');a.copyEvent(c);const b=replay(),p=event('v',{text:c.data.get('text/plain')});b.pasteEvent(p);
 assert(p.prevented);assert.equal(b.placements.length,1);assert.equal(b.placements[0].kind,'group');assert.equal(b.placements[0].template.printers[0].attachment.parentId,'desk');
 assert.equal(JSON.stringify(state),before);
});
test('input editing, busy rendering and room editing leave native clipboard events alone',()=>{
 const a=replay();for(const value of ['copyEvent','pasteEvent']){const e=event('v',{editing:true,text:'ordinary input'});a[value](e);assert(!e.prevented);}
 for(const flag of ['busy','roomEditing','disposed']){a.flags({[flag]:true});for(const value of ['copyEvent','pasteEvent']){const e=event('v',{text:'plain'});a[value](e);assert(!e.prevented);}}
 assert.equal(a.actions.length,0);assert.equal(a.placements.length,0);
});
test('invalid clipboard data does not replace a good buffer or place partial objects',()=>{
 const a=replay(),good=a.copySelection(),bad=event('v',{text:'{"format":"unrelated"}'});a.pasteEvent(bad);
 assert.equal(a.placements.length,0);assert.equal(a.buffer(),good);assert.equal(a.messages.at(-1).error,true);
});
test('bulk picks override the active member and Ctrl/Cmd+D duplicates the complete selection',()=>{
 const a=replay();a.ui.setPickedRootIds(['desk']);a.setSelected('p');const e=event('d',{ctrlKey:true});a.placementKey(e);
 assert(e.prevented);assert.deepEqual(a.actions.pop(),{type:'duplicate',id:'p',selectionIds:['desk']});
});
test('group and select-all shortcuts keep browser text-field shortcuts intact',()=>{
 const a=replay();const g=event('g',{metaKey:true});a.placementKey(g);assert(g.prevented);assert.deepEqual(a.actions.pop().memberIds,['desk']);
 const all=event('a',{ctrlKey:true});a.placementKey(all);assert(all.prevented);assert.deepEqual(a.ui.getPickedRootIds(),['desk']);
 const input=event('g',{ctrlKey:true,editing:true});a.placementKey(input);assert(!input.prevented);
});
test('copy and paste keydown are left to the browser native clipboard event path',()=>{
 const a=replay();for(const key of ['c','v']){const e=event(key,{ctrlKey:true});a.placementKey(e);assert(!e.prevented);}assert.equal(a.actions.length,0);
});
test('a copied lone printer uses support-aware printer placement rather than a floor-only group',()=>{
 const a=replay(),template=captureLayoutClipboard(state,['p'],catalog);
 a.pasteSelection(encodeLayoutClipboard(template,catalog));
 assert.equal(a.placements[0].kind,'printer');assert.equal(a.placements[0].machineId,'test-printer');
 assert.equal(a.placements[0].copy.configurationId,'saved-config');assert.equal(a.placements[0].copy.attachment.parentId,null);
});
test('an empty furniture copy keeps direct furniture editing available after placement',()=>{
 const a=replay(),template=captureLayoutClipboard({...state,printers:[]},['desk'],catalog);
 a.pasteSelection(encodeLayoutClipboard(template,catalog));assert.equal(a.placements[0].kind,'desk');assert.equal(a.placements[0].copy.widthMm,state.furniture[0].widthMm);
});
assert.equal(JSON.stringify(state),before);
assert.equal(readFileSync(file,'utf8'),source,'App changed during replay');
console.log(JSON.stringify({passed:true,cases:results.length,app_sha256:createHash('sha256').update(source).digest('hex'),scope:'Production app clipboard/shortcut closures and actual selection transactions with DOM event fixtures; browser clipboard permissions and GPU review are separate.'}));
