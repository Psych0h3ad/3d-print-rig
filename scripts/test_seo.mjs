import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const site=new URL('../site/',import.meta.url),base='https://psych0h3ad.github.io/3d-print-rig/';
const files=[];
async function scan(directory){for(const item of await fs.readdir(directory,{withFileTypes:true})){if(item.name==='licenses')continue;const path=new URL(item.name+(item.isDirectory()?'/':''),directory);if(item.isDirectory())await scan(path);else if(item.name.endsWith('.html'))files.push(path)}}
await scan(site);
const png=await fs.readFile(new URL('assets/social/3d-print-rig-preview.png',site));
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
assert(png.length<500000,'Sharing should not require a large CAD download');
const image=base+'assets/social/3d-print-rig-preview.png?v='+createHash('sha256').update(png).digest('hex').slice(0,20);
const sitemap=await fs.readFile(new URL('sitemap.xml',site),'utf8');
const locations=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(m=>m[1]);
assert.equal(new Set(locations).size,locations.length,'No duplicate index or query variants in sitemap');
assert(!locations.includes(base));assert(!locations.includes(base+'embed/'));
assert(locations.every(url=>url.startsWith(base)&&!url.includes('?')&&!url.includes('#')));
const canonicalURLs=new Set();
for(const file of files){
 const name=file.href.slice(site.href.length),text=await fs.readFile(file,'utf8');
 const head=text.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1];assert(head,'Explicit head required: '+name);
 const metas=new Map();for(const m of head.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)">/gu)){assert(!metas.has(m[1]),'Duplicate metadata '+name+' '+m[1]);metas.set(m[1],m[2])}
 for(const key of ['description','robots','og:title','og:type','og:site_name','og:description','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image','twitter:image:alt'])assert(metas.get(key),'Missing raw-HTML metadata '+name+' '+key);
 assert.equal(metas.get('og:image'),image);assert.equal(metas.get('twitter:image'),image);
 assert.equal(metas.get('twitter:card'),'summary_large_image');assert.equal(metas.get('og:image:width'),'1200');assert.equal(metas.get('og:image:height'),'630');
 assert.equal(metas.get('description'),metas.get('og:description'));assert.equal(metas.get('description'),metas.get('twitter:description'));
 assert(metas.get('description').length>=70&&metas.get('description').length<=220);
 const canonical=[...head.matchAll(/<link rel="canonical" href="([^"]+)">/gu)];assert.equal(canonical.length,1);assert.equal(canonical[0][1],metas.get('og:url'));
 assert(!canonical[0][1].includes('?'));assert(!canonical[0][1].includes('#'));
 const target=name==='index.html'?'viewer/index.html':name;assert.equal(canonical[0][1],base+(target.endsWith('index.html')?target.slice(0,-10):target));
 const json=[...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)];assert.equal(json.length,1);
 const schema=JSON.parse(json[0][1]);assert.equal(schema['@context'],'https://schema.org');assert.equal(schema.url,canonical[0][1]);assert.equal(schema['@type'],'WebPage');assert.equal(schema.isPartOf.url,base);
 assert(!schema.aggregateRating,'Do not invent search ratings');
 assert.equal((head.match(/<title>/gu)||[]).length,1);assert.equal(head.match(/<title>(.*?)<\/title>/u)[1],metas.get('og:title'));
 assert(text.indexOf('charset="utf-8"')<1024,'Charset must precede large metadata block');
 assert(head.includes('href="'+base+'sitemap.xml"'));
 if(name==='embed/index.html'){assert.equal(metas.get('robots'),'noindex,follow');assert(text.includes('Alpha test'))}
 else {assert.equal(metas.get('robots'),'index,follow,max-image-preview:large');canonicalURLs.add(canonical[0][1])}
}
assert.deepEqual([...canonicalURLs].sort(),locations.sort(),'Every crawlable page is registered in sitemap');
execFileSync('python',['-B','-X','utf8','scripts/build_seo.py','--check'],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
console.log(`SEO checks passed: ${files.length} raw HTML pages, ${locations.length} canonical URLs, versioned 1200 x 630 PNG and structured data.`);
