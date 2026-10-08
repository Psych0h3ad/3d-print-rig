import {checkedExtraAsset,extraAssetBase} from './extra-asset-integrity.mjs?v=737f5dc17ca78791c0d8';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
import {loadChunkedTrinity} from './chunked-component-glb.mjs?v=6b1039c50882fce242a7';

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
  const gltf=await loader.parseAsync(model.buffer,path);
  return {gltf,meta};
 }finally{progress.finish()}
}
