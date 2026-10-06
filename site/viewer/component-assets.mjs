import {checkedExtraAsset,extraAssetBase} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';

// External component CAD has the same byte/hash contract as machine assets.
export async function loadExternalComponent(loader,spec,href){
 const base=extraAssetBase(spec.external,href),progress=beginModelLoading({model:spec.files['model.glb']});
 try{
  const [model,bytes]=await Promise.all([
   checkedExtraAsset(base,spec.files['model.glb'],{onProgress:event=>progress.update('model',event)}),
   checkedExtraAsset(base,spec.files['parts.json']),
  ]);
  const meta=JSON.parse(new TextDecoder().decode(bytes));
  if(meta.id!==spec.component_id||meta.parts?.length!==spec.parts||new Set(meta.parts.map(p=>p.key)).size!==spec.parts)throw Error('Component part manifest mismatch');
  progress.assembling();
  return {gltf:await loader.parseAsync(model.buffer,new URL('.',base).href),meta};
 }finally{progress.finish()}
}
