import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=98f22b8a6b185e5aa7e3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f1902887d6875ccc4a06';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=df405e72016990c8c579')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
