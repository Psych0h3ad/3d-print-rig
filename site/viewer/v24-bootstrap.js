import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f275029eeb617d6b022c';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=ec80dfbae53156d9e2b7')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
