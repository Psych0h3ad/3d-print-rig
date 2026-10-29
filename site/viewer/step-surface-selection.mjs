import {boundedSha256} from './bounded-sha256.mjs?v=61cd1fa2895a71447920';
import {removeExactZeroArea} from './step-surface-zero-area.mjs?v=1893343a3b0792904214';
const abort=signal=>{if(signal?.aborted)throw new DOMException('Export canceled','AbortError')};
const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
export function surfaceRule(policy,asset,key){
 if(policy?.schema!=='3d-print-rig-surface-step-sources-v1'||policy.representation!=='faceted-open-shell-reference')throw Error('Unsupported STEP source catalog');
 return policy.parts.find(p=>p.asset===asset&&(p.key===String(key)||p.key===asset+'_'+key));
}
export async function planSurfaceSelection(rows,policy,{signal}={}){
 if(!Array.isArray(rows)||rows.length>4096)throw Error('Invalid selected part list');
 // Capture identities, metadata and exact buffers before the first hash yields.
 policy=structuredClone(policy);
 let components=0,indices=0;
 rows=rows.map(row=>{
  if(!row||typeof row.id!=='string'||typeof row.asset!=='string')throw Error('Invalid selected part');
  const copy={id:row.id,asset:row.asset,key:String(row.key),name:String(row.name),sourceURL:row.sourceURL};
  if(!surfaceRule(policy,row.asset,row.key))return copy;
  const p=row.positions,i=row.index;
  if(!(p instanceof Float32Array)||!(i instanceof Uint16Array||i instanceof Uint32Array))return copy;
  components+=p.length;indices+=i.length;if(components>1000000||indices>450000)throw Error('Export size limit');
  return {...copy,positions:p.slice(),index:i.slice(),positionItemSize:row.positionItemSize,normalized:row.normalized,deformed:row.deformed,materialCount:row.materialCount,fullDrawRange:row.fullDrawRange,matrixCAD:row.matrixCAD?.slice(),rgb:row.rgb?.slice(),opacity:row.opacity};
 });
 const included=[],omitted=[],seen=new Set();
 for(const row of rows){
  abort(signal);
  if(typeof row.id!=='string'||seen.has(row.id))throw Error('Duplicate selected part');seen.add(row.id);
  const rule=surfaceRule(policy,row.asset,row.key);
  const omit=reason=>omitted.push({id:row.id,name:row.name,reason,sourceURL:rule?policy.source.sourceURL:null,referenceURL:safeURL(row.sourceURL),sourceStatus:rule?'author-source-matched':'component-origin-unresolved'});
  if(!rule){omit('source-not-admitted');continue}
  if(!row.positions||!row.index||row.positionItemSize!==3||row.normalized||row.deformed||row.materialCount!==1||!row.fullDrawRange){omit('unsupported-display-geometry');continue}
  const position=row.positions,index=row.index;
  if(!(position instanceof Float32Array)||!((index instanceof Uint32Array)||(index instanceof Uint16Array))||position.length!==rule.geometry.position.count*3||index.length!==rule.geometry.index.count||index.BYTES_PER_ELEMENT!==({5123:2,5125:4})[rule.geometry.index.componentType]){omit('source-geometry-changed');continue}
  const ph=await boundedSha256(position,{onProgress:()=>abort(signal)});abort(signal);const ih=await boundedSha256(index,{onProgress:()=>abort(signal)});abort(signal);
  if(ph!==rule.geometry.position.sha256||ih!==rule.geometry.index.sha256){omit('source-geometry-changed');continue}
  const cleaned=await removeExactZeroArea(position,index,{signal});abort(signal);
  if(!cleaned.index.length){omit('no-nonzero-surfaces');continue}
  included.push({...row,index:cleaned.index,sourceIndex:index,zeroAreaTriangles:cleaned.removed,sourceSelector:rule.sourceSelector,sourceURL:policy.source.sourceURL,positionSha256:ph,indexSha256:ih});
 }
 return {included,omitted,counts:{selected:rows.length,included:included.length,omitted:omitted.length},wholeSelectedAssembly:omitted.length===0&&included.length>0,representation:'faceted-open-shell-reference'};
}
// Remove the viewer's framing translation. Keep the selected component/changer
// poses; convert metres/Y-up to millimetres/Z-up without moving mesh vertices.
export function snapshotHeadSurfaces({cached,bench,THREE,policy,catalog,href}){
 bench.updateWorldMatrix(true,true);
 const inverse=bench.matrixWorld.clone().invert(),cad=new THREE.Matrix4().set(1000,0,0,0,0,0,-1000,0,0,1000,0,0,0,0,0,1),rows=[];
 for(const [asset,promise]of cached){
  const a=promise.loaded;if(!a?.root.visible)continue;
  const metadata=new Map(a.meta.parts.map(p=>[String(p.key),p]));
  for(const r of a.meshes){
   let visible=true,node=r.mesh;for(;node&&node!==bench;node=node.parent)if(!node.visible)visible=false;
   if(!visible||node!==bench)continue;
   const key=String(r.key),meta=metadata.get(key),rule=surfaceRule(policy,asset,key),mesh=r.mesh,g=mesh.geometry,position=g.getAttribute('position'),index=g.index;
   const spec=catalog?.base_assets?.[asset]||catalog?.assets?.[asset];
   const sourceURL=safeURL(a.meta.source_url||a.meta.source_repository||a.meta.component_source_url)||
    (policy.parts.some(p=>p.asset===asset)?policy.source.sourceURL:null)||
    (spec?.step&&href?safeURL(new URL('../'+spec.step,href).href):null);
   const row={id:rule?.key||asset+':'+key,asset,key,name:meta?.name||key,sourceURL};
   if(rule&&position&&index){
    const materials=[].concat(mesh.material),m=materials[0];
    row.positions=position.array.slice();row.index=index.array.slice();row.positionItemSize=position.itemSize;row.normalized=position.normalized;
    row.fullDrawRange=g.drawRange.start===0&&(g.drawRange.count===Infinity||g.drawRange.count===index.count);
    row.materialCount=materials.length;row.deformed=!!(mesh.isSkinnedMesh||mesh.isInstancedMesh||g.morphAttributes.position?.length);
    row.matrixCAD=cad.clone().multiply(inverse).multiply(mesh.matrixWorld).elements.slice();
    row.rgb=m.color.clone().convertLinearToSRGB().toArray();row.opacity=m.opacity;
   }
   rows.push(row);
  }
 }
 return rows;
}
