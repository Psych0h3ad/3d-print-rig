// Explicit, fixed-host preparation of JSON data only. Import performs no I/O.
import {downloadEquipmentPreviewGeometry} from './layout-equipment-transfer.mjs?v=6a62cba60f932d4aa468';
import {LAYOUT_EQUIPMENT_PREVIEW,LAYOUT_EQUIPMENT_PREVIEW_MODEL,createLayoutEquipmentPreviewCache,
  getLayoutEquipmentPreviewGeometry,isLayoutEquipmentPreviewPrepared,
  installLayoutEquipmentPreviewGeometry} from './layout-equipment.mjs?v=6046ce679bd80e50ee2d';

function preparer(download,cache) {
  let active = null;
  function prepare({signal,onProgress}={}) {
    try {
      signal?.throwIfAborted();
      if(onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function');
    } catch(error) { return Promise.reject(error); }
    if(cache.isPrepared()) return Promise.resolve(LAYOUT_EQUIPMENT_PREVIEW);
    let job = active;
    if(!job) {
      job = {controller:new AbortController(),consumers:new Set(),last:null,done:false};
      active = job;
      // Install the first subscriber before a downloader can emit progress.
      void Promise.resolve().then(async()=>{
        try {
          job.controller.signal.throwIfAborted();
          const input = await download(LAYOUT_EQUIPMENT_PREVIEW_MODEL,
            {signal:job.controller.signal,onProgress:event=>relay(job,event)});
          job.controller.signal.throwIfAborted();
          relay(job,{phase:'verify',loaded:0,total:22,percent:90});
          job.controller.signal.throwIfAborted();
          await cache.install(input,{signal:job.controller.signal});
          job.controller.signal.throwIfAborted();
          relay(job,{phase:'ready',loaded:22,total:22,percent:100});
          finish(job,null);
        } catch(error) { finish(job,error); }
      });
    }
    return new Promise((resolve,reject)=>{
      const consumer = {signal,onProgress,resolve,reject};
      consumer.abort = ()=>leave(job,consumer,signal.reason ?? new DOMException('Preview preparation aborted','AbortError'));
      job.consumers.add(consumer);
      signal?.addEventListener('abort',consumer.abort,{once:true});
      if(signal?.aborted) consumer.abort();
      else if(job.last) progress(job,consumer,job.last);
    });
  }

  function detach(job,consumer) {
    job.consumers.delete(consumer);
    consumer.signal?.removeEventListener('abort',consumer.abort);
  }
  function leave(job,consumer,error) {
    if(!job.consumers.has(consumer)) return;
    detach(job,consumer);consumer.reject(error);
    if(!job.done && job.consumers.size === 0) {
      if(active === job) active = null;
      job.controller.abort(new DOMException('No preview consumers remain','AbortError'));
    }
  }
  function progress(job,consumer,event) {
    if(!job.consumers.has(consumer)) return;
    try { consumer.onProgress?.(event); }
    catch(error) { leave(job,consumer,error); }
  }
  function relay(job,event) {
    if(job.done || job.controller.signal.aborted) return;
    job.last = Object.freeze({...event});
    for(const consumer of [...job.consumers]) progress(job,consumer,job.last);
  }
  function finish(job,error) {
    job.done = true;
    if(active === job) active = null;
    for(const consumer of [...job.consumers]) {
      detach(job,consumer);
      if(error) consumer.reject(error);
      else consumer.resolve(LAYOUT_EQUIPMENT_PREVIEW);
    }
  }
  return prepare;
}

/** Downloader injection is for fixtures; pins/schema/datum cannot be overridden. */
export function createLayoutEquipmentPreviewPreparer({download=downloadEquipmentPreviewGeometry}={}) {
  if(typeof download !== 'function') throw new TypeError('download must be a function');
  const cache = createLayoutEquipmentPreviewCache();
  return Object.freeze({prepareLayoutEquipmentPreview:preparer(download,cache),
    getGeometry:cache.getGeometry,isPrepared:cache.isPrepared});
}

// All production consumers share one validated immutable cache. Each invocation
// owns its abort/progress subscription; only the last departure cancels the job.
export const prepareLayoutEquipmentPreview = preparer(downloadEquipmentPreviewGeometry,{
  getGeometry:getLayoutEquipmentPreviewGeometry,isPrepared:isLayoutEquipmentPreviewPrepared,
  install:installLayoutEquipmentPreviewGeometry
});

// Examine only Layout DTO fields, never walk geometry arrays or catalog data.
export function needsEquipmentPreview(value) {
  const pending=[value],seen=new Set();
  for(let i=0;i<pending.length;i++){
    const item=pending[i];if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);
    if(item.kind==='popstation_mini'||item.type==='popstation_mini'
      ||item.machineId==='snapmaker_u1_layout_reference')return true;
    if(item.template)pending.push(item.template);
    for(const key of ['printers','furniture'])if(Array.isArray(item[key]))pending.push(...item[key]);
  }
  return false;
}
