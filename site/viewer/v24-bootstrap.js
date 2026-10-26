import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=77f435f375b155c202d5';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=587e9fe69b572b5c4ff8')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
