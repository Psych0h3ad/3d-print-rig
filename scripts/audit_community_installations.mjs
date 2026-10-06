import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {GLTFLoader} from '../site/viewer/vendor-r180/GLTFLoader.js';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {communitySchema,validateCommunityState,displayMotion,nativeMotion} from '../site/viewer/community-state.mjs';
export async function auditCommunityInstallations(directory,{output,indexPath=new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url)}={}){
assert.ok(directory,'Supply the actual community asset directory');
const index=JSON.parse(await fs.readFile(indexPath,'utf8')),results=[];
for(const spec of Object.values(index.machines)){
 const checked=async name=>{const pin=spec.files[name],raw=await fs.readFile(path.join(directory,pin.path));assert.equal(raw.length,pin.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),pin.sha256);if(pin.encoding!=='gzip')return raw;const bytes=gunzipSync(raw);assert.equal(bytes.length,pin.decoded_bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.decoded_sha256);return bytes};
 const profile=JSON.parse(await checked('machine_profile.json'));if(!profile.configurations)continue;
 const manifest=JSON.parse(await checked('assembly_manifest.json'));let root;
 for(const name of ['model.glb',...(spec.additional_models||[])]){const raw=await checked(name),scene=(await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;if(root)root.add(scene);else root=scene}
 const adapter=createCommunityAdapter(root,manifest,profile);assert.equal(adapter.nodes.size,spec.parts);
 const initial=new Map([...adapter.nodes].map(([k,n])=>[k,n.matrixWorld.clone()])),hardware=new Map();let vertices=0;
 for(const[k,n]of adapter.nodes)n.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position,normal=m.geometry.attributes.normal;assert.ok(a.array.every(Number.isFinite));for(let i=0;i<normal.count;i++)assert.ok(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<.005);vertices+=a.count;if(!['base','accent','frame'].includes(adapter.records.get(k).appearance_role))for(const mat of [].concat(m.material))hardware.set(mat,mat.color.getHexString())});
 const poses=[];function expand(keys,p={}){if(!keys.length){poses.push(p);return}const[k,...rest]=keys;for(const v of [profile.axes[k][0],0,profile.axes[k][1]])expand(rest,{...p,[k]:v})}expand(Object.keys(profile.axes));
 for(let i=0;i<=100;i++)poses.push(Object.fromEntries(Object.entries(profile.axes).map(([k,[a,b]])=>[k,a+(b-a)*i/100])));poses.push(...poses.slice().reverse());
 for(const[id,c]of Object.entries(profile.configurations)){
  adapter.setConfiguration(id);const hidden=new Set(c.hidden_keys);
  for(const pose of poses){adapter.setAxes(pose);adapter.setReferences(true);adapter.setReferences(false);for(const[k,n]of adapter.nodes){assert.equal(n.visible,!hidden.has(k)&&adapter.records.get(k).group!=='reference');assert.ok(n.matrixWorld.elements.every(Number.isFinite));const delta=displayMotion(nativeMotion(adapter.records.get(k).group,pose,profile),profile);for(let j=0;j<3;j++)assert.ok(Math.abs(n.matrixWorld.elements[12+j]-initial.get(k).elements[12+j]-delta[j])<1e-8)}}
  for(const palette of [{base:'#173f69',accent:'#fde160',frame:'#81949b'},{base:'#ffffff',accent:'#0044ff',frame:'#111111'},profile.palette_defaults]){adapter.setPalette(palette);for(const[k,n]of adapter.nodes){const color=palette[adapter.records.get(k).appearance_role];if(color)n.traverse(m=>{if(m.isMesh)for(const mat of [].concat(m.material))assert.equal(mat.color.getHexString(),color.slice(1))})}for(const[mat,color]of hardware)assert.equal(mat.color.getHexString(),color)}
  const state={schema:communitySchema,machine:profile.machine_id,configuration:id,axes:Object.fromEntries(Object.keys(profile.axes).map(k=>[k,0])),palette:profile.palette_defaults,night:false,grid:false,references:false,camera:{position:[1,1,1],target:[0,0,0],up:[0,1,0]}};validateCommunityState(JSON.parse(JSON.stringify(state)),profile);const legacy={...state};delete legacy.configuration;validateCommunityState(legacy,profile);assert.throws(()=>validateCommunityState({...state,configuration:'unknown-installation'},profile));
  adapter.setAxes(state.axes);for(const[k,n]of adapter.nodes)assert.deepEqual(n.matrixWorld.elements,initial.get(k).elements);
  const row={machine:profile.machine_id,configuration:id,parts:spec.parts,visible_parts:[...adapter.nodes.values()].filter(n=>n.visible).length,poses:poses.length,vertices,all_passed:true,model_sha256:spec.files['model.glb'].decoded_sha256,additional_model_sha256:(spec.additional_models||[]).map(n=>spec.files[n].decoded_sha256)};results.push(row);console.log(JSON.stringify(row));
 }
 assert.throws(()=>adapter.setConfiguration('unknown-installation'));adapter.setConfiguration('stock');
}
assert.ok(results.length,'No installed configurations audited');
const report={all_passed:true,results,scope:'Actual checksum-pinned main and supplement exports, registered visibility masks, rigid motion including reversed poses and exact reset, unit normals, printed palettes, purchased-material isolation, legacy and current save-state validation. Native clearance and browser inspection are separate.'};
if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const[directory,output]=process.argv.slice(2);await auditCommunityInstallations(directory,{output})}
