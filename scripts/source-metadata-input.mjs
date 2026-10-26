// Node-only source checks: resolve exact external JSON into prepared local inputs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export function sourceMetadataPath(site,reference){
 if(!reference.startsWith('/'))return path.resolve(site,'viewer',reference);
 const catalog=JSON.parse(fs.readFileSync(path.join(site,'E3NG_SOURCE_INPUTS.json'),'utf8'));
 const row=catalog.files.find(r=>new URL(r.url).pathname===reference);
 if(!row||!/^source-assembly-assets\/[a-zA-Z0-9_.-]+\.json$/.test(row.path))throw Error('Unregistered external source metadata');
 return path.join(site,row.path);
}
export function sourceMetadataURL(viewerBase,reference){return pathToFileURL(sourceMetadataPath(fileURLToPath(new URL('../',viewerBase)),reference));}
