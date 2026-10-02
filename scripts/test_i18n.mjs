import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {translate,chooseLanguage,languageURL} from '../site/viewer/i18n.mjs';
import {messages,templates} from '../site/viewer/messages-en.mjs';
import {probeCheck} from '../site/viewer/probe-checks.js';
import {builderURL} from '../site/viewer/toolhead-builder.mjs';

assert.equal(chooseLanguage({query:'en',stored:'ja',languages:['ja-JP']}),'en');
assert.equal(chooseLanguage({query:'ja',stored:'en',languages:['en-US']}),'ja');
assert.equal(chooseLanguage({query:'invalid',stored:'en',languages:['ja']}),'en');
assert.equal(chooseLanguage({languages:['ja-JP','en-US']}),'ja');
assert.equal(chooseLanguage({languages:['de-DE','ja']}),'en');
assert.equal(chooseLanguage(), 'en');
assert.equal(translate('構成','ja'),'構成');
assert.equal(translate('構成'),'Configuration');
assert.equal(translate(' \n構成\t '),' \nConfiguration\t ');
for(const raw of ['constructor','__proto__','G1 X10  Y20\n; hello','NH36','sherpa_mini_v2.step'])assert.equal(translate(raw),raw);
assert.equal(translate('付属Cartographer：コイル高さ 2.500 mm。指定2.6〜3.0 mm外の取付です。'),'Included Cartographer coil height: 2.500 mm. Outside the specified 2.6–3.0 mm range.');
assert.equal(translate('Stealthburner · 24構成'),'Stealthburner · 24 configurations');
assert.equal(translate('PNG作成済み · 2048 × 1536 px'),'PNG ready · 2048 × 1536 px');
assert.equal(translate('選択可能な構成：1062通り'),'Available configurations: 1062');
assert.equal(translate('Beacon Rev Dのコイル底面：未計測'),'Beacon Rev D coil bottom: unmeasured');
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
