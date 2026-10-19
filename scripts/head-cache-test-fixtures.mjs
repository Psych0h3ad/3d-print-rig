import {pathToFileURL} from 'node:url';
const index=process.argv.indexOf('--three');
export const THREE=await import(index<0?new URL('../site/viewer/vendor/three.module.js',import.meta.url).href:pathToFileURL(process.argv[index+1]).href);
export const MiB=1024*1024;
export function assetFixture(id,bytes=48*MiB,{key='part',index=false}={}){
 const backing=new ArrayBuffer(bytes),position=new THREE.BufferAttribute(new Float32Array(backing,0,9),3);
 position.array.set([0,0,0,1,0,0,0,1,0]);
 const geometry=new THREE.BufferGeometry().setAttribute('position',position);
 if(index)geometry.setIndex([0,1,2]);
 const material=new THREE.MeshStandardMaterial({color:'#3c5f78',metalness:.7,roughness:.3});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='P'+key+'__source';mesh.userData.part_key=key;
 const root=new THREE.Group();root.visible=false;root.add(mesh);
 const metadata={id,source:'test-source-'+id,parts:[{key,name:id,component:'source-hardware'}]};
 const row={mesh,key,materials:[material],colors:[material.color.clone()],originals:[{color:material.color.clone(),opacity:1,transparent:false}]};
 return {root,meta:metadata,entries:[row],meshes:[row],backing,geometry,material,mesh};
}
export function disposalCounter(resource){let calls=0;resource.addEventListener('dispose',()=>calls++);return ()=>calls;}
export async function insert(cache,policy,id,asset){
 const promise=Promise.resolve(asset);promise.loaded=asset;cache.set(id,promise);policy.track(id,promise);await promise;await Promise.resolve();return promise;
}
export function activate(cache,ids){for(const[id,p]of cache)if(p.loaded)p.loaded.root.visible=ids.includes(id);}
