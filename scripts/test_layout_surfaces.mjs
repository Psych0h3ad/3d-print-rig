// Actual procedural textures/materials and Three geometry, no DOM or GPU fixture.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=process.argv.indexOf('--site'),site=option<0?path.join(root,'site'):path.resolve(process.argv[option+1]);
const {createLayoutSurfaces,resolveSurfaceAppearance,wallSurfaceGeometry}=await import(pathToFileURL(path.join(site,'layout/layout-surfaces.mjs')));
const {WALL_FINISHES,FLOOR_FINISHES,DEFAULT_ROOM_APPEARANCE}=await import(pathToFileURL(path.join(site,'layout/layout-finishes.mjs')));
const THREE=await import(pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
assert.deepEqual(resolveSurfaceAppearance(),DEFAULT_ROOM_APPEARANCE);
assert.deepEqual(resolveSurfaceAppearance({wall:'unknown',floor:'tile'}),{wall:'paint',floor:'tile'});
const surfaces=createLayoutSurfaces({anisotropy:4}),other=createLayoutSurfaces(),keys=[...WALL_FINISHES,...FLOOR_FINISHES],owned=new Set(),signatures=new Set();
for(const key of keys){
  const m=surfaces.finish(key),again=surfaces.finish(key),map=m.map;
  assert.equal(m,again);assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert.equal(m.depthWrite,true);
  assert.equal(m.metalness,0);assert.ok(m.roughness>=.8);assert.equal(m.side,THREE.DoubleSide);
  assert.equal(map.isDataTexture,true);assert.equal(map.colorSpace,THREE.SRGBColorSpace);
  assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.wrapT,THREE.RepeatWrapping);
  assert.equal(map.generateMipmaps,true);assert.equal(map.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(map.anisotropy,4);
  const {data,width,height}=map.image;assert.ok(width<=256&&height<=256);assert.equal(data.byteLength,width*height*4);
  let min=255,max=0;for(let i=0;i<data.length;i+=4){assert.equal(data[i+3],255);min=Math.min(min,data[i]);max=Math.max(max,data[i]);}
  assert.ok(min>95&&max<250,'Restrained, readable opaque swatch range');assert.ok(max-min>2,'Finish cannot be a solid fill');
  const signature=hash(data);signatures.add(signature);assert.equal(hash(other.finish(key).map.image.data),signature,'Stable pattern across sessions');
  assert.notEqual(other.finish(key).map,map,'Independent renderer resource owners');
  owned.add(m);owned.add(map);
}
assert.equal(signatures.size,keys.length,'Each finish must have its own visible pattern');
assert.deepEqual(surfaces.finish('oak').map.repeat.toArray(),[1/1.8,1/1.08]);
assert.deepEqual(surfaces.finish('tile').map.repeat.toArray(),[1/.6,1/.6]);
assert.deepEqual(surfaces.finish('stripe').map.repeat.toArray(),[1/.12,1/.32]);
// A stripe changes horizontally and stays vertical; linen changes along both
// axes. Test actual generated pixels rather than names or helper declarations.
function averageColumn(m,x){const {data,width,height}=m.map.image;let sum=0;for(let y=0;y<height;y++)sum+=data[(y*width+x)*4];return sum/height;}
assert.ok(averageColumn(surfaces.finish('stripe'),64)-averageColumn(surfaces.finish('stripe'),192)>15);
const trim=surfaces.trim();owned.add(trim);assert.equal(trim.transparent,false);assert.equal(trim.opacity,1);
let contactMap;
for(const kind of ['printer','furniture','foot']){
  const m=surfaces.occlusion(kind);assert.equal(m,surfaces.occlusion(kind));assert.equal(m.depthWrite,false);assert.equal(m.transparent,true);
  assert.ok(m.opacity>0&&m.opacity<.4);assert.equal(m.polygonOffset,true);
  if(contactMap)assert.equal(m.map,contactMap);contactMap=m.map;owned.add(m);owned.add(contactMap);
}
const {data,width,height}=contactMap.image,alpha=(x,y)=>data[(y*width+x)*4+3];
assert.ok(alpha(width/2,height/2)>245);for(let x=0;x<width;x++){assert.equal(alpha(x,0),0);assert.equal(alpha(x,height-1),0);}
for(let y=0;y<height;y++){assert.equal(alpha(0,y),0);assert.equal(alpha(width-1,y),0);}
assert.ok([...owned].filter(o=>o.isTexture).reduce((sum,o)=>sum+o.image.data.byteLength,0)<2*1024*1024,'Bounded swatches, not room-sized images');
for(const [length,heightM]of [[1,2.4],[9.7,3.1],[.5,1]]){
  const g=wallSurfaceGeometry(length,heightM,.05),uv=g.attributes.uv,n=g.attributes.normal;
  for(const axis of [0,1,2])for(const direction of [-1,1]){
    const us=[],vs=[];for(let i=0;i<n.count;i++)if(n.getComponent(i,axis)===direction){us.push(uv.getX(i));vs.push(uv.getY(i));}
    assert.ok(us.length);assert.ok(Math.abs(Math.max(...us)-(axis===0?.05:length))<1e-6);
    assert.ok(Math.abs(Math.max(...vs)-(axis===1?.05:heightM))<1e-6);
  }
  for(const attr of Object.values(g.attributes))assert.ok([...attr.array].every(Number.isFinite));g.dispose();
}
const counts=new Map([...owned].map(o=>[o,0]));for(const o of owned)o.addEventListener('dispose',()=>counts.set(o,counts.get(o)+1));
surfaces.dispose();surfaces.dispose();for(const count of counts.values())assert.equal(count,1);
assert.throws(()=>surfaces.finish('oak'),/disposed/);assert.throws(()=>surfaces.trim(),/disposed/);assert.throws(()=>surfaces.occlusion(),/disposed/);other.dispose();
console.log(JSON.stringify({status:'PASS',finishes:keys.length,textureHashes:[...signatures],scope:'Actual DataTexture pixels, physical UV dimensions, bounded cache ownership and disposal. No browser pixels or native CAD shadows.'}));
