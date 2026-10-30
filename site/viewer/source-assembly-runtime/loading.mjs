import {formatMessage} from '../i18n.mjs?v=4c2e6b3d25b8ba4c8d87';
export async function fetchPinned(url,expected,signal,onProgress=()=>{}){
 if(!Number.isSafeInteger(expected.bytes)||expected.bytes<=0||expected.bytes>128*1024*1024)throw Error('Asset exceeds the 128 MiB transfer budget');
 if(signal?.aborted)throw new DOMException('Canceled','AbortError');
 const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Error('Asset request failed: '+response.status);
 // Fetch exposes decoded bytes. Content-Length can describe compressed wire
 // bytes, and CORS can hide Content-Encoding. Pin the bounded decoded stream
 // below; the transport header cannot establish its size or source identity.
 const reader=response.body.getReader(),bytes=new Uint8Array(expected.bytes);let received=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
 try{while(true){if(signal?.aborted)throw new DOMException('Canceled','AbortError');const {value,done}=await reader.read();if(signal?.aborted)throw new DOMException('Canceled','AbortError');if(done)break;if(received+value.byteLength>expected.bytes)throw Error('Asset exceeds pinned byte count');bytes.set(value,received);received+=value.byteLength;onProgress({received,total:expected.bytes,percent:received/expected.bytes*100,phase:'download'});}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
 if(received!==expected.bytes)throw Error('Truncated asset');
 onProgress({received,total:received,percent:100,phase:'verify'});const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==expected.sha256)throw Error('Source asset hash changed');if(signal?.aborted)throw new DOMException('Canceled','AbortError');onProgress({received,total:received,percent:100,phase:'assembly'});return bytes.buffer;
}
// The denominator is the selected model's pinned transport bytes. Decode events
// use a different unit (raw bytes) and must never replace this cumulative count.
// Parsing and scene construction have no measured work total: no percent there.
export function createChunkProgress(chunks,onProgress=()=>{},{signal,useGzip=typeof globalThis.DecompressionStream==='function'}={}){
 const sizes=chunks.map(c=>useGzip&&c.gzip?c.gzip.bytes:c.bytes),total=sizes.reduce((a,b)=>a+b,0);
 if(!sizes.length||sizes.some(n=>!Number.isSafeInteger(n)||n<=0)||!Number.isSafeInteger(total))throw Error('Invalid model progress byte total');
 let completed=0,committed=0,current=0,local=0,active=false;
 const emit=phase=>{if(signal?.aborted)return;const received=committed+local;onProgress({phase,received,total,percent:received/total*100,downloadPercent:received/total*100,currentChunk:current+1,totalChunks:chunks.length,completedChunks:completed,percentMeaning:'selected-model-transfer-bytes'});};
 return{
  begin(ordinal){if(active||current!==completed||chunks[current]?.ordinal!==ordinal)throw Error('Progress chunk order changed');active=true;local=0;emit('download');return q=>{if(signal?.aborted||!active||current!==completed||chunks[current]?.ordinal!==ordinal)return;if(q.phase==='decode'){emit('decode');return;}if(!Number.isSafeInteger(q.received)||q.received<0||q.received>sizes[current])throw Error('Invalid model transfer progress');local=Math.max(local,q.received);emit(q.phase==='download'?'download':'verify');};},
  finish(ordinal){if(!active||chunks[current]?.ordinal!==ordinal||current!==completed)throw Error('Progress chunk completion order changed');local=sizes[current];emit('verify');committed+=local;local=0;completed++;current=completed;active=false;},
  assembly(){if(completed!==chunks.length)throw Error('Model progress assembly before complete transfer');if(!signal?.aborted)onProgress({phase:'assembly',percent:null,downloadPercent:100,received:total,total,completedChunks:completed,totalChunks:chunks.length});}
 };
}
export function sourceLoadingText(progress,language='en'){
 const t=(key,values={})=>formatMessage('source_assembly.progress.'+key,values,language),phase=progress?.phase;
 if(['manifest','assembly','ready'].includes(phase))return t(phase);
 const percent=progress?.downloadPercent;
 if(!['download','verify','decode'].includes(phase)||!Number.isFinite(percent)||percent<0||percent>100)return t('manifest');
 const value=(Math.floor(percent*10)/10).toFixed(1),file=Number.isSafeInteger(progress.currentChunk)&&progress.currentChunk>0&&progress.currentChunk<=progress.totalChunks?' · '+t('file',{0:progress.totalChunks,1:progress.currentChunk}):'';
 return t(phase)+' · '+value+'%'+(phase==='download'?'':' '+t('downloaded'))+file;
}
export const sourceProgressStatus=({job,messages,node,language})=>progress=>{if(job.current())messages.dynamic(node,()=>sourceLoadingText(progress,language()));};
export const modelMemoryWarningBytes=512*1024*1024,modelMemoryHardCapBytes=1024*1024*1024;
export function browserMemoryHints(device={}){return {availableRAMBytes:null,availableRAMKnown:false,approximateDeviceMemoryGiB:Number.isFinite(device.deviceMemory)&&device.deviceMemory>0?device.deviceMemory:null};}
export function memoryAssessment(packet){const b=packet.loading_budget;if(!b||b.model_sha256!==packet.model.sha256||b.bytes!==packet.model.bytes||!Number.isSafeInteger(b.single_load_peak_bytes)||b.single_load_peak_bytes<=0)throw Error('Missing current actual model memory estimate');const peak=b.single_load_peak_bytes,transfer=b.transfer_peak_bytes??packet.model.bytes;return {estimatedPeakBytes:peak,needsExplicitChoice:peak>modelMemoryWarningBytes,hardCapBytes:modelMemoryHardCapBytes,estimateAbovePlanningBudget:peak>modelMemoryHardCapBytes,hardCapExceeded:!Number.isSafeInteger(transfer)||transfer<=0||transfer>128*1024*1024,availableRAMKnown:false,browserMeasured:false};}
// An estimate is not detected free RAM. Explicit full loading remains available;
// actual single transfers are capped, loads serialized, previous roots released.
export function assertLoadingBudget(packet,activeResidentBytes=0,{largeModelConfirmed=false}={}){const a=memoryAssessment(packet),peak=a.estimatedPeakBytes+activeResidentBytes;if(!Number.isSafeInteger(activeResidentBytes)||activeResidentBytes<0||a.hardCapExceeded||!Number.isSafeInteger(peak)){const e=Error('Model exceeds the bounded loader resource limit');e.code='MEMORY_BUDGET';throw e;}if(a.needsExplicitChoice&&!largeModelConfirmed){const e=Error('Large model needs an explicit loading choice');e.code='MEMORY_CONFIRMATION_REQUIRED';throw e;}return peak;}
export function loadingPlan(packet,activeResidentBytes=0,options={}){const alone=assertLoadingBudget(packet,0,options),retainedPeak=alone+activeResidentBytes;if(activeResidentBytes>0&&(memoryAssessment(packet).needsExplicitChoice||retainedPeak>modelMemoryHardCapBytes))return {releaseActiveBeforeLoad:true,peakBytes:alone,retainedPeakBytes:retainedPeak};return {releaseActiveBeforeLoad:false,peakBytes:assertLoadingBudget(packet,activeResidentBytes,options),retainedPeakBytes:retainedPeak};}
export function createLoadCoordinator(){let serial=0,controller,pending=Promise.resolve();
 return {start(){controller?.abort();controller=new AbortController();const ticket=++serial,signal=controller.signal;return {signal,current:()=>ticket===serial&&!signal.aborted};},run(job,operation){const result=pending.then(()=>job.current()?operation():false);pending=result.catch(()=>{});return result;},cancel(){serial++;controller?.abort();}};
}
