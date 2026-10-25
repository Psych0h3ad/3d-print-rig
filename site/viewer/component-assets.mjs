import {verifyLedModelBytes} from './led-source-binding.mjs';
import {checkedExtraAsset,extraAssetBase} from './extra-asset-integrity.mjs?v=7483c3e6dfe211e4d6b5';
import {beginModelLoading} from './model-progress.mjs?v=beaef781095b6f56b290';
import {loadChunkedTrinity} from './chunked-component-glb.mjs?v=3639cc45ea38ec9c56d3';

// GLTFLoader reads these checked bytes. Avoid copying a complete decoded CAD
// buffer; a subview must still exclude bytes outside the authenticated span.
export function componentModelBuffer(bytes){
 if(!(bytes instanceof Uint8Array)||!(bytes.buffer instanceof ArrayBuffer)||!bytes.byteLength)throw Error('Invalid component model buffer');
 return bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

// External component CAD has the same byte/hash contract as machine assets.
export async function loadExternalComponent(loader,spec,href,{signal,progressOptions}={}){
 if(spec.component_id==='trinity_v13_current105_alpha_92')return loadChunkedTrinity(loader,spec,href);
 const base=extraAssetBase(spec.external,href,{publicOnly:progressOptions?.preferPublicAssets===true}),progress=beginModelLoading({model:spec.files['model.glb']},progressOptions);
 try{
  const [model,bytes]=await Promise.all([
   checkedExtraAsset(base,spec.files['model.glb'],{signal,onProgress:event=>progress.update('model',event)}),
   checkedExtraAsset(base,spec.files['parts.json'],{signal}),
  ]);
  const meta=JSON.parse(new TextDecoder().decode(bytes));
  if(meta.id!==spec.component_id||meta.parts?.length!==spec.parts||new Set(meta.parts.map(p=>p.key)).size!==spec.parts)throw Error('Component part manifest mismatch');
  progress.assembling();
  const path=new URL('.',base).href;
  const modelBuffer=componentModelBuffer(model);
  const gltf=await loader.parseAsync(modelBuffer,path);
  const ledModelReceipt=await verifyLedModelBytes(gltf.scene,spec,model,{catalogId:spec.component_id});
  return {gltf,meta,ledModelReceipt};
 }finally{progress.finish()}
}
