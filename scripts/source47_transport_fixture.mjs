import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function source47TransportFixture(){
 const text=process.env.RIG_SOURCE47_TRANSPORT_FIXTURE
  ?await fs.readFile(process.env.RIG_SOURCE47_TRANSPORT_FIXTURE,'utf8')
  :execFileSync(process.env.PYTHON||'python',['-B',fileURLToPath(new URL('./prepare_source47_fixture.py',import.meta.url))],{encoding:'utf8',maxBuffer:128*1024,timeout:12000,windowsHide:true});
 return JSON.parse(text);
}
