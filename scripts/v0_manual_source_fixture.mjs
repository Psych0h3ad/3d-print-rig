// Source-only stream fixture, never a substitute for the actual-asset audit.
import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';
export async function receiveManualSourceFixture(){
 const here=path.dirname(fileURLToPath(import.meta.url)),viewer=new URL('../site/viewer/',import.meta.url),code=await fs.readFile(new URL('v0-assembly.mjs',viewer),'utf8'),ref=code.match(/from '(\.\/v0-manual-data\.mjs[^']*)'/)[1],url=new URL(ref,viewer),api=await import(url);
 const text=process.env.RIG_MANUAL_REFERENCE_FIXTURE?await fs.readFile(process.env.RIG_MANUAL_REFERENCE_FIXTURE,'utf8'):execFileSync(process.env.PYTHON||'python',['-B',path.join(here,'prepare_v0_manual_fixture.py')],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:12000,windowsHide:true}),bodies=JSON.parse(text);let requests=0;
 const bundle=await api.loadV0ManualData({fetchImpl:async(target,options)=>{assert.equal(options.cache,'no-cache');const[name,pin]=Object.entries(api.v0ManualDelivery).find(([name,pin])=>String(target)===new URL('./data/'+path.basename(pin.gzip.path)+'?v='+pin.gzip.sha256.slice(0,20),url).href)||[];assert(pin);requests++;const b=Buffer.from(bodies[name],'base64');return new Response(b,{headers:{'Content-Length':String(b.length)}})}});assert.equal(requests,13);return {bundle,api,requests};
}

// Complete only source metadata for explicit box/controller fixtures. The real
// mesh/normal/transform checks remain in the independent actual-asset gate.
export function attachManualTailFixtureMetadata(parts,id,bundle){
 const spec=bundle.data['v0-assembly-stages'].machines[id],mapped=new Map(parts.map(p=>[p.key,{...p}]));assert(spec);
 for(const name of ['v0-fan-assembly','v0-enclosure-assembly','v0-panel-closure','v0-panel-door','v0-tophat-assembly','v0-spool-assembly']){
  for(const[key,d]of Object.entries(bundle.data[name][id].descriptors)){
   assert(mapped.has(key),'Fixture must already contain each original source key: '+key);
   const source=d.source?structuredClone(d.source):{...mapped.get(key).source,repository:'VoronDesign/Voron-0',source_key:key.slice(-5),commit:spec.manual.revision.split('@').at(-1).trim(),assembly_path:structuredClone(d.path)};
   mapped.set(key,{...mapped.get(key),...structuredClone(d),source});
  }
 }
 return [...mapped.values()];
}
