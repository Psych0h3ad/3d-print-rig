import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=dedc575bbef34e348ec3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=c7a0fc5a50fc9fc3dc30')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
