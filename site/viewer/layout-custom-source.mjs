import {loadCustomVoron} from './custom-voron-loader.mjs?v=96c2a05646e84785faf5';
import {hasLayoutZeroFaceAdmission,applyParsedLayoutZeroFaces} from '../layout/layout-zero-face-source-binding.mjs?v=8d97ec65fb8b10aa4eec';

function releaseUnreturned(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root?.traverse(mesh=>{if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of [].concat(mesh.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 for(const value of [...geometries,...materials,...textures])value.dispose();
 root?.removeFromParent();root?.clear();
}

/** The normal loader's default path never requests or runs this layout hook. */
export async function loadLayoutCustomVoron(id,options={}){
 const admitted=hasLayoutZeroFaceAdmission(id);
 const loaded=await loadCustomVoron(id,{...options,layoutSourceIdentity:admitted});
 if(!admitted)return loaded;
 try{
  const parsed=loaded.layoutParsedSource;
  const lease=await applyParsedLayoutZeroFaces(parsed?.gltf,{scope:'layout',machineId:id,verifiedSource:parsed?.verifiedSource,signal:options.signal});
  loaded.layoutSourceZeroFaces=lease.summary;
  loaded.disposeLayoutSourceCleanup=lease.disposeDetachedSources;
  return loaded;
 }catch(error){releaseUnreturned(loaded.root);throw error;}
 finally{delete loaded.layoutParsedSource;}
}
