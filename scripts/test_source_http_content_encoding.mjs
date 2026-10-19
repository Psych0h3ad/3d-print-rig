import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createHash,webcrypto} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

globalThis.crypto??=webcrypto;
const {fetchPinned}=await import(pathToFileURL(resolve(process.argv[2]??'site/viewer/source-assembly-runtime/loading.mjs')));
const raw=Buffer.from(JSON.stringify({source:'public STL assembly',notice:'Built-in supports omitted / 埋め込みサポート',parts:Array.from({length:320},(_,i)=>({id:i,role:'printed',source_sha256:'a'.repeat(64)}))}));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const spec={bytes:raw.length,sha256:sha(raw)};
const gzip=gzipSync(raw),br=brotliCompressSync(raw),explicitGzip=gzipSync(raw);
assert(gzip.length<raw.length&&br.length<raw.length);
const routes=new Map([
 ['/identity',{body:raw}],
 ['/gzip',{body:gzip,encoding:'gzip'}],
 ['/br',{body:br,encoding:'br'}],
 ['/explicit-gzip-file',{body:explicitGzip}],
 ['/gzip-of-gzip-file',{body:gzipSync(explicitGzip),encoding:'gzip'}],
 ['/truncated',{body:raw.subarray(0,-1)}],
 ['/oversize',{body:Buffer.concat([raw,Buffer.from([1])])}],
 ['/changed',{body:Buffer.from(raw)}]
]);
routes.get('/changed').body[0]^=1;
const server=createServer((req,res)=>{
 const route=routes.get(req.url);
 if(!route){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Length',route.body.length);
 if(route.encoding)res.setHeader('Content-Encoding',route.encoding);
 res.end(route.body);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const base=`http://127.0.0.1:${server.address().port}`;
let controls=0;
try{
 for(const path of ['/identity','/gzip','/br']){
  const progress=[];
  const bytes=await fetchPinned(base+path,spec,new AbortController().signal,row=>progress.push(row));
  assert.deepEqual(Buffer.from(bytes),raw,path);
  assert(progress.length>0&&progress.every(p=>p.received<=raw.length&&p.total===raw.length));
  assert.equal(progress.at(-1).percent,100);controls++;
 }
 const compressedSpec={bytes:explicitGzip.length,sha256:sha(explicitGzip)};
 for(const path of ['/explicit-gzip-file','/gzip-of-gzip-file']){
  assert.deepEqual(Buffer.from(await fetchPinned(base+path,compressedSpec,new AbortController().signal)),explicitGzip);controls++;
 }
 // CORS can expose the encoded Content-Length but hide Content-Encoding.
 // The browser's decoded response stream remains the integrity input.
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(raw,{headers:{'content-length':String(gzip.length)}});
  assert.deepEqual(Buffer.from(await fetchPinned('https://example.invalid/decoded-cors',spec,new AbortController().signal)),raw);controls++;
 }finally{globalThis.fetch=originalFetch;}
 await assert.rejects(fetchPinned(base+'/truncated',spec,new AbortController().signal),/Truncated asset/);controls++;
 await assert.rejects(fetchPinned(base+'/oversize',spec,new AbortController().signal),/exceeds pinned byte count/);controls++;
 await assert.rejects(fetchPinned(base+'/changed',spec,new AbortController().signal),/Source asset hash changed/);controls++;
 await assert.rejects(fetchPinned(base+'/identity',{...spec,bytes:128*1024*1024+1},new AbortController().signal),/128 MiB/);controls++;
 const canceled=new AbortController();canceled.abort();
 await assert.rejects(fetchPinned(base+'/identity',spec,canceled.signal),e=>e.name==='AbortError');controls++;
 console.log(JSON.stringify({passed:true,controls,decoded_bytes:raw.length,gzip_wire_bytes:gzip.length,brotli_wire_bytes:br.length,integrity_guard:'Bounded decoded length + SHA-256 unchanged'}));
}finally{
 server.closeAllConnections();
 await new Promise(resolve=>server.close(resolve));
}
