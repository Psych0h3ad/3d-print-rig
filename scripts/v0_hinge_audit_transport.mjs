import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function applyBuiltV0HingeGeometry({site,loader,root,manifest,profile,receipts,pinFile}){
 const base=path.resolve(site),viewer=pathToFileURL(base+'/viewer/'),api=await import(new URL('v0-hinge-source-geometry.mjs',viewer)),allowed=new Set(['modules/v0_hinge_source_tessellation.json','modules/v0_hinge_source_tessellation.glb.gz']),assets={};let requests=0;
 const fetchAsset=async url=>{const file=path.resolve(fileURLToPath(url)),relative=path.relative(base,file).replaceAll(path.sep,'/');assert(allowed.has(relative),'Unregistered source hinge audit transport');const bytes=await(pinFile?pinFile(file):fs.readFile(file));assets[relative]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};requests++;return new Response(bytes)};
 const receipt=await api.applyV0HingeSourceGeometry({loader,root,manifest,profile,receipts,fetchAsset});assert.equal(api.guardV0HingeSourceGeometry(root),receipt);assert.equal(requests,2);assert.equal(Object.keys(assets).length,2);
 return {requests,assets,receipt,productionDecoderAndGeometryGuard:true,nativeClearanceVerified:false,physicalFitVerified:false};
}
