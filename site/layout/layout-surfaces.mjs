import * as THREE from '../viewer/vendor-r180/three.module.js';
import {DEFAULT_ROOM_APPEARANCE, WALL_FINISHES, FLOOR_FINISHES} from './layout-finishes.mjs?v=001b62f9728770a12303';

// UVs are metres, independent of room size. These are small, deterministic
// procedural swatches, not external images or measurements of building materials.
const SWATCHES = {
  paint: {metres:[.4,.4], color:[230,228,221], roughness:.94, relief:.00025},
  linen: {metres:[.16,.16], color:[220,215,203], roughness:.97, relief:.00045},
  stripe: {metres:[.12,.32], color:[231,228,219], roughness:.93, relief:.0002},
  oak: {metres:[1.8,1.08], color:[181,155,117], roughness:.82, relief:.0003},
  concrete: {metres:[.8,.8], color:[175,177,174], roughness:.96, relief:.0004},
  tile: {metres:[.6,.6], color:[205,204,195], roughness:.81, relief:.00025},
};
export function resolveSurfaceAppearance(value) {
  return {wall:WALL_FINISHES.includes(value?.wall)?value.wall:DEFAULT_ROOM_APPEARANCE.wall,
    floor:FLOOR_FINISHES.includes(value?.floor)?value.floor:DEFAULT_ROOM_APPEARANCE.floor};
}
const TAU = Math.PI*2;
const noise = (x,y) => {
  let n=Math.imul(x+11,374761393)^Math.imul(y+19,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295-.5;
};
function swatch(key,anisotropy) {
  const spec=SWATCHES[key],size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,grain=noise(x,y);
    const cloud=Math.sin(TAU*u)*Math.cos(TAU*v)+.4*Math.sin(TAU*(3*u+2*v));
    let shade=cloud*.8+grain*1.7,colors=spec.color;
    if(key==='linen')shade+=((x%4<2?1:-1)+(y%4<2?1:-1))*2.1+grain*2;
    if(key==='stripe')shade+=(x<size/2?1:-1)*10;
    if(key==='concrete')shade=cloud*3+grain*3;
    if(key==='oak'){
      const board=Math.floor(v*6),across=v*6-board,along=(u+(board%3)/3)%1;
      const joint=across<.009||along<.0025;
      shade=noise(board,0)*14+Math.sin(TAU*(v*47+.18*Math.sin(TAU*u)))*2.4+
        Math.sin(TAU*(v*103+.3*Math.sin(TAU*u*2)))*1.4+grain*2;
      if(joint)shade-=27;
    }
    if(key==='tile'){
      const edge=Math.min(u,v,1-u,1-v);
      shade=edge<.003/.6/2?-26:cloud*1.5+grain*1.2;
    }
    const i=(y*size+x)*4;
    for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,Math.round(colors[c]+shade)));
    data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name=`layout-swatch-${key}`;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1/spec.metres[0],1/spec.metres[1]);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=anisotropy;texture.needsUpdate=true;
  return texture;
}
function contactTexture() {
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=Math.abs((x+.5)/size*2-1),v=Math.abs((y+.5)/size*2-1);
    const fade=Math.max(0,Math.min(1,(1-Math.max(u,v))*7));
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=Math.round(255*Math.exp(-2.8*(u**4+v**4))*fade*fade);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name='layout-envelope-contact';texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

// One owner per renderer. Dragging or rebuilding meshes borrows these resources;
// only renderer teardown disposes them, including after a cancelled export.
export function createLayoutSurfaces({anisotropy=1}={}) {
  const cache=new Map(),textures=new Set();let disposed=false,contact;
  const own=material=>{material.userData.layoutSurfaceOwned=true;return material;};
  function finish(key) {
    if(disposed)throw Error('Layout surfaces disposed');
    if(!Object.hasOwn(SWATCHES,key))throw Error('Unknown layout finish');
    if(!cache.has(key)){
      const map=swatch(key,anisotropy),spec=SWATCHES[key];textures.add(map);
      const m=own(new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:spec.relief,
        roughness:spec.roughness,metalness:0,side:THREE.DoubleSide}));
      m.name=`layout-finish-${key}`;cache.set(key,m);
    }
    return cache.get(key);
  }
  function trim() {
    if(disposed)throw Error('Layout surfaces disposed');
    if(!cache.has('trim')){const m=own(new THREE.MeshStandardMaterial({color:'#e6e3da',roughness:.83}));m.name='layout-baseboard';cache.set('trim',m);}
    return cache.get('trim');
  }
  function occlusion(kind='printer') {
    if(disposed)throw Error('Layout surfaces disposed');
    if(!['printer','furniture','foot'].includes(kind))throw Error('Unknown layout contact');
    const key=`contact-${kind}`;
    if(!cache.has(key)){
      if(!contact){contact=contactTexture();textures.add(contact);}
      const m=own(new THREE.MeshBasicMaterial({map:contact,color:'#393d3d',transparent:true,
        opacity:kind==='furniture'?.15:kind==='foot'?.36:.29,depthWrite:false,
        polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      m.name=`layout-envelope-${kind}`;cache.set(key,m);
    }
    return cache.get(key);
  }
  return {finish,trim,occlusion,dispose(){if(disposed)return;disposed=true;
    for(const t of textures)t.dispose();for(const m of cache.values())m.dispose();textures.clear();cache.clear();}};
}

// Keep unit-box transforms (and the literal clear-room boundary) intact while
// mapping each face at its physical length. The wall owns this geometry only.
export function wallSurfaceGeometry(length,height,thickness) {
  const geometry=new THREE.BoxGeometry(1,1,1),uv=geometry.attributes.uv,n=geometry.attributes.normal;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*(Math.abs(n.getX(i))>.5?thickness:length),
    uv.getY(i)*(Math.abs(n.getY(i))>.5?thickness:height));
  return geometry;
}
