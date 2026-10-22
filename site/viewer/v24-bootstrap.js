import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=5503ac507978b3d4e928';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=01393451ff6fb7b16735';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=2e1a3ba2e0f5e3ed7540')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
