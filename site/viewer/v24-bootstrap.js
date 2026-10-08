import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=d232bd52901060a5074b';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=937d34c4db95a3d96885')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
