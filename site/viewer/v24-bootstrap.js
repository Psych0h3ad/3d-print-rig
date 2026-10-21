import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=215e7383cab0c0fc3b4b';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=75d8d2eb3c01a7ac1436')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
