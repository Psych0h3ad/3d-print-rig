import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=4e6d24bf287bad29f513';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=92dd969fbdd63fe2d0c6')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
