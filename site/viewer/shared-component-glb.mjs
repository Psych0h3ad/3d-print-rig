import {BufferAttribute} from './vendor/three.module.js';

// Static, immutable CAD accessors can reference the checked GLB directly.
// GLTFLoader otherwise copies the BIN chunk and every buffer view. Keep the
// arrays for picking and WebGL context restoration; never discard hardware.
export function sharedGlbDocument(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<28)throw Error('Invalid shared CAD buffer');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw Error('Invalid CAD GLB header');
 const jl=v.getUint32(12,true),bo=20+jl;
 if(jl%4||bo+8>bytes.byteLength||v.getUint32(16,true)!==0x4e4f534a||v.getUint32(bo+4,true)!==0x004e4942||bo+8+v.getUint32(bo,true)!==bytes.byteLength)throw Error('Invalid CAD GLB chunks');
 const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,bo))),binOffset=bytes.byteOffset+bo+8,binLength=v.getUint32(bo,true);
 if(json.asset?.version!=='2.0'||json.buffers?.length!==1||json.buffers[0].uri||json.buffers[0].byteLength>binLength||json.extensionsUsed?.length||json.extensionsRequired?.length||json.images?.length||json.textures?.length||json.skins?.length||json.animations?.length)throw Error('Unsupported shared CAD document');
 const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 const accessors=json.accessors?.map(a=>{
  const b=json.bufferViews?.[a.bufferView],T=types[a.componentType],size=sizes[a.type],start=(b?.byteOffset??0)+(a.byteOffset??0),length=a.count*size;
  if(!T||!size||a.sparse||!b||b.buffer!==0||b.byteStride||!Number.isSafeInteger(a.count)||a.count<=0||!Number.isSafeInteger(b.byteLength)||b.byteLength<=0||!Number.isSafeInteger(start)||start<0||(binOffset+start)%T.BYTES_PER_ELEMENT||!Number.isSafeInteger(length)||start+length*T.BYTES_PER_ELEMENT>(b.byteOffset??0)+b.byteLength||(b.byteOffset??0)+b.byteLength>json.buffers[0].byteLength)throw Error('Unsupported shared CAD accessor');
  return {T,size,start,length,normalized:a.normalized===true};
 });
 if(!accessors?.length||json.meshes?.some(m=>m.primitives?.some(p=>p.targets?.length||(p.mode??4)!==4||p.extensions)))throw Error('Unsupported shared CAD mesh');
 return {json,accessors,binOffset,buffer:bytes.buffer};
}

export async function parseSharedComponentGlb(loader,bytes,base){
 const doc=sharedGlbDocument(bytes),plugin=parser=>{
  parser.loadAccessor=index=>{
   const a=doc.accessors[index];if(!a)throw Error('Invalid CAD accessor reference');
   return Promise.resolve(new BufferAttribute(new a.T(doc.buffer,doc.binOffset+a.start,a.length),a.size,a.normalized));
  };
  return {name:'rig_shared_static_accessors'};
 };
 loader.register(plugin);
 try{return await loader.parseAsync(doc.json,base)}finally{loader.unregister(plugin)}
}
