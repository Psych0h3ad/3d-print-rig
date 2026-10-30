import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=6ef2e108b555868f53c9';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=c634e8f37dd60b2c5a17')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
