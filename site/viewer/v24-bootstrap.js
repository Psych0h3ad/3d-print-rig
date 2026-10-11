import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=7d90ace65109ee54e1d2';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=896ba437d458a7518559';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=e66187e8cbb9fdc21a29')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
