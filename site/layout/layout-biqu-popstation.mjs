// Metadata on import. Explicit preparation authenticates one shared, immutable
// mesh; no Three, CAD, fetch, decoding or geometry allocation runs on import.
import {downloadEquipmentPreviewGeometry,BIQU_POPSTATION_MODEL_IDENTITY,
  BIQU_POPSTATION_PREVIEW_IDENTITY} from './layout-equipment-transfer.mjs?v=b1d4cb920a44e4e6f8dd';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }return value;
};
export const BIQU_POPSTATION_SOURCE=freeze({manufacturer:'BIQU',bytes:3212068,
  sha256:'6e9f00b74593df45f2ddeb2908392fad378df3dfc4e626392414031e384c921d',
  headerTimestamp:'2026-10-27T12:21:51+08:00',manufacturerRevision:null,
  permission:'Web mesh distributed with permission from BIQU. Original CAD is not distributed.',
  sourceInstances:70,sourceDefinitions:30,sourceFaces:1475,
  sourcePartsRemoved:0,supportsRemoved:[],generatedZeroAreaTrianglesOmitted:10});
export const BIQU_POPSTATION_SOURCE_SHA256=BIQU_POPSTATION_SOURCE.sha256;
export const BIQU_POPSTATION_MODEL=freeze({...BIQU_POPSTATION_MODEL_IDENTITY,unit:'m',up:'+Y',front:'+Z'});
export const BIQU_POPSTATION_PREVIEW=freeze({...BIQU_POPSTATION_PREVIEW_IDENTITY,
  schema:'biqu-popstation-preview-v1',geometryId:'biqu-popstation-cd531f04bf1d-merged-v1',vertices:79824,triangles:82048,
  boundsM:{min:[-0.21154989302158356,2.503955931487667e-9,-0.23914146423339844],
    max:[0.21155011653900146,0.4174002408981323,0.23914149403572083]},
  arrays:{
    positionsM:{bytes:957888,sha256:'c995a62cf8e79745c1114313b1dc28abd01415d2d03784968fd28e1070ef8d66'},
    normals:{bytes:957888,sha256:'9914dec9221789934d4f0e2ab2b238b3e69a92e8cb06682a0bef9ddea71f910b'},
    indices:{bytes:984576,sha256:'436b549dbd7af9f115b5ac904df926990d952c7d83401abb47057e8e40ca8306'}},
  sourceLeaves:{bytes:14288,sha256:'c0912c131610ca812ba94ecbb7104ee3e76cbe9b5f1e40ea31903a45817194ae'}});

const integrity=message=>Object.assign(new Error('BIQU preview: '+message),{code:'LAYOUT_BIQU_PREVIEW_INTEGRITY'});
const abort=signal=>signal?.throwIfAborted();
function exactRecord(value,keys,label){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw integrity('Invalid '+label+' record');
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(k=>!keys.includes(k)))throw integrity('Unexpected '+label+' fields');
  for(const key of keys){
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw integrity('Invalid '+label+' data field');
  }
}
function copyArray(value,length,label,{integer=false,limit=Infinity}={}){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==length||
    Reflect.ownKeys(value).length!==length+1)throw integrity('Invalid '+label+' array dimensions');
  const out=new Array(length);
  for(let i=0;i<length;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i)),n=d?.value;
    if(!d||!Object.hasOwn(d,'value')||!d.enumerable||typeof n!=='number'||!Number.isFinite(n)||
      (integer?(!Number.isSafeInteger(n)||n<0||n>=limit):Math.fround(n)!==n))
      throw integrity('Invalid '+label+' value or index');
    out[i]=n;
  }return Object.freeze(out);
}
async function verifyBytes(bytes,receipt,signal){
  abort(signal);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  abort(signal);
  if(bytes.length!==receipt.bytes||Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('')!==receipt.sha256)
    throw integrity('Data differs from immutable receipt');
}
async function verifyArray(values,receipt,integer,signal){
  const bytes=new Uint8Array(values.length*4),view=new DataView(bytes.buffer);
  for(let i=0;i<values.length;i++)integer?view.setUint32(i*4,values[i],true):view.setFloat32(i*4,values[i],true);
  await verifyBytes(bytes,receipt,signal);
}

/** Takes an owned snapshot before awaiting hashes. No caller-owned array enters
 * the renderer cache. Exported for actual-asset audits and isolated controls. */
export async function validateBiquPreview(input,{signal}={}){
  abort(signal);
  exactRecord(input,['schema','units','up','front','rootPivotM','sourceSha256','fullModelSha256',
    'boundsM','sourceLeaves','positionsM','normals','indices'],'document');
  for(const [key,value]of Object.entries({schema:BIQU_POPSTATION_PREVIEW.schema,units:'m',up:'+Y',front:'+Z',
    sourceSha256:BIQU_POPSTATION_SOURCE_SHA256,fullModelSha256:BIQU_POPSTATION_MODEL.sha256}))
    if(input[key]!==value)throw integrity('Invalid '+key);
  if(copyArray(input.rootPivotM,3,'pivot').some(v=>v!==0))throw integrity('Invalid common datum');
  exactRecord(input.boundsM,['min','max'],'bounds');
  for(const key of ['min','max']){
    const bound=copyArray(input.boundsM[key],3,'bounds');
    if(bound.some((v,i)=>v!==BIQU_POPSTATION_PREVIEW.boundsM[key][i]))throw integrity('Bounds differ from source');
  }
  const {vertices,triangles}=BIQU_POPSTATION_PREVIEW;
  const positionsM=copyArray(input.positionsM,vertices*3,'positions');
  const normals=copyArray(input.normals,vertices*3,'normals');
  const indices=copyArray(input.indices,triangles*3,'indices',{integer:true,limit:vertices});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positionsM.length;i+=3){
    if(Math.abs(Math.hypot(normals[i],normals[i+1],normals[i+2])-1)>1e-5)throw integrity('Non-unit normal');
    for(let a=0;a<3;a++){min[a]=Math.min(min[a],positionsM[i+a]);max[a]=Math.max(max[a],positionsM[i+a]);}
  }
  for(let a=0;a<3;a++)if(min[a]!==BIQU_POPSTATION_PREVIEW.boundsM.min[a]||max[a]!==BIQU_POPSTATION_PREVIEW.boundsM.max[a])
    throw integrity('Geometry bounds differ from source');
  if(!Array.isArray(input.sourceLeaves)||input.sourceLeaves.length!==70||Reflect.ownKeys(input.sourceLeaves).length!==71)
    throw integrity('Missing source leaves');
  const sourceLeaves=[];let vertexOffset=0,indexOffset=0;
  const keys=['nodeIndex','meshIndex','sourceInstanceIndex','sourceInstanceLabel','sourceDefinitionLabel',
    'vertexOffset','vertexCount','indexOffset','indexCount'];
  for(let i=0;i<70;i++){
    const d=Object.getOwnPropertyDescriptor(input.sourceLeaves,String(i));
    if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw integrity('Invalid source leaf field');
    const leaf=d.value;exactRecord(leaf,keys,'source leaf');
    const copy=Object.fromEntries(keys.map(key=>[key,leaf[key]]));
    if(copy.nodeIndex!==i+1||copy.sourceInstanceIndex!==i||!Number.isSafeInteger(copy.meshIndex)||copy.meshIndex<0||copy.meshIndex>=30||
      copy.vertexOffset!==vertexOffset||copy.indexOffset!==indexOffset||
      !Number.isSafeInteger(copy.vertexCount)||copy.vertexCount<=0||copy.vertexCount>vertices-vertexOffset||
      !Number.isSafeInteger(copy.indexCount)||copy.indexCount<=0||copy.indexCount%3||copy.indexCount>indices.length-indexOffset||
      ![copy.sourceInstanceLabel,copy.sourceDefinitionLabel].every(v=>typeof v==='string'&&/^0(:[0-9]+){3,6}$/.test(v)))
      throw integrity('Invalid source correspondence');
    for(let k=indexOffset;k<indexOffset+copy.indexCount;k++)
      if(indices[k]<vertexOffset||indices[k]>=vertexOffset+copy.vertexCount)throw integrity('Cross-leaf preview index');
    vertexOffset+=copy.vertexCount;indexOffset+=copy.indexCount;sourceLeaves.push(Object.freeze(copy));
  }
  if(vertexOffset!==vertices||indexOffset!==indices.length)throw integrity('Incomplete source correspondence');
  Object.freeze(sourceLeaves);
  // All snapshots are owned and frozen by this point, including correspondence.
  for(const [key,values]of Object.entries({positionsM,normals,indices}))
    await verifyArray(values,BIQU_POPSTATION_PREVIEW.arrays[key],key==='indices',signal);
  await verifyBytes(new TextEncoder().encode(JSON.stringify(sourceLeaves)),BIQU_POPSTATION_PREVIEW.sourceLeaves,signal);
  const centerM=Object.freeze(min.map((v,i)=>(v+max[i])/2)),sizeM=Object.freeze(min.map((v,i)=>max[i]-v));
  return Object.freeze({shape:'mesh',name:'BIQU PopStation mini / all 70 source leaves',
    geometryId:BIQU_POPSTATION_PREVIEW.geometryId,positionsM,normals,indices,centerM,sizeM,
    color:'#adadad',doubleSided:true,groupId:'biqu-popstation-cabinet',groupKind:'cabinet',sourceLeaves,
    sourceMaterial:'unassigned neutral display gray; physical finish unverified'});
}

/** Isolated cache for tests/audits. Shared callers coalesce one download, each
 * with its own cancellation. The last canceled caller stops underlying work. */
export function createBiquPreviewCache({download=downloadEquipmentPreviewGeometry}={}){
  let parts=Object.freeze([]),active=null;
  function prepare({signal,onProgress=()=>{}}={}){
    return new Promise((resolve,reject)=>{
      try{
        if(signal!==undefined&&(!signal||typeof signal.throwIfAborted!=='function'||typeof signal.addEventListener!=='function'))
          throw new TypeError('Invalid BIQU preparation signal');
        if(typeof onProgress!=='function')throw new TypeError('Invalid BIQU progress callback');
        abort(signal);
        if(parts.length){onProgress({phase:'ready',percent:100});resolve(parts);return;}
        if(!active){
          const job={controller:new AbortController(),clients:new Set()};active=job;
          const progress=event=>{for(const client of [...job.clients])client.progress(event)};
          job.promise=Promise.resolve().then(async()=>{
            const input=await download(BIQU_POPSTATION_PREVIEW_IDENTITY,{signal:job.controller.signal,onProgress:progress});
            abort(job.controller.signal);progress({phase:'validate',percent:90});
            const part=await validateBiquPreview(input,{signal:job.controller.signal});
            abort(job.controller.signal);
            parts=parts.length?parts:Object.freeze([part]);return parts;
          });
          job.promise.then(result=>{
            if(active===job)active=null;
            for(const client of [...job.clients])client.done(null,result);
          },error=>{
            if(active===job)active=null;
            for(const client of [...job.clients])client.done(error);
          });
        }
        const job=active;
        const cleanup=()=>{
          signal?.removeEventListener('abort',cancel);job.clients.delete(client);
          if(!job.clients.size&&active===job){active=null;job.controller.abort();}
        };
        const client={
          progress(event){try{onProgress(event)}catch(error){cleanup();reject(error)}},
          done(error,result){cleanup();if(error)reject(error);else{
            try{abort(signal);onProgress({phase:'ready',percent:100});resolve(result)}catch(error){reject(error)}
          }}};
        const cancel=()=>{cleanup();reject(signal.reason)};
        job.clients.add(client);signal?.addEventListener('abort',cancel,{once:true});
        if(signal?.aborted)cancel();
      }catch(error){reject(error)}
    });
  }
  return Object.freeze({prepare,isPrepared:()=>parts.length===1,getParts:()=>parts});
}

const previewCache=createBiquPreviewCache();
export const prepareBiquPreview=options=>previewCache.prepare(options);
export const isBiquPreviewPrepared=()=>previewCache.isPrepared();
const proxy=Object.freeze({kind:'manufacturer-cad-source-triangles',wireframe:false,appendGenericPrinterCues:false,
  get parts(){return previewCache.getParts()}});
export const BIQU_POPSTATION_CAD=freeze({id:'biqu_popstation_mini_cad_v1',type:'popstation_mini_biqu_v1',
  label:'BIQU PopStation mini',manufacturer:'BIQU',equipmentVariant:'supplied',equipmentVariants:['supplied'],
  dimensionsMm:{width:423.10022712374223,depth:478.28293730922826,height:417.40023949665624},
  model:BIQU_POPSTATION_MODEL,preview:BIQU_POPSTATION_PREVIEW,source:BIQU_POPSTATION_SOURCE,
  manufacturerCAD:true,isLayoutEquipment:true,publicSourcesOnly:false,privateSourceDerived:true,purchasedSourceDerived:false,
  proxy,rootPivotM:[0,0,0],supportYM:0.4121002393966562,
  notes:'Empty closed source cabinet only. No loaded CAD. Modeled housing floor; finite cutout deck, mounting, installed feet, load and clearance unverified. Gray is a display default.',
  fullScene:{kind:'manufacturer-cad-reference',staticReference:true,
    normalizationFrame:{units:'m',up:'+Y',front:'+Z',rootPivotM:[0,0,0]},
    notes:'All 70 source leaves retained with original rigid matrices and neutral double-sided material.'}});

/** Only variant selection is accepted; caller provenance/descriptors never merge. */
export function getBiquPopStation(variant){
  if(variant!==undefined&&variant!=='supplied')throw Object.assign(new Error('Unknown BIQU PopStation variant'),{code:'LAYOUT_UNKNOWN_EQUIPMENT_VARIANT'});
  return BIQU_POPSTATION_CAD;
}

/** Layouts, placements, clipboard groups and nested group templates; cycles are
 * harmless. Inspect only data properties, never execute saved-state accessors. */
export function needsBiquPreview(value){
  const pending=[value],seen=new WeakSet();
  while(pending.length){
    const item=pending.pop();if(!item||typeof item!=='object'||seen.has(item))continue;
    seen.add(item);
    for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(item))){
      if(!Object.hasOwn(d,'value'))continue;
      if((key==='type'||key==='kind')&&d.value===BIQU_POPSTATION_CAD.type||key==='id'&&d.value===BIQU_POPSTATION_CAD.id)return true;
      if(d.value&&typeof d.value==='object')pending.push(d.value);
    }
  }return false;
}
