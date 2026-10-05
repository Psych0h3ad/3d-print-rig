import {beginModelLoading,readModelBytes} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
const bundleInfo=fetch(new URL('../ASSET_BUNDLE.json?v=trident-clearance-35',import.meta.url),{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);

export async function modelURL(path){
 const url=new URL(path,location.href),info=await bundleInfo;
 if(info?.encoding==='gzip'){url.pathname+='.gz';if(info.sha256)url.searchParams.set('bundle',info.sha256.slice(0,16))}
 return url.href;
}

export async function loadModel(loader,path,onProgress){
 const progress=beginModelLoading({model:{}});
 try{
  const original=new URL(path,location.href),url=await modelURL(path);let gzip=url!==original.href;
  let response=await fetch(url);
  if(gzip&&response.status===404){const fallback=new URL(url);fallback.pathname=fallback.pathname.slice(0,-3);response=await fetch(fallback);gzip=false}
  if(!response.ok)throw Error('モデルを読み込めませんでした ('+response.status+')');
  const bytes=await readModelBytes(response,{onProgress:event=>{progress.update('model',event);onProgress?.(event)}});
  progress.assembling();
  // Some hosts set Content-Encoding: gzip and the browser already decodes it.
  let buffer=bytes.buffer;
  if(gzip&&bytes[0]===0x1f&&bytes[1]===0x8b){
   if(typeof DecompressionStream==='undefined')throw Error('圧縮モデルの表示には新しいブラウザーが必要です');
   buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return await loader.parseAsync(buffer,new URL('.',original).href);
 }finally{progress.finish()}
}
