import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=5503ac507978b3d4e928';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=7c2d5c7284ef1e859610';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=03f004632149cc2aa49f')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
