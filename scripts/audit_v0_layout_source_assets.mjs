import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,list)=>v.startsWith('--')?[...a,[v.slice(2),list[i+1]]]:a,[]));
assert(args.site&&args.machine&&args.report,'--site, --machine, --report required');
const site=path.resolve(args.site),viewer=pathToFileURL(site+'/viewer/'),mid=args.machine,out=args.report,sha=b=>createHash('sha256').update(b).digest('hex');
assert(['voron_v02_120','voron_v02r1_120'].includes(mid));
const files=new Map(),requests=[],pins={};
for(const relative of ['machines/'+mid+'/assembly_manifest.json','machines/'+mid+'/machine_profile.json','machines/'+mid+'/model.glb.gz','V0_INSTALLATIONS.json','ASSET_BUNDLE.json','modules/v0_carriage_display.json','modules/v0_carriage_display.glb.gz','modules/v0_hinge_source_tessellation.json','modules/v0_hinge_source_tessellation.glb.gz'])files.set(relative,path.join(site,relative));
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return n(s==='three'?${JSON.stringify(new URL('vendor-r180/three.module.js',viewer).href)}:s,c)}`),import.meta.url);
globalThis.location={href:new URL('../layout/',viewer).href};
const {externalModelDelivery}=await import(new URL('model-delivery.mjs',viewer)),external=new Map(Object.entries(externalModelDelivery.files||externalModelDelivery).filter(([,v])=>v?.url).map(([k,v])=>[v.url,k]));
const previous=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 options.signal?.throwIfAborted();const url=new URL(input),clean=new URL(url);clean.search='';clean.hash='';let key;
 if(url.protocol==='file:'){const file=fileURLToPath(clean);key=path.relative(site,file).replaceAll(path.sep,'/');assert(!key.startsWith('..'));}
 else{key=external.get(clean.href);assert(key,'Unregistered network request blocked '+clean.origin);if(key.endsWith('.glb'))key+='.gz';}
 assert(files.has(key),'Unregistered local provider request '+key);const bytes=await fs.readFile(files.get(key));const h=sha(bytes);if(pins[key])assert.equal(pins[key].sha256,h);pins[key]={bytes:bytes.length,sha256:h};requests.push({logical:key,method:options.method||'GET'});return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});
};
const mode=args.mode||'success',controller=new AbortController(),digest=crypto.subtle.digest.bind(crypto.subtle),tracked=new Map(),THREE=await import(new URL('vendor-r180/three.module.js',viewer));let finalHashes=0;
const track=g=>{if(!tracked.has(g))tracked.set(g,0)};
for(const name of ['setAttribute','setIndex','copy']){const original=THREE.BufferGeometry.prototype[name];THREE.BufferGeometry.prototype[name]=function(...a){track(this);return original.apply(this,a)}}
const originalDispose=THREE.BufferGeometry.prototype.dispose;THREE.BufferGeometry.prototype.dispose=function(){track(this);tracked.set(this,tracked.get(this)+1);return originalDispose.call(this)};
crypto.subtle.digest=async function(algorithm,data){const b=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);if(b.byteLength<10000&&new TextDecoder().decode(b).startsWith('{\"schema\":\"v0-displayed-source-identity-v1\"')){finalHashes++;if(mode==='fail')throw Error('Injected displayed identity digest failure');if(mode==='abort')controller.abort(new DOMException('Cancelled at displayed identity digest','AbortError'))}return digest(algorithm,data)};
assert(['success','fail','abort'].includes(mode));const report={schema:'actual-v0-layout-source-assets-v1',passed:false,mode,machine:mid,scope:'Current displayed-source identity success/failure/cancel boundary with tracked BufferGeometry assignment/copy and disposal; full selected source via exact production Layout V0 provider/GLTFLoader/adapter/installations and mandatory hinge manager with explicit local transport of registered public bytes. Selected CPU/default/motion/palette/disposal only; not browser/GPU/native fit.',nativeFitQualified:false,physicalFitQualified:false,browserQualified:false,publicationQualified:false};let loaded;
try{
 const providerCode=await fs.readFile(new URL('layout-v0-provider.mjs',viewer),'utf8'),specifier=providerCode.match(/from '(\.\/v0-hinge-source-geometry\.mjs\?[^']+)'/)?.[1];assert(specifier,'Exact provider import required');
 const {loadV0DefaultLayout}=await import(new URL('layout-v0-provider.mjs',viewer)),api=await import(new URL(specifier,viewer));
 loaded=await loadV0DefaultLayout(mid,{signal:controller.signal});assert.equal(mode,'success');
 const sourceRoot=loaded.root.children[0],receipt=api.guardV0HingeSourceGeometry(sourceRoot),adapter=loaded.adapter,parts=mid==='voron_v02_120'?1653:1678;
 const helperSpecifier=providerCode.match(/from '(\.\/v0-layout-source-identity\.mjs\?[^']+)'/)[1],{v0LayoutDisplayIdentity}=await import(new URL(helperSpecifier,viewer));
 const identity=v0LayoutDisplayIdentity({machineId:mid,baselineRevision:loaded.source.normalSourceRevision,manifestSHA256:pins['machines/'+mid+'/assembly_manifest.json'].sha256,profileSHA256:pins['machines/'+mid+'/machine_profile.json'].sha256,hingeReceipt:receipt,movingKeys:[...adapter.door.keys],fixedPivotKeys:[...adapter.door.fixedPivotKeys],fixedLatchKeys:[...adapter.door.fixedLatchKeys]});
 assert.equal(loaded.source.displayedSourceRevision,sha(Buffer.from(JSON.stringify(identity))));assert.equal(loaded.source.displayedSourceSchema,identity.schema);assert.equal(finalHashes,1);assert.equal(adapter.nodes.size,parts);
 const source=structuredClone(loaded.source);loaded.dispose();loaded.dispose();
 for(const[g,count]of tracked)assert.equal(count,1,'Every observed constructed/assigned BufferGeometry must be disposed exactly once');
 report.passed=true;Object.assign(report,{sourceParts:parts,currentDisplayedIdentity:identity,source,observedGeometryDisposals:tracked.size,finalHashes,physicalFitQualified:false});
}catch(error){if(mode!=='success'&&finalHashes===1&&((mode==='fail'&&error.message==='Injected displayed identity digest failure')||(mode==='abort'&&error.name==='AbortError'))){for(const[g,count]of tracked)assert.equal(count,1,'Observed geometry must be released on final digest failure/cancel');report.passed=true;report.expectedFailure=error.message;report.observedGeometryDisposals=tracked.size;report.finalHashes=finalHashes}else{report.error=error.stack||String(error);process.exitCode=1}}finally{
 try{loaded?.dispose()}finally{globalThis.fetch=previous;crypto.subtle.digest=digest}
 report.requests=requests;report.inputSHA256=pins;report.producerSHA256=sha(await fs.readFile(fileURLToPath(import.meta.url)));report.currentProviderSHA256=sha(await fs.readFile(new URL('layout-v0-provider.mjs',viewer)));report.identityHelperSHA256=sha(await fs.readFile(new URL('v0-layout-source-identity.mjs',viewer)));await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,machine:mid,sourceParts:report.sourceParts,requests:requests.length,error:report.error}));
}
