import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
export function communityAuditDirectory(spec,index,directory,indexPath){
 if(!spec.local_directory||spec.local_directory===index.local_directory)return path.resolve(directory);
 assert(!path.isAbsolute(spec.local_directory)&&!spec.local_directory.split(/[\\/]/).includes('..')&&!spec.local_directory.includes(':'),'Unsafe declared community asset root');
 const base=path.dirname(indexPath instanceof URL?fileURLToPath(indexPath):path.resolve(indexPath));
 const selected=path.resolve(base,spec.local_directory);assert(selected.startsWith(base+path.sep),'Asset root outside supplied site');return selected;
}
