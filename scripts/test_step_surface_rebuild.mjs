import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {planSurfaceSelection} from '../site/viewer/step-surface-selection.mjs';
import {writeSurfaceStep} from '../site/viewer/step-surface-writer.mjs';
import {packageSurfaceStep} from '../site/viewer/step-surface-package.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),positions=new Float32Array([0,0,0,.01,0,0,0,.01,0]),index=new Uint32Array([0,1,2]);
const license='Synthetic source-terms fixture',names=['step-surface-writer.mjs','step-surface-zero-area.mjs','step-surface-rebuild.mjs'];
const codeFiles=names.map(name=>({name,blob:new Blob([fs.readFileSync(new URL('../site/viewer/'+name,import.meta.url))])}));codeFiles.push({name:'CODE_LICENSE.txt',blob:new Blob(['Synthetic code-terms fixture'])});
const policy={schema:'3d-print-rig-surface-step-sources-v1',representation:'faceted-open-shell-reference',source:{license:'FIXTURE',sourceURL:'https://example.invalid/source'},license:{sha256:sha(license)},parts:[{asset:'test',key:'test_1',geometry:{position:{count:3,sha256:sha(positions)},index:{count:3,componentType:5125,sha256:sha(index)}},sourceSelector:{id:'fixture'}}],generator:await Promise.all(codeFiles.map(async f=>({name:f.name,sha256:sha(Buffer.from(await f.blob.arrayBuffer()))})))};
const plan=await planSurfaceSelection([{id:'test_1',asset:'test',key:'test_1',name:'Offline triangle',positions,index,positionItemSize:3,fullDrawRange:true,materialCount:1,matrixCAD:[1000,0,0,0,0,1000,0,0,0,0,1000,0,1,2,3,1],rgb:[.2,.5,.8],opacity:.65}],policy);
const output=await writeSurfaceStep(plan.included),pkg=await packageSurfaceStep(plan,output,{configuration:'offline-fixture',policy,license,codeFiles}),bytes=Buffer.from(await pkg.blob.arrayBuffer()),root=fs.mkdtempSync(path.join(os.tmpdir(),'rig-step-test-'));
assert(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('rig-step-test-'));
try{
 let at=0;while(bytes.readUInt32LE(at)===0x04034b50){assert.equal(bytes.readUInt16LE(at+8),0);const size=bytes.readUInt32LE(at+18),nl=bytes.readUInt16LE(at+26),ex=bytes.readUInt16LE(at+28),name=bytes.subarray(at+30,at+30+nl).toString('utf8');assert(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(name));const start=at+30+nl+ex;fs.writeFileSync(path.join(root,name),bytes.subarray(start,start+size));at=start+size}
 const ledgerFile=path.join(root,'checksums.json'),original=fs.readFileSync(ledgerFile,'utf8'),ledger=JSON.parse(original),run=()=>spawnSync(process.execPath,['--max-old-space-size=64',path.join(root,'step-surface-rebuild.mjs')],{encoding:'utf8',timeout:20000,windowsHide:true});
 const accepted=run();assert.equal(accepted.status,0,accepted.stderr);assert(fs.readFileSync(path.join(root,'Rebuilt_Surface_Reference.step'),'utf8').includes('FACE_SURFACE'));
 const reject=rows=>{fs.writeFileSync(ledgerFile,JSON.stringify({...ledger,files:rows}));const result=run();assert.notEqual(result.status,0);return result.stderr};
 assert.match(reject(ledger.files.filter(r=>r.name!=='configuration-and-sources.json')),/Missing required ledger entry/);
 assert.match(reject(ledger.files.filter(r=>r.name!=='part-001-positions.bin')),/Incomplete mesh\/source ledger/);
 assert.match(reject([...ledger.files,ledger.files[0]]),/Invalid file ledger row/);
 fs.writeFileSync(path.join(root,'unexpected.txt'),'unregistered');assert.match(reject([...ledger.files,{name:'unexpected.txt',bytes:12,sha256:sha('unregistered')}]),/Incomplete mesh\/source ledger/);
 fs.writeFileSync(ledgerFile,original);fs.appendFileSync(path.join(root,'README.txt'),'changed');assert.match(run().stderr,/Changed package input/);
 console.log('Actual offline runner: generated package rebuild, missing recipe/buffer ledger, duplicate rows, undeclared extra file and changed input rejection passed.');
}finally{fs.rmSync(root,{recursive:true,force:true})}
