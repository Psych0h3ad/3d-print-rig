import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPinnedModuleClosure} from './audit_module_closure.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'audit-closure-'));
const root=path.join(dir,'root.mjs'),child=path.join(dir,'child.mjs'),leaf=path.join(dir,'leaf.mjs');
const url=pathToFileURL(root),viewer=pathToFileURL(dir+path.sep);
const hash=b=>createHash('sha256').update(b).digest('hex');
function makePins(){
 const bodies=new Map();
 return {bodies,async pin(file){const bytes=await fs.readFile(file),value=hash(bytes);if(bodies.has(file))assert.equal(value,bodies.get(file),'Changed previously pinned body');else bodies.set(file,value);return bytes}};
}
try{
 await fs.writeFile(root,"import './child.mjs?v=one'; export const root=true;\n");
 await fs.writeFile(child,"import './leaf.mjs#one'; import './leaf.mjs?two'; import 'node:fs';\n");
 await fs.writeFile(leaf,"import './root.mjs'; export const leaf=true;\n");
 const pins=makePins();
 // Reproduce the Linux case: the very same native filename was hashed first.
 await pins.pin(root);
 const walk=createPinnedModuleClosure({pin:pins.pin,viewer});
 await walk(url);assert.deepEqual([...pins.bodies.keys()].sort(),[root,child,leaf].sort());
 await walk(new URL(url.href+'?repeat#hash'));assert.equal(pins.bodies.size,3);
 const dirty=makePins();await dirty.pin(root);await fs.appendFile(root,'// changed\n');
 await assert.rejects(createPinnedModuleClosure({pin:dirty.pin,viewer})(url),/Changed previously pinned body/);
 await fs.writeFile(root,"import './missing.mjs';\n");
 await assert.rejects(createPinnedModuleClosure({pin:makePins().pin,viewer})(url),{code:'ENOENT'});
 await fs.writeFile(root,"import 'unregistered-package';\n");
 await assert.rejects(createPinnedModuleClosure({pin:makePins().pin,viewer})(url),/Unregistered audit dependency/);
 await fs.mkdir(path.join(dir,'vendor'));await fs.writeFile(path.join(dir,'vendor/three.module.js'),'export const mock=true;\n');
 await fs.writeFile(root,"import 'three';\n");const registered=makePins();await createPinnedModuleClosure({pin:registered.pin,viewer})(url);
 assert.equal(registered.bodies.size,2);
 console.log('Pinned import closure: prehashed root, transitive/cyclic/query aliases, changed body, missing file, registered Three and unknown bare dependency passed.');
}finally{
 const cleanupDir=path.resolve(dir);
 assert.equal(path.dirname(cleanupDir),path.resolve(os.tmpdir()));
 assert(path.basename(cleanupDir).startsWith('audit-closure-'));
 await fs.rm(cleanupDir,{recursive:true,force:true});
}
