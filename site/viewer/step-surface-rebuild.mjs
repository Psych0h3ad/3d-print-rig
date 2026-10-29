// Offline reproduction helper shipped with the selected surface package.
// Run: node --max-old-space-size=384 step-surface-rebuild.mjs
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {writeSurfaceStep} from './step-surface-writer.mjs';
import {removeExactZeroArea} from './step-surface-zero-area.mjs';
const valid=n=>typeof n==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(n);
const file=n=>{if(!valid(n))throw Error('Invalid package path');return new URL(n,import.meta.url)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;if(!little)throw Error('This source package requires a little-endian runtime');
const ledger=JSON.parse(await fs.readFile(file('checksums.json'),'utf8'));
if(ledger.schema!=='surface-step-file-ledger-v1'||!Array.isArray(ledger.files)||ledger.files.length>255)throw Error('Invalid file ledger');
const names=new Set();
for(const r of ledger.files){if(!valid(r.name)||names.has(r.name)||!Number.isSafeInteger(r.bytes)||r.bytes<0||!/^[a-f0-9]{64}$/u.test(r.sha256))throw Error('Invalid file ledger row');names.add(r.name)}
const required=new Set(['Selected_Surface_Reference.step','COPYING.txt','configuration-and-sources.json','README.txt','step-surface-writer.mjs','step-surface-zero-area.mjs','step-surface-rebuild.mjs','CODE_LICENSE.txt']);
for(const n of required)if(!names.has(n))throw Error('Missing required ledger entry: '+n);
for(const r of ledger.files){const b=await fs.readFile(file(r.name));if(b.length!==r.bytes||sha(b)!==r.sha256)throw Error('Changed package input: '+r.name)}
const recipe=JSON.parse(await fs.readFile(file('configuration-and-sources.json'),'utf8'));
if(recipe.schema!=='3d-print-rig-surface-step-package-v1'||recipe.representation!=='faceted-open-shell-reference')throw Error('Unsupported package');
if(!Array.isArray(recipe.geometry)||!recipe.geometry.length||recipe.geometry.length>4096)throw Error('Invalid source inventory');
for(const row of recipe.geometry){if(!valid(row.positions)||!valid(row.indices))throw Error('Invalid mesh source path');required.add(row.positions);required.add(row.indices)}
if(names.size!==required.size||[...required].some(n=>!names.has(n)))throw Error('Incomplete mesh/source ledger');
const parts=[];
for(const row of recipe.geometry){
 const p=await fs.readFile(file(row.positions)),i=await fs.readFile(file(row.indices));
 if(sha(p)!==row.positionsSha256||sha(i)!==row.indicesSha256)throw Error('Changed mesh source');
 const positions=new Float32Array(p.buffer.slice(p.byteOffset,p.byteOffset+p.length)),Index={2:Uint16Array,4:Uint32Array}[row.indexComponentBytes];if(!Index)throw Error('Invalid index component');
 const index=new Index(i.buffer.slice(i.byteOffset,i.byteOffset+i.length)),clean=await removeExactZeroArea(positions,index);
 if(JSON.stringify(clean.removed)!==JSON.stringify(row.excludedExactZeroAreaTriangleOrdinals))throw Error('Changed zero-area exclusions');
 parts.push({id:row.id,name:row.name,positions,index:clean.index,matrixCAD:row.matrixCAD,rgb:row.rgb,opacity:row.opacity});
}
const output=await writeSurfaceStep(parts);if(output.triangles!==recipe.triangles)throw Error('Triangle count changed');
await fs.writeFile(file('Rebuilt_Surface_Reference.step'),Buffer.from(await output.blob.arrayBuffer()));
console.log(JSON.stringify({parts:output.parts,triangles:output.triangles,bytes:output.blob.size,scope:'Reproduced faceted surface geometry; the STEP creation timestamp can differ. No native BRep or physical-fit qualification.'}));
