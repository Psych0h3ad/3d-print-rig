import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {nativeWitnessBundle} from './trident-deck-evidence.mjs';

const site=new URL('../site/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,site),'utf8'));
const bundle=await read('ASSET_BUNDLE.json');
for(const name of ['HEAD_VALIDATION.json','MOUNT_VALIDATION.json']){
 const evidence=await read(name);
 assert.equal(evidence.model_bundle_sha256,nativeWitnessBundle(site,bundle,name),
  name+': native evidence belongs to an older bundle. Revalidate the tested geometry before retaining it.');
}
console.log('Pinned original mounting witnesses retained; exact deck-only repair has separate source evidence.');
