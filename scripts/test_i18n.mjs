import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {translate,chooseLanguage,languageURL,setupLanguage,loadLanguage} from '../site/viewer/i18n.mjs';
import {messages,templates} from '../site/viewer/messages-en.mjs';
import {probeCheck} from '../site/viewer/probe-checks.js';
import {builderURL} from '../site/viewer/toolhead-builder.mjs';

assert.equal(chooseLanguage({query:'en',stored:'ja',languages:['ja-JP']}),'en');
assert.equal(chooseLanguage({query:'ja',stored:'en',languages:['en-US']}),'ja');
assert.equal(chooseLanguage({query:'invalid',stored:'en',languages:['ja']}),'en');
assert.equal(chooseLanguage({languages:['ja-JP','en-US']}),'en');
assert.equal(chooseLanguage({languages:['de-DE','ja']}),'en');
assert.equal(chooseLanguage(), 'en');
// A configuration promise can add more labels between the observer callback
// and its queued translation. Disconnecting must not discard those records.
class LanguageElement extends EventTarget {
 constructor(tag='DIV'){super();this.nodeType=1;this.tagName=tag;this.childNodes=[];this.attrs=new Map();this.isConnected=true;}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.childNodes.push(node)}}
 prepend(node){node.parentElement=this;this.childNodes.unshift(node)}
 setAttribute(key,value){this.attrs.set(key,value)}
 getAttribute(key){return this.attrs.get(key)??null}
 hasAttribute(key){return this.attrs.has(key)}
 closest(){return this.attrs.get('data-i18n')==='off'?this:null}
 contains(node){return this.childNodes.includes(node)||this.childNodes.some(child=>child.nodeType===1&&child.contains(node))}
}
let languageObserver;
class LanguageObserver {
 constructor(callback){this.callback=callback;this.records=[];languageObserver=this}
 observe(){}
 disconnect(){this.records=[]}
 takeRecords(){return this.records.splice(0)}
}
const languageBody=new LanguageElement('BODY');
const languageDocument={body:languageBody,documentElement:{},getElementById:()=>null,createElement:tag=>new LanguageElement(tag.toUpperCase()),querySelector:()=>null};
const languageWindow={location:{href:'https://example.test/viewer/toolheads.html?lang=en'},navigator:{languages:['en']},localStorage:{getItem:()=>null,setItem:()=>{}},history:{replaceState(){}},MutationObserver:LanguageObserver,CustomEvent:class{},addEventListener(){},dispatchEvent(){}};
const languageController=setupLanguage({document:languageDocument,window:languageWindow});
const firstLabel={nodeType:3,nodeValue:'構成'},lateLabel={nodeType:3,nodeValue:'ホットエンド'};
const groupedMenu=new LanguageElement('OPTGROUP');groupedMenu.setAttribute('label','取付 / 交換方式');
const labelledOption=new LanguageElement('OPTION');labelledOption.setAttribute('label','原本専用キャリッジ');
groupedMenu.append(labelledOption);languageBody.append(groupedMenu);
const firstContainer=new LanguageElement(),lateContainer=new LanguageElement();
languageBody.append(firstContainer,lateContainer);
firstContainer.append(firstLabel);
languageObserver.callback([{type:'childList',addedNodes:[firstLabel,groupedMenu]}]);
lateContainer.append(lateLabel);
languageObserver.records.push({type:'childList',addedNodes:[lateLabel]});
await Promise.resolve();
assert.equal(firstLabel.nodeValue,'Configuration');
assert.equal(lateLabel.nodeValue,'Hotend','Labels added during asynchronous configuration switching are also translated');
assert.equal(groupedMenu.getAttribute('label'),'Mount / change method');
assert.equal(labelledOption.getAttribute('label'),'Original dedicated carriage');
languageController.setLanguage('ja');
assert.equal(firstLabel.nodeValue,'構成');assert.equal(lateLabel.nodeValue,'ホットエンド');
assert.equal(groupedMenu.getAttribute('label'),'取付 / 交換方式');
assert.equal(labelledOption.getAttribute('label'),'原本専用キャリッジ');
languageController.disconnect();
assert.equal(translate('構成','ja'),'構成');
assert.equal(translate('構成'),'Configuration');
assert.equal(translate(' \n構成\t '),' \nConfiguration\t ');
for(const raw of ['constructor','__proto__','G1 X10  Y20\n; hello','NH36','sherpa_mini_v2.step'])assert.equal(translate(raw),raw);
assert.equal(translate('付属Cartographer：コイル高さ 2.500 mm。指定2.6〜3.0 mm外の取付です。'),'Included Cartographer coil height: 2.500 mm. Outside the specified 2.6–3.0 mm range.');
assert.equal(translate('Stealthburner · 24構成'),'Stealthburner · 24 configurations');
assert.equal(translate('FilamATrix 専用のヘッド部品'),'Dedicated FilamATrix head parts');
assert.equal(translate('Archetype · Zephyr / ダクト原本 · 24構成'),'Archetype · Zephyr / original ducts · 24 configurations');
assert.equal(translate('Archetype · Atrocity / 原本比較 · 12構成'),'Archetype · Atrocity / source comparison · 12 configurations');
assert.equal(translate('Stealthburner (SB) ／ Clockwork 2 ／ Revo Voron ／ 原本仕様 ／ FilamATrix / 標準SB · 6 mm ／ FilamATrix 専用のヘッド部品'),'Stealthburner (SB) ／ Clockwork 2 ／ Revo Voron ／ Original variant ／ FilamATrix / Standard SB · 6 mm ／ Dedicated FilamATrix head parts');
assert.equal(translate('PNG作成済み · 2048 × 1536 px'),'PNG ready · 2048 × 1536 px');
assert.equal(translate('選択可能な構成：1062通り'),'Available configurations: 1062');
assert.equal(translate('Beacon Rev Dのコイル底面：未計測'),'Beacon Rev D coil bottom: unmeasured');
assert.equal(translate('Cartographer V4 · ノズルより 2.80 mm上 · 絶縁スペーサー 2.8 mm × 2'),'Cartographer V4 · 2.80 mm above nozzle · insulating spacers 2.8 mm × 2');
assert.equal(translate('Cartographer V4 · ノズルより 2.80 mm上 · 絶縁スペーサー 2.8 mm × 2。ベルト固定ねじが金属除外領域に入ります。取付検証未完了。'),'Cartographer V4 · 2.80 mm above nozzle · insulating spacers 2.8 mm × 2. Belt clamp screws enter the metal keepout. Mounting checks are incomplete.');
assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(translate('Cartographer V4 · ノズルより 2.80 mm上 · 絶縁スペーサー 2.8 mm × 2 ／ ノズル接触時の最下部／ベッド間隔 0.125 mm')));
assert.equal(translate('本体の交差 12組。最大 114.957 mm³。'),'Body intersections: 12 pairs. Maximum 114.957 mm³.');
assert.match(translate('サポート省略モデル：原本に含まれる印刷用サポートを除外。本体の寸法と原本座標を保持しています。'),/^Support-omitted model:/u);
const url=new URL(languageURL('https://example.test/viewer/toolheads.html?configuration=x&base=abcdef#mount','en'));
assert.equal(url.searchParams.get('lang'),'en');assert.equal(url.searchParams.get('configuration'),'x');assert.equal(url.searchParams.get('base'),'abcdef');assert.equal(url.hash,'#mount');
const share=new URL(builderURL(url.href,{id:'registered'}, {palette:{base:'#abcdef',accent:'#fedcba'},dock:false,rail:true,see_inside:false}));assert.equal(share.searchParams.get('lang'),'en');assert.equal(share.searchParams.get('configuration'),'registered');

const jp=/[\u3040-\u30ff\u3400-\u9fff]/u;
for(const [source,target]of Object.entries(messages)){assert(!jp.test(target),source+' English text');assert.equal(translate(source),target,source)}
for(const [source,target]of Object.entries(templates)){
 assert(!jp.test(target),source+' English template');
 assert.deepEqual([...source.matchAll(/\{(\d+)\}/gu)].map(m=>m[1]).sort(),[...target.matchAll(/\{(\d+)\}/gu)].map(m=>m[1]).sort(),source+' placeholders');
}
const site=new URL('../site/',import.meta.url),fields=new Set(['label','notes','display_scope','scope','description','changes','license','version','unavailable_reason','limitations','requirements','mount']);
let translated=0,variants=0;
function scan(value,key=''){
 if(typeof value==='string'){if(fields.has(key)&&jp.test(value)){assert(!jp.test(translate(value)), 'Untranslated catalog UI: '+value);translated++}}
 else if(Array.isArray(value))value.forEach(v=>scan(v,key));
 else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))if(k!=='parts')scan(v,k);
}
for(const name of await readdir(site))if(name.endsWith('.json')){
 const c=JSON.parse(await readFile(new URL(name,site),'utf8'));scan(c);
 if(Array.isArray(c.variants))for(const v of c.variants){variants++;const check=probeCheck(v);assert(!jp.test(translate(check.label)));for(const line of check.lines)assert(!jp.test(translate(line)),line)}
}
console.log(`Language checks passed: ${Object.keys(messages).length} messages, ${Object.keys(templates).length} templates, ${translated} catalog descriptions and ${variants} variant statuses; IDs, share parameters and uncertainty preserved.`);

// A delayed dictionary must not restore an earlier choice after the user
// switches languages again, including labels added by a late CAD promise.
await Promise.all(['es','ko','ru'].map(loadLanguage));
const switchedBody=new LanguageElement('BODY');
const switchLabel={nodeType:3,nodeValue:'構成'};switchedBody.append(switchLabel);
const switchedDocument={...languageDocument,body:switchedBody,documentElement:{}};
const releases=new Map();
const switched=setupLanguage({document:switchedDocument,window:languageWindow,load:language=>new Promise(resolve=>releases.set(language,resolve))});
const firstSwitch=switched.setLanguage('es'),lastSwitch=switched.setLanguage('ko');
releases.get('es')();await firstSwitch;
assert.equal(switched.language,'ko');assert.equal(switchLabel.nodeValue,'구성');
releases.get('ko')();await lastSwitch;
const delayedLabel={nodeType:3,nodeValue:'ホットエンド'};switchedBody.append(delayedLabel);
languageObserver.callback([{type:'childList',addedNodes:[delayedLabel]}]);await Promise.resolve();
assert.equal(delayedLabel.nodeValue,'핫엔드');
await switched.setLanguage('ja');assert.equal(switchLabel.nodeValue,'構成');assert.equal(delayedLabel.nodeValue,'ホットエンド');
switched.disconnect();
console.log('Rapid language changes and asynchronous CAD labels preserve the latest language and original source text.');
