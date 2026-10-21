import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=5503ac507978b3d4e928';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=c4d4fd575516b3ecf8b3';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=205628ab66fbebafc866')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
