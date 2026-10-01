const bundleInfo=fetch(new URL('../ASSET_BUNDLE.json',import.meta.url)).then(r=>r.ok?r.json():null).catch(()=>null);

export async function modelURL(path){
 const url=new URL(path,location.href),info=await bundleInfo;
 if(info?.encoding==='gzip')url.pathname+='.gz';
 return url.href;
}

export async function loadModel(loader,path,onProgress){
 const original=new URL(path,location.href),url=await modelURL(path);
 if(url===original.href)return loader.loadAsync(path,onProgress);
 const response=await fetch(url);
 if(response.status===404)return loader.loadAsync(path,onProgress);
 if(!response.ok)throw Error('モデルを読み込めませんでした ('+response.status+')');
 if(typeof DecompressionStream==='undefined')throw Error('圧縮モデルの表示には新しいブラウザーが必要です');
 const total=Number(response.headers.get('content-length'))||0;let loaded=0;
 const progress=new TransformStream({transform(chunk,controller){loaded+=chunk.byteLength;onProgress?.({loaded,total});controller.enqueue(chunk)}});
 const buffer=await new Response(response.body.pipeThrough(progress).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 return loader.parseAsync(buffer,new URL('.',original).href);
}
