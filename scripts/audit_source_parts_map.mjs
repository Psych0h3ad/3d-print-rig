import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const arg=n=>process.argv[process.argv.indexOf(n)+1];const site=pathToFileURL(path.resolve(arg('--site'))+'/'),machine=arg('--machine'),reportFile=arg('--report');
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(new URL('viewer/vendor-r180/three.module.js',site).href)},shortCircuit:true};return n(s,c)}`),import.meta.url);
globalThis.location={href:new URL('viewer/reference.html',site).href};
globalThis.ProgressEvent??=class{constructor(type,props){this.type=type;Object.assign(this,props)}};
const {externalModelDelivery}=await import(new URL('viewer/model-delivery.mjs',site));
const mapping=process.argv.includes('--inputs')?JSON.parse(await fs.readFile(arg('--inputs'),'utf8')).files??{}:{};const realFetch=globalThis.fetch;
const external=new Map(Object.entries(externalModelDelivery.files).map(([relative,row])=>[row.url,relative+'.gz']));
const requests=[];
globalThis.fetch=async input=>{
 const u=new URL(typeof input==='string'?input:input.url||input.href),clean=new URL(u);clean.search='';clean.hash='';let relative;
 if(clean.protocol==='file:'&&clean.href.startsWith(site.href))relative=decodeURIComponent(clean.href.slice(site.href.length));
 else relative=external.get(clean.href);
 if(!relative||relative.includes('..')||/\.(?:step|stp|brep|f3d)$/i.test(relative))throw Error('Unmapped or forbidden source request: '+clean.href);
 const local=new URL(relative,site);let stored;
 try{await fs.access(local);stored=local}catch{if(!mapping[relative]){if(external.has(clean.href))return realFetch(clean.href,{signal:AbortSignal.timeout(60000)});return new Response(null,{status:404})}stored=mapping[relative]}
 const before=await fs.stat(stored),digest=createHash('sha256');for await(const chunk of createReadStream(stored))digest.update(chunk);const after=await fs.stat(stored);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Input changed during receipt');requests.push({relative,bytes:before.size,sha256:digest.digest('hex')});
 return new Response(Readable.toWeb(createReadStream(stored)),{status:200,headers:{'content-length':String(before.size),'content-type':relative.endsWith('.json')?'application/json':'application/octet-stream'}});
};
function signature(root){const h=createHash('sha256');root.updateMatrixWorld(true);const nodes=[];root.traverse(n=>{if(n.isMesh)nodes.push(n)});for(const n of nodes.sort((a,b)=>a.uuid.localeCompare(b.uuid))){h.update(JSON.stringify([n.name,n.visible,n.matrixWorld.elements,n.geometry.drawRange]));for(const a of Object.values(n.geometry.attributes))h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(n.geometry.index){const a=n.geometry.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}h.update(JSON.stringify([].concat(n.material).map(m=>m.toJSON())))}return h.digest('hex')}
let loaded;
try{
 if(machine.startsWith('voron_trident_')){const m=await import(new URL('viewer/layout-voron-defaults.mjs',site));loaded=await m.loadVoronDefaultLayout(machine)}
 else{const m=await import(new URL('viewer/layout-v24-reference-provider.mjs',site));loaded=await m.loadV24ReferenceLayout(machine)}
 const {Scene}=await import(new URL('viewer/vendor-r180/three.module.js',site)),{createSourcePartsMap}=await import(new URL('viewer/source-parts-map.mjs',site)),{createAssemblyProgress,validateAssemblyProgress}=await import(new URL('viewer/assembly-workbench-model.mjs',site));
 const scene=new Scene();scene.add(loaded.root);const before=signature(loaded.root);const index=await createSourcePartsMap(loaded,scene),progress=createAssemblyProgress(index);
 for(const s of index.stages){index.state(s.index);progress.setStage(s.id);progress.toggle(s.id);for(const p of index.parts(s.id))index.getPartNodes(p.key)}
 validateAssemblyProgress(index,JSON.parse(JSON.stringify(progress.snapshot())));if(index.search('M3').length===0)throw Error('Source search lost hardware');
 const sample=index.entries()[0].node,parent=sample.parent;sample.removeFromParent();let rejects=0;try{index.verifyLive()}catch{rejects++}parent.add(sample);index.verifyLive();
 const savedX=sample.position.x;sample.position.x+=.001;try{index.verifyLive()}catch{rejects++}sample.position.x=savedX;index.verifyLive();
 if(rejects!==2)throw Error('Live graph negatives accepted');
 const {createVoronAssemblyGuide,supportsVoronAssembly}=await import(new URL('viewer/voron-assembly-guide.mjs',site));let assembly=null;
 if(supportsVoronAssembly(machine)){
  const guide=await createVoronAssemblyGuide(loaded,scene),counts=[];let last=0;
  for(const s of guide.stages){const state=guide.setStage(s.index);if(state.visible_count<last)throw Error('Assembly lost cumulative source parts');last=state.visible_count;counts.push(last);for(const key of s.part_keys)guide.getPartNodes(key)}
  guide.restore();if(signature(loaded.root)!==before)throw Error('Assembly completion changed source');
  for(const i of [...guide.stages.map(s=>s.index).reverse(),0,guide.stages.length-1,1,0,guide.stages.length-2]){if(guide.setStage(i).visible_count!==counts[i])throw Error('Reversed assembly mask differs');guide.previewComplete();if(signature(loaded.root)!==before)throw Error('Complete comparison did not preserve native source');guide.setStage(i)}
  const saved=createAssemblyProgress(guide);saved.setStage(2);saved.toggle(2);validateAssemblyProgress(guide,JSON.parse(JSON.stringify(saved.snapshot())));let mapRejected=false;try{validateAssemblyProgress(guide,progress.snapshot())}catch{mapRejected=true}if(!mapRejected)throw Error('Part-map progress accepted as assembly');
  guide.restore();assembly={stages:guide.stages.length,visibleCounts:counts,sourceItems:guide.partCount,reverseAndPreview:true,restoredUnchanged:signature(loaded.root)===before,wrongViewProgressRejected:mapRejected,identity:guide.identity};
 }
 const after=signature(loaded.root);if(before!==after)throw Error('Inspection mutated source assembly');
 loaded.dispose();let retired=false;try{index.verifyLive()}catch{retired=true}loaded=null;if(!retired)throw Error('Retired model accepted');
 const report={passed:true,machine,sourceItems:index.partCount,meshes:index.renderCount,classifications:index.stages.length,checked:index.stages.length,graphNegatives:rejects,retiredRejected:retired,sourceUnchanged:before===after,assembly,assemblyUnsupportedExplicitly:!supportsVoronAssembly(machine),identity:index.identity,requests,limitations:'Current default source-map and chapter-level cumulative assembly CPU inspection only; CNC remains part map only. No new mechanical fit, manual insertion paths, whole normal/GPU or continuous-motion qualification.'};
 await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({machine,passed:true,sourceItems:index.partCount,meshes:index.renderCount,classifications:index.stages.length}));
}finally{loaded?.dispose()}
