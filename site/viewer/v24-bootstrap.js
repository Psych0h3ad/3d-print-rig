import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=9a3eae7a7c53d576c80d';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=d408a79e2ac889fc7d39';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=8339789163cfeda7ae2c')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
