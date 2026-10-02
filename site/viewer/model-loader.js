const bundleInfo=fetch(new URL('../ASSET_BUNDLE.json?v=public-v22',import.meta.url),{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);

export async function modelURL(path){
 const url=new URL(path,location.href),info=await bundleInfo;
 if(info?.encoding==='gzip'){url.pathname+='.gz';if(info.sha256)url.searchParams.set('bundle',info.sha256.slice(0,16))}
 return url.href;
}

export async function loadModel(loader,path,onProgress){
 const original=new URL(path,location.href),url=await modelURL(path);
 if(url===original.href)return loader.loadAsync(path,onProgress);
 const response=await fetch(url);
 if(response.status===404){const fallback=new URL(url);fallback.pathname=fallback.pathname.slice(0,-3);return loader.loadAsync(fallback.href,onProgress)}
 if(!response.ok)throw Error('モデルを読み込めませんでした ('+response.status+')');
 if(typeof DecompressionStream==='undefined')throw Error('圧縮モデルの表示には新しいブラウザーが必要です');
 const total=Number(response.headers.get('content-length'))||0;let loaded=0;
 const progress=new TransformStream({transform(chunk,controller){loaded+=chunk.byteLength;onProgress?.({loaded,total});controller.enqueue(chunk)}});
 const buffer=await new Response(response.body.pipeThrough(progress).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 return loader.parseAsync(buffer,new URL('.',original).href);
}
