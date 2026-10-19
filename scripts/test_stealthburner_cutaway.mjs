import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {lessonState,advanceLesson,sectionFraction,lessonChapters,lessonDuration} from '../site/viewer/stealthburner-lesson.mjs';
import {cutawaySource,nativeToDisplay} from '../site/viewer/stealthburner-cutaway-source.mjs';
import {createTranslator} from '../site/viewer/translation-engine.mjs';
import {sourceRevision} from './build_locales.mjs';

assert(nativeToDisplay([0,-28.76,312.1]).every((n,i)=>Math.abs(n-[0,.3121,.02876][i])<1e-12));
assert.equal(lessonDuration,40);assert.equal(lessonState(0).hot,0);
for(const time of [0,5,10,15,20,30,40,20,0]){
  const cooled=lessonState(time),uncooled=lessonState(time,{fan:false}),cold=lessonState(time,{heater:false});
  for(const state of [cooled,uncooled,cold])for(const key of ['time','hot','sink','break'])assert(Number.isFinite(state[key]));
  assert(cooled.sink<=cooled.break&&cooled.break<=cooled.hot);
  assert(uncooled.sink>=cooled.sink);assert.equal(cold.extrusion,false);
  assert.equal(lessonState(time,{feed:false}).extrusion,false);
}
assert(lessonState(40).extrusion);assert(lessonState(40,{fan:false}).heatCreep);
assert(!lessonState(40,{heater:false,fan:false}).heatCreep);
assert.equal(advanceLesson(40,3),40);assert.equal(advanceLesson(2,10),2.1);
assert.equal(advanceLesson(2,10,false),2);assert.equal(sectionFraction(NaN),0);
assert.equal(sectionFraction(999),1);assert.equal(sectionFraction(-1),0);
assert.deepEqual(cutawaySource.assets.map(s=>s.parts),[30,53]);
assert.equal(cutawaySource.assets.reduce((n,s)=>n+s.compressed_bytes,0),2164912);
for(const spec of cutawaySource.assets)for(const key of ['compressed_sha256','decoded_sha256','metadata_sha256'])assert.match(spec[key],/^[a-f0-9]{64}$/);
const root=new URL('../',import.meta.url),source=JSON.parse(await fs.readFile(new URL('localization/source.json',root),'utf8'));
const dictionaries=new Map();
for(const lang of ['es','ko','ru']){
  const locale=JSON.parse(await fs.readFile(new URL('localization/'+lang+'.json',root),'utf8'));
  dictionaries.set(lang,Object.fromEntries(Object.entries(locale.messages).map(([id,r])=>[id,[r.source_revision,r.text]])));
}
const definitions=Object.fromEntries(Object.entries(source.entries).map(([id,e])=>[id,{...e,revision:sourceRevision(e)}]));
const translator=createTranslator(definitions,{dictionaries});
const html=await fs.readFile(new URL('site/viewer/stealthburner-cutaway.html',root),'utf8');
const ids=new Set([...html.matchAll(/data-i18n-id="([^"]+)"/gu)].map(m=>m[1]));
for(const c of lessonChapters){ids.add(c.title);ids.add(c.text);}ids.add('cutaway.play');ids.add('cutaway.link');
for(const id of ids)for(const lang of ['en','ja','es','ko','ru'])assert.notEqual(translator.formatMessage(id,{},lang),id,id+' '+lang);
assert.equal(translator.diagnostics().fallbacks.length,0);
assert(!html.includes('data-controller'),'Educational page has independent lifecycle, not a printer controller');
assert(html.includes('id="stage"')&&html.includes('id="lesson"'));
const controller=await fs.readFile(new URL('site/viewer/stealthburner-cutaway.mjs',root),'utf8');
assert(controller.includes('stencil:true'));assert(controller.includes('prefers-reduced-motion'));
assert(controller.includes('AbortController')&&controller.includes('pagehide')&&controller.includes('visibilitychange'));
assert(!controller.includes("'TOOLHEAD_CONFIGURATIONS.json'"),'A small lesson must not download the full combination catalog');
assert(controller.includes('spec.decoded_sha256')&&controller.includes('spec.metadata_sha256'));
const css=await fs.readFile(new URL('site/viewer/stealthburner-cutaway.css',root),'utf8');
assert(css.includes('grid-template-rows:minmax(200px,46%) minmax(0,1fr)'), 'Keep the model visible above scrollable explanation on mobile');
assert(css.includes('touch-action:none'));
const builder=await fs.readFile(new URL('site/viewer/toolheads.html',root),'utf8');
assert(builder.includes('./stealthburner-cutaway.html'));
console.log('PASS Stealthburner lesson stages, no cold extrusion, heat/fan toggles, bounded timeline, source pins, five languages and mobile/lifecycle contracts (source scope).');
