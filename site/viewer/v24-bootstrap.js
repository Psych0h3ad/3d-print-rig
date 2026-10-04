import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ec75087acca3b5355dfc';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=ebbe83d9a7fb35f3977b')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
