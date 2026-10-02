import * as THREE from 'three';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {createRatRigAdapter} from './ratrig_adapter.mjs';
import {createRatRigGcodePreview} from './ratrig_gcode_preview.mjs';

const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function disposeRatRig(root,adapter){
 adapter?.dispose();if(!root)return;
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of [].concat(n.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}}});
 for(const v of [...geometries,...materials,...textures])v.dispose();root.removeFromParent();
}
export async function loadRatRigMachine(index,id,{onProgress=()=>{},signal}={}){
 const row=index.machines.find(r=>r.id===id);if(!row||!index.stock_only)throw Error('RatRigの標準構成が未登録です。');
 const local=['127.0.0.1','localhost'].includes(location.hostname),base=local?new URL('../'+index.local_directory+'/',import.meta.url):new URL(index.base_url);
 async function checked(name){
  const spec=row.files[name];if(!spec)throw Error('構成ファイルが不足しています。');
  const url=new URL(spec.path,base);url.searchParams.set('sha',spec.sha256.slice(0,16));const response=await fetch(url,{cache:'no-cache',signal});if(!response.ok)throw Error('CADを取得できませんでした ('+response.status+')');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(spec.encoding==='gzip'&&bytes.length===spec.decoded_bytes&&await digest(bytes)===spec.decoded_sha256)return bytes;
  if(bytes.length!==spec.bytes||await digest(bytes)!==spec.sha256)throw Error('CADファイルのハッシュが一致しません。');
  if(spec.encoding==='gzip'){
   if(typeof DecompressionStream==='undefined')throw Error('圧縮モデルの表示には新しいブラウザーが必要です');
   const decoded=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
   if(decoded.length!==spec.decoded_bytes||await digest(decoded)!==spec.decoded_sha256)throw Error('展開したモデルのハッシュが一致しません。');return decoded;
  }
  return bytes;
 }
 onProgress('CAD部品表を読み込み中…');
 const [profile,manifest,routes]=await Promise.all(['machine_profile.json','assembly_manifest.json','flexible_routes.json'].map(async n=>JSON.parse(new TextDecoder().decode(await checked(n)))));
 if(profile.machine_id!==id||manifest.machine_id!==id||!profile.import_ready||profile.native_import_file!==row.native_import_file)throw Error('CAD構成の識別情報が一致しません。');
 onProgress('3Dモデルを読み込み中…');const bytes=await checked('model.glb');let root,adapter;
 try{
  root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;adapter=createRatRigAdapter(root,manifest,profile,routes,THREE);
  return {row,root,adapter,profile,manifest,routes,gcode:createRatRigGcodePreview(adapter,profile)};
 }catch(e){disposeRatRig(root,adapter);throw e}
}
