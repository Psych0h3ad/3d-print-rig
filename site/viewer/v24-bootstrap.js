import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=33f38142e82e9d8afd4d';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=4a3997efa19bbb191629')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
