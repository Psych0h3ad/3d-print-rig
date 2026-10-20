import {loadedPrinterAssetIdentity} from './gcode-loaded-asset-identity.mjs?v=42ac134c2d9a8b8f8dfc';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=7483c3e6dfe211e4d6b5';
import {beginModelLoading} from './model-progress.mjs?v=beaef781095b6f56b290';
import {createCommunityAdapter} from './community-adapter.mjs?v=b0cc85230bdd2fc9c369';
import {applyNativeMotionProfile,loadNativeMotionProfile} from './native-motion-profile.mjs?v=91532eb992519143f437';
import {applyEvaInstallation} from './eva-installations.mjs?v=4dfad49e1f98d4b5b9f2';
import {loadEvaFrontSurfaces,applyEvaFrontSurfaces} from './eva-front-surfaces.mjs?v=2f482f31b2c5c8b35897';
export async function loadCommunity(index,machine,{signal,progressOptions}={}){
 const spec=index.machines[machine];if(!spec||spec.machine_id!==machine)throw Error('Unknown community printer');
 const extraModels=spec.additional_models||[];
 if(!Array.isArray(extraModels)||extraModels.some(n=>typeof n!=='string'||!n.endsWith('.glb')||n==='model.glb'||!spec.files[n])||new Set(extraModels).size!==extraModels.length)throw Error('Invalid community component models');
 const names=['assembly_manifest.json','machine_profile.json','model.glb',...extraModels],progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,spec.files[n]])),progressOptions);
 try{
 const base=extraAssetBase({...index,base_url:spec.base_url??index.base_url,local_directory:spec.local_directory??index.local_directory},import.meta.url,{publicOnly:progressOptions?.preferPublicAssets===true}),checked=name=>checkedExtraAsset(base,spec.files[name],{signal,onProgress:e=>progress.update(name,e)}),read=async name=>JSON.parse(new TextDecoder().decode(await checked(name)));
 let [manifest,profile,bytes,...extraBytes]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checked('model.glb'),...extraModels.map(checked)]);
 if(manifest.machine_id!==machine||profile.machine_id!==machine||manifest.native_leaf_count!==spec.parts)throw Error('Native identity mismatch');
 const registration=await loadNativeMotionProfile(machine,{signal})??(profile.motion_registration?.model_sha256?profile.motion_registration:null);
 ({manifest,profile}=applyNativeMotionProfile(manifest,profile,registration,spec.files['model.glb'].decoded_sha256));
 ({manifest,profile}=applyEvaInstallation(manifest,profile,spec.eva_installation));
 progress.assembling();const loader=new GLTFLoader(),root=(await loader.parseAsync(bytes.buffer,base.href)).scene;
 for(const data of extraBytes)root.add((await new GLTFLoader().parseAsync(data.buffer,base.href)).scene);
 if(spec.eva_installation)applyEvaFrontSurfaces(root,manifest,spec.files['model.glb'].decoded_sha256,{...await loadEvaFrontSurfaces(loader,import.meta.url,{signal,progressOptions}),sourceOriginMm:profile.origin_mm,metadataSha256:spec.files['assembly_manifest.json'].sha256});
 const replay_asset_identity=await loadedPrinterAssetIdentity({machine,spec,manifest,profile,checkedFileNames:names});
 return {root,manifest,profile,replay_asset_identity,adapter:createCommunityAdapter(root,manifest,profile)};
 }finally{progress.finish()}
}
