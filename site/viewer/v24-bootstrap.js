import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ada4e2d0117a9b584df7';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=caecf291592a54c5be34')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
