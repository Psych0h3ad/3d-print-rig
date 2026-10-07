import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=0b03f369fa4dd3b3de8f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ada4e2d0117a9b584df7';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=86d57430a8c29b897dff')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
