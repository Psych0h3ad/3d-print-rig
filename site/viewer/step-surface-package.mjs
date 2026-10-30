// A Blob-backed ZIP avoids another complete copy of a large STEP string.
import {boundedSha256,boundedBlobSha256} from './bounded-sha256.mjs?v=61cd1fa2895a71447920';
const encoder=new TextEncoder(),table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
export async function surfaceZip(files,{signal,maxBytes=100*1024*1024}={}){
 const parts=[],directory=[],seen=new Set();let offset=0;
 const check=()=>{if(signal?.aborted)throw new DOMException('Export canceled','AbortError')};
 for(const {name,blob}of files){
  check();if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(name)||seen.has(name.toLowerCase())||!(blob instanceof Blob))throw Error('Invalid export file');seen.add(name.toLowerCase());
  if(offset+blob.size>maxBytes||blob.size>80*1024*1024)throw Error('Export size limit');
  let crc=0xffffffff;
  for(let at=0;at<blob.size;at+=262144){const b=new Uint8Array(await blob.slice(at,at+262144).arrayBuffer());for(const x of b)crc=table[(crc^x)&255]^(crc>>>8);check();await new Promise(r=>setTimeout(r,0))}
  crc=(crc^0xffffffff)>>>0;
  const nb=encoder.encode(name),h=new Uint8Array(30+nb.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,nb.length,true);h.set(nb,30);
  parts.push(h,blob);directory.push({nb,size:blob.size,crc,offset});offset+=h.length+blob.size;
 }
 if(!directory.length||directory.length>256)throw Error('Invalid export file count');
 const start=offset;
 for(const r of directory){const h=new Uint8Array(46+r.nb.length),v=new DataView(h.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,r.crc,true);v.setUint32(20,r.size,true);v.setUint32(24,r.size,true);v.setUint16(28,r.nb.length,true);v.setUint32(42,r.offset,true);h.set(r.nb,46);parts.push(h);offset+=h.length}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,offset-start,true);v.setUint32(16,start,true);parts.push(end);if(offset+22>maxBytes)throw Error('Export size limit');check();return new Blob(parts,{type:'application/zip'});
}
export async function packageSurfaceStep(plan,output,{configuration,policy,license,codeFiles=[],signal}){
 if(signal?.aborted)throw new DOMException('Export canceled','AbortError');
 if(!plan.included.length||output.parts!==plan.included.length||!license.trim())throw Error('Missing export content');
 const source=policy.source;
 if(await boundedSha256(encoder.encode(license))!==policy.license.sha256)throw Error('Source license changed');
 if(codeFiles.length!==policy.generator.length)throw Error('Missing generator source');
 for(const row of policy.generator){const file=codeFiles.find(f=>f.name===row.name);if(!file||await boundedSha256(new Uint8Array(await file.blob.arrayBuffer()))!==row.sha256)throw Error('Generator source changed')}
 const files=[{name:'Selected_Surface_Reference.step',blob:output.blob},{name:'COPYING.txt',blob:new Blob([license])},...codeFiles];
 const geometry=[];
 for(let i=0;i<plan.included.length;i++){
  const p=plan.included[i],stem='part-'+String(i+1).padStart(3,'0');
  files.push({name:stem+'-positions.bin',blob:new Blob([p.positions])},{name:stem+'-indices.bin',blob:new Blob([p.sourceIndex||p.index])});
  geometry.push({id:p.id,name:p.name,positions:stem+'-positions.bin',indices:stem+'-indices.bin',indexComponentBytes:p.index.BYTES_PER_ELEMENT,positionsSha256:p.positionSha256,indicesSha256:p.indexSha256,matrixCAD:p.matrixCAD,rgb:p.rgb,opacity:p.opacity,sourceSelector:p.sourceSelector,excludedExactZeroAreaTriangleOrdinals:p.zeroAreaTriangles||[]});
 }
 const manifest={schema:'3d-print-rig-surface-step-package-v1',configuration,representation:plan.representation,counts:plan.counts,wholeSelectedAssembly:plan.wholeSelectedAssembly,triangles:output.triangles,excludedExactZeroAreaTriangles:geometry.reduce((n,p)=>n+p.excludedExactZeroAreaTriangleOrdinals.length,0),coordinateSystem:'mm-Z-up',source,geometry,omitted:plan.omitted,sourceMeshEncoding:'Original Float32 positions and UInt16/UInt32 triangle indices, little-endian. matrixCAD transforms metre/Y-up mesh coordinates to mm/Z-up. Listed exactly-zero-area triangles are excluded using integer Float32 cross products; no epsilon, weld, mesh simplification or new analytic solids.',generator:'https://github.com/Psych0h3ad/3d-print-rig/blob/main/site/viewer/step-surface-writer.mjs',changes:'Selected source mesh parts, applied current component poses and colors, wrote planar triangle faces as open-shell surface models. No native BRep or watertight-solid claim.'};
 files.push({name:'configuration-and-sources.json',blob:new Blob([JSON.stringify(manifest,null,2)])});
 const lines=['3D Print Rig - selected surface STEP','',configuration,'','This STEP contains faceted surface models from the displayed source meshes. It is not native parametric CAD, a watertight solid, or a manufacturing/clearance certificate.',`Included ${plan.counts.included} of ${plan.counts.selected} selected display meshes. Omitted ${plan.counts.omitted}.`,'','Editable upstream CAD: '+source.sourceURL,'Revision: '+source.revision,'Authors: VoronDesign contributors','Geometry terms: '+source.license+' (COPYING.txt). Generator terms: CODE_LICENSE.txt.','The original selected mesh buffers, transforms, colors and source identities are included for editing/reproduction. Original author CAD remains available at the exact upstream URL above.','Offline reproduction (Node.js 22 or later): node --max-old-space-size=384 step-surface-rebuild.mjs','Keep all files together. The runner checks the file ledger and source buffers before regenerating Rebuilt_Surface_Reference.step. Only the STEP creation timestamp can differ.','','Omitted parts: component origins or STEP redistribution are not verified unless explicitly marked author-source-matched. Assembly references are lookup aids, not individual manufacturer CAD permission.',...plan.omitted.map(p=>`${p.id}: ${p.name} - ${p.reason} - ${p.sourceStatus}${p.sourceURL?' - author source: '+p.sourceURL:p.referenceURL?' - assembly reference only: '+p.referenceURL:''}`)];
 files.push({name:'README.txt',blob:new Blob([lines.join('\n')+'\n'])});
 const ledger=[];for(const f of files)ledger.push({name:f.name,bytes:f.blob.size,sha256:await boundedBlobSha256(f.blob,{signal})});
 files.push({name:'checksums.json',blob:new Blob([JSON.stringify({schema:'surface-step-file-ledger-v1',scope:'Every other archive entry; this ledger excludes itself.',files:ledger},null,2)])});
 return {blob:await surfaceZip(files,{signal}),manifest};
}
