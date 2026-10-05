import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const root=new URL('../site/fun/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('wallpapers.json',root),'utf8'));
const dimensions={phone:[1440,3120],desktop:[3840,2160],ultrawide:[5120,2160]};
const ids=new Set(),series=new Map();
const downloads='https://github.com/Psych0h3ad/3d-print-rig/releases/download/';
for(const row of catalog.wallpapers){
 assert(!ids.has(row.id),'Duplicate wallpaper');ids.add(row.id);
 assert.deepEqual([row.width,row.height],dimensions[row.format]);
 assert(['paper','blueprint','graphite'].includes(row.palette));
 assert(['assembly','exploded','section','collection','pattern'].includes(row.kind));
 assert(row.download.startsWith(downloads)&&row.download.endsWith('/'+row.id+'.png'));
 assert(/^[a-f0-9]{64}$/.test(row.sha256)&&row.bytes>1000);
 assert(row.sources.length&&row.sources.every(([url,label])=>url.startsWith('https://')&&label));
 assert(row.preview.startsWith('previews/'+row.id+'.webp?'));
 assert((await stat(new URL(row.preview.split('?')[0],root))).size>1000);
 const variants=series.get(row.series)||new Set();assert(!variants.has(row.palette+row.format));
 variants.add(row.palette+row.format);series.set(row.series,variants);
 if(['pattern','collection'].includes(row.kind))assert(row.view_count>=5);
}
for(const variants of series.values())assert.equal(variants.size,9,'Every design supports every palette and screen');
for(const pack of catalog.packs){
 const expected=catalog.wallpapers.filter(r=>pack.format==='all'||(pack.format==='new'?r.no>=28:r.format===pack.format));
 assert.equal(pack.count,expected.length);assert(pack.download.startsWith(downloads)&&pack.download.endsWith('/'+pack.name));
 assert(pack.name.endsWith('-'+pack.count+'.zip'));
}
const provenance=JSON.parse(await readFile(new URL('collection-provenance.json',root),'utf8'));
for(const sheet of provenance.sheets){
 const row=catalog.wallpapers.find(r=>r.id===sheet.id);assert(row);
 assert.equal(sheet.placements.length,row.view_count);
 for(const placement of sheet.placements){
  assert(provenance.inputs[placement.drawing]);
  const [x0,y0,x1,y1]=placement.bounds;
  assert(x0>=0&&y0>=0&&x1<=row.width&&y1<=row.height&&x1>x0&&y1>y0);
 }
}
console.log(`Wallpapers: ${series.size} designs / ${ids.size} PNGs; dimensions, variants, downloads, credits, preview files and CAD placement bounds passed.`);
