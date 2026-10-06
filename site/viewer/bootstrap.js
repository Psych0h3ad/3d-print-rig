import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=98f22b8a6b185e5aa7e3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f1902887d6875ccc4a06';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=40887e7beaf4eb52d043')).mount(scope);
 else await showMissingAssets();
}
