import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {appendPressThanks} from '../site/viewer/public-info.js';
import {formatMessage,loadLanguage,supportedLanguages} from '../site/viewer/i18n.mjs';

class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs=new Map();this.dataset={};this.textContent='';}
 append(...children){this.children.push(...children);}
 setAttribute(name,value){this.attrs.set(name,String(value));}
 getAttribute(name){return this.attrs.get(name)??null;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const container=new Element('div'),section=appendPressThanks(container);
assert.deepEqual(container.children,[section]);
assert.equal(section.tagName,'SECTION');
assert.equal(section.className,'source-item press-reference');
const [heading,thanks,article,byline]=section.children;
assert.equal(heading.tagName,'H3');
assert.equal(heading.dataset.i18nId,'ui.press_coverage');
assert.equal(thanks.dataset.i18nId,'ui.press_fabbaloo_thanks');
assert.equal(article.tagName,'A');
assert.equal(article.href,'https://www.fabbaloo.com/news/build-your-own-3d-printer-with-3d-print-rig');
assert.equal(article.textContent,'Build Your Own 3D Printer with 3D Print Rig');
assert.equal(article.target,'_blank');
assert.equal(article.rel,'noopener','An editorial reference is not a sponsored link');
assert.equal(article.getAttribute('data-i18n'),'off','Retain the exact published article title');
assert.equal(byline.textContent,'Kerry Stevenson · Fabbaloo · 2026-10-20');
assert.equal(byline.getAttribute('data-i18n'),'off');
assert(!section.children.some(node=>['IMG','IFRAME','SCRIPT'].includes(node.tagName)));
const expected={
 en:['In the press','Thank you to Kerry Stevenson and Fabbaloo for featuring 3D Print Rig.'],
 ja:['メディア掲載','Kerry Stevensonさん、Fabbalooで3D Print Rigをご紹介いただきありがとうございます！'],
 es:['En los medios','Gracias a Kerry Stevenson y a Fabbaloo por presentar 3D Print Rig.'],
 ko:['언론 소개','3D Print Rig를 소개해 주신 Kerry Stevenson과 Fabbaloo에 감사드립니다.'],
 ru:['Публикации в СМИ','Спасибо Kerry Stevenson и Fabbaloo за рассказ о 3D Print Rig.'],
};
for(const language of [...supportedLanguages,'en','ja','en']){
 await loadLanguage(language);
 assert.equal(formatMessage(heading.dataset.i18nId,{},language),expected[language][0]);
 assert.equal(formatMessage(thanks.dataset.i18nId,{},language),expected[language][1]);
}
const source=await fs.readFile(new URL('../site/viewer/public-info.js',import.meta.url),'utf8');
assert(source.indexOf('appendPressThanks(sb);')<source.indexOf('await loadCatalog();'),'The reference remains available when the source catalog cannot load');
const readme=await fs.readFile(new URL('../README.md',import.meta.url),'utf8');
assert(readme.indexOf('## Project sponsor')<readme.indexOf('## In the press'),'Watchtower keeps its existing prominence');
assert(readme.includes('['+article.textContent+']('+article.href+')'));
assert(readme.includes('Kerry Stevenson, Fabbaloo, October 20, 2026.'));
console.log('PASS actual press reference component, official article metadata, safe editorial link, no media reuse, all five languages and language reversal, README sponsor order.');
