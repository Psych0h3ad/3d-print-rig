import * as THREE from './vendor-r180/three.module.js';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {createCrossantAdapter} from './crossant-adapter.mjs';
import {createChainPreview} from './crossant-chain_preview.mjs';
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export function disposeCrossant(root){
 if(!root)return;const geometry=new Set(),materials=new Set();
 root.traverse(n=>{if(n.isMesh){geometry.add(n.geometry);for(const m of [].concat(n.material))materials.add(m)}});
 for(const v of [...geometry,...materials])v.dispose();root.removeFromParent();
}
export async function loadCrossant(index,{signal,onProgress=()=>{}}={}){
 if(index.machine_id!=='crossant_235_v06_leadscrew'||index.parts!==2177)throw Error('Crossantの構成情報が一致しません。');
 const local=['127.0.0.1','localhost'].includes(location.hostname),base=local?new URL('../'+index.local_directory+'/',import.meta.url):new URL(index.base_url);
 async function checked(name){
  const s=index.files[name];if(!s||s.path.includes('..')||s.path.startsWith('/')||s.bytes>20*1024*1024)throw Error('Crossantの構成ファイルが不正です。');
  const url=new URL(s.path,base);url.searchParams.set('sha',s.sha256.slice(0,16));const res=await fetch(url,{signal});if(!res.ok)throw Error('Crossantのモデルを取得できません。');
  const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.length!==s.bytes||await digest(bytes)!==s.sha256)throw Error('Crossantのモデルのハッシュが一致しません。');return bytes;
 }
 onProgress('Crossantの部品表を読み込み中…');
 const names=['assembly_manifest.json','machine_profile.json','belt_bindings.json','chain_bindings.json','KNOWN_CONTACTS.json'];
 const [manifest,profile,belts,chains,contacts]=await Promise.all(names.map(async n=>JSON.parse(new TextDecoder().decode(await checked(n)))));
 if(manifest.machine_id!==index.machine_id||profile.machine_id!==index.machine_id||manifest.parts.length!==index.parts)throw Error('Crossantの構成情報が一致しません。');
 const gltf=JSON.parse(new TextDecoder().decode(await checked('model.gltf'))),urls=new Map();let root;
 try{
  if(gltf.buffers.length!==7||gltf.images?.length||gltf.nodes.length!==2177)throw Error('Crossantのモデル構成が不正です。');
  for(let i=0;i<7;i++){
   const name='geometry_'+String(i).padStart(2,'0')+'.bin';if(gltf.buffers[i].uri!==name)throw Error('Crossantのバッファ構成が不正です。');
   onProgress('Crossantの形状を読み込み中… '+(i+1)+' / 7');const bytes=await checked(name);if(bytes.length!==gltf.buffers[i].byteLength)throw Error('Crossantのバッファ長が一致しません。');urls.set(name,URL.createObjectURL(new Blob([bytes])));
  }
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{const name=new URL(url,base).pathname.split('/').pop();if(!urls.has(name))throw Error('Crossantの未登録バッファです。');return urls.get(name)});
  root=(await new GLTFLoader(manager).parseAsync(JSON.stringify(gltf),base.href)).scene;
  // glTF materials are shared; give each part its own appearance ownership.
  root.traverse(n=>{if(n.isMesh)n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone()});
  const nodes=new Map();root.traverse(n=>{if(n.userData?.part_key)nodes.set(n.userData.part_key,n)});
  const chain=createChainPreview(root,nodes,chains,THREE),adapter=createCrossantAdapter(root,manifest,profile,belts,{chainPreview:chain});
  adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
  return {root,manifest,profile,adapter,chain,contacts,index};
 }catch(e){disposeCrossant(root);throw e}finally{for(const url of urls.values())URL.revokeObjectURL(url)}
}
