import {verifyLedModelBytes} from './led-source-binding.mjs';
import {externalModelDelivery} from './model-delivery.mjs';
import {registeredModelDelivery,verifyDeliveredModel} from './model-delivery-policy.mjs';
import {beginModelLoading,readModelBytes} from './model-progress.mjs?v=beaef781095b6f56b290';
let bundleInfo;
const getBundleInfo=()=>bundleInfo??=fetch(new URL('../ASSET_BUNDLE.json?v=trident-clearance-35',import.meta.url),{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
const siteRoot=new URL('../',import.meta.url);
const deliveredModel=path=>registeredModelDelivery(path,location.href,siteRoot,externalModelDelivery);

export async function modelURL(path){
 const delivery=deliveredModel(path);if(delivery)return delivery.url;
 const url=new URL(path,location.href),info=await getBundleInfo();
 if(info?.encoding==='gzip'){url.pathname+='.gz';if(info.sha256)url.searchParams.set('bundle',info.sha256.slice(0,16))}
 return url.href;
}

export async function loadModel(loader,path,onProgress,options={}){
 const progress=beginModelLoading({model:{}},options.progressOptions);
 try{
  const original=new URL(path,location.href),delivery=deliveredModel(path),url=await modelURL(path);let gzip=url!==original.href;
  let response=await fetch(url,{signal:options.signal});
  if(gzip&&!delivery&&response.status===404){const fallback=new URL(url);fallback.pathname=fallback.pathname.slice(0,-3);response=await fetch(fallback,{signal:options.signal});gzip=false}
  if(!response.ok)throw Error('モデルを読み込めませんでした ('+response.status+')');
  const bytes=await readModelBytes(response,{onProgress:event=>{progress.update('model',event);onProgress?.(event)}});
  if(delivery&&bytes[0]===0x1f&&bytes[1]===0x8b)await verifyDeliveredModel(bytes,delivery);
  progress.assembling();
  // Some hosts set Content-Encoding: gzip and the browser already decodes it.
  let buffer=bytes.buffer;
  if(gzip&&bytes[0]===0x1f&&bytes[1]===0x8b){
   if(typeof DecompressionStream==='undefined')throw Error('圧縮モデルの表示には新しいブラウザーが必要です');
   buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if(delivery)await verifyDeliveredModel(buffer,delivery,true);
  if(options.verifySha256){const digest=await crypto.subtle.digest('SHA-256',buffer),hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==options.verifySha256)throw Error('Native model hash mismatch')}
  options.signal?.throwIfAborted();
  const gltf=await loader.parseAsync(buffer,new URL('.',original).href);
  if(options.ledSourceSpec)gltf.ledModelReceipt=await verifyLedModelBytes(gltf.scene,options.ledSourceSpec,buffer,{catalogId:options.ledCatalogId});
  return gltf;
 }finally{progress.finish()}
}
