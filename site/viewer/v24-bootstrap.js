import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=43bbf9d5e578ae5c1a5e';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ebd46c76bc665d9c0e64';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=e849a4f676ee95d2cc8b')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
