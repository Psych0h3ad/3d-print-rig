import {verifyLedModelBytes} from './led-source-binding.mjs';
import {checkedExtraAsset,extraAssetBase} from './extra-asset-integrity.mjs?v=019170d7f31b55da1667';
import {beginModelLoading} from './model-progress.mjs?v=beaef781095b6f56b290';
import {loadChunkedTrinity} from './chunked-component-glb.mjs?v=d8db4ff82a409942c85b';

// External component CAD has the same byte/hash contract as machine assets.
export async function loadExternalComponent(loader,spec,href){
 if(spec.component_id==='trinity_v13_current105_alpha_92')return loadChunkedTrinity(loader,spec,href);
 const base=extraAssetBase(spec.external,href),progress=beginModelLoading({model:spec.files['model.glb']});
 try{
  const [model,bytes]=await Promise.all([
   checkedExtraAsset(base,spec.files['model.glb'],{onProgress:event=>progress.update('model',event)}),
   checkedExtraAsset(base,spec.files['parts.json']),
  ]);
  const meta=JSON.parse(new TextDecoder().decode(bytes));
  if(meta.id!==spec.component_id||meta.parts?.length!==spec.parts||new Set(meta.parts.map(p=>p.key)).size!==spec.parts)throw Error('Component part manifest mismatch');
  progress.assembling();
  const path=new URL('.',base).href;
  const modelBuffer=model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength);
  const gltf=await loader.parseAsync(modelBuffer,path);
  const ledModelReceipt=await verifyLedModelBytes(gltf.scene,spec,model,{catalogId:spec.component_id});
  return {gltf,meta,ledModelReceipt};
 }finally{progress.finish()}
}
