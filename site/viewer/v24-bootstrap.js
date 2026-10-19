import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=aa70cdd0ecdd3beb1a9e';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=b7159707e24ae8fa79a5')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
