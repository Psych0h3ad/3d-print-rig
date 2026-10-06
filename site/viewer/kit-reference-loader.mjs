import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {applyNativeMotionProfile,loadNativeMotionProfile} from './native-motion-profile.mjs?v=91532eb992519143f437';
import {loadedFamilyAssetIdentity} from './gcode-loaded-asset-identity.mjs?v=42ac134c2d9a8b8f8dfc';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function loadKitReference(id){
 if(id!=='fysetc_v24_250_pro')throw Error('Loaded printer asset identity is incomplete');
 const base='../machines/'+id+'/',rig=await loadNativeMotionProfile(id),files={};
 const read=async(name,error)=>{
  const response=await fetch(base+name,{cache:'no-cache'});if(!response.ok)throw Error(error);
  const bytes=new Uint8Array(await response.arrayBuffer());
  // This bundle supplies no per-file expected JSON pins. Bind the bytes actually
  // read, without presenting their observed hash as independent verification.
  files[name]={path:base+name,bytes:bytes.length,sha256:await digest(bytes),verification:'observed-sha256'};
  return JSON.parse(new TextDecoder().decode(bytes));
 };
 const loader=new GLTFLoader(),checkedLoader={parseAsync:(buffer,path)=>{
  // loadModel verifies the decoded bytes against the native registration before
  // calling parseAsync. Retain that same pin and actual decoded byte count.
  files['model.glb']={path:base+'model.glb',bytes:buffer.byteLength,sha256:rig.model_sha256,verification:'loader-sha256'};
  return loader.parseAsync(buffer,path);
 }};
 const [sourceManifest,sourceProfile,g]=await Promise.all([
  read('assembly_manifest.json','部品表'),read('machine_profile.json','Native machine profile unavailable'),
  loadModel(checkedLoader,base+'model.glb',null,{verifySha256:rig.model_sha256})
 ]);
 const {manifest,profile}=applyNativeMotionProfile(sourceManifest,sourceProfile,rig,rig.model_sha256);
 const names=['assembly_manifest.json','machine_profile.json','model.glb'];
 const replay_asset_identity=await loadedFamilyAssetIdentity({machine:id,spec:{machine_id:id,files},manifest,profile,checkedFileNames:names,requiredFileNames:names});
 return {manifest,profile,g,replay_asset_identity};
}
