// Software fixtures use the real received metadata, never a forged receipt.
// The optional delivery path lets bounded local jobs avoid nested producers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {reviewedPower} from './v0_power_reference_audit.mjs';
const viewer=new URL('../site/viewer/',import.meta.url);
export function attachPowerFixtureMetadata(parts,id){const descriptors=reviewedPower(id).descriptors;return parts.map(p=>({...p,...structuredClone(descriptors[p.key]||{})}));}
export async function loadPowerFixtureReferences(){
 const source=fs.readFileSync(new URL('v0-assembly.mjs',viewer),'utf8'),imports=[...source.matchAll(/from '(\.\/v0-power-references\.mjs[^']*)'/g)];assert.equal(imports.length,1);
 const module=await import(new URL(imports[0][1],viewer));
 const encoded=process.env.RIG_POWER_REFERENCE_FIXTURE?fs.readFileSync(process.env.RIG_POWER_REFERENCE_FIXTURE):execFileSync(process.env.PYTHON||'python',['-B','-c','import sys;sys.path.insert(0,sys.argv[1]);from prepare_v0_power_delivery import build_v0_power_delivery_body;sys.stdout.buffer.write(build_v0_power_delivery_body(sys.argv[2])[0])',fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../site/',import.meta.url))],{maxBuffer:1024*1024,timeout:12000,windowsHide:true});
 return module.loadV0PowerReferences({fetchImpl:async url=>{assert.equal(new URL(url).search,'?v='+module.v0PowerReferenceDelivery.gzip.sha256.slice(0,20));return new Response(encoded);}});
}
