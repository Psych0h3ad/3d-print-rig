// Execute the actual receipt construction and end-of-audit identity check.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import test from 'node:test';

const repo=fileURLToPath(new URL('../',import.meta.url)),helper='scripts/fetch_pinned_source.py';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

test('actual EVA receipt pins the Python helper and rejects a stale helper receipt',async()=>{
 const source=await fs.readFile(path.join(repo,'scripts/audit_eva_options.mjs'),'utf8');
 const construct=source.split('\n').find(line=>line.includes('for(const name of')&&line.includes('closure[name]')&&line.includes('scripts/check_eva_options_release.py'));
 const verify=source.split('\n').find(line=>line.includes('Object.entries(closure)')&&line.includes('Production code changed during actual audit'));
 assert(construct&&verify,'Actual EVA receipt construction/validation is missing');
 const build=new AsyncFunction('closure','sha','fs','path','repo',construct),check=new AsyncFunction('closure','sha','fs','path','repo','assert',verify);
 const closure={};await build(closure,sha,fs,path,repo);
 const bytes=await fs.readFile(path.join(repo,helper));assert.equal(closure[helper],sha(bytes));
 await check(closure,sha,fs,path,repo,assert);
 // Overlay just the helper's bytes. Candidate files are never modified.
 const changed=Buffer.concat([bytes,Buffer.from('\n# changed acquisition policy fixture\n')]);
 const overlay={readFile:async(file,...options)=>path.resolve(file)===path.resolve(repo,helper)?changed:fs.readFile(file,...options)};
 const next={};await build(next,sha,overlay,path,repo);
 assert.equal(next[helper],sha(changed));assert.notEqual(next[helper],closure[helper]);
 for(const key of Object.keys(closure).filter(key=>key!==helper))assert.equal(next[key],closure[key]);
 await assert.rejects(check(closure,sha,overlay,path,repo,assert),/Production code changed during actual audit scripts\/fetch_pinned_source.py/);
 await check(next,sha,overlay,path,repo,assert);
});
