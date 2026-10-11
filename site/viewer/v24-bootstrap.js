import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=f884e9be087c61766aae';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=95b1810a68098ca230e4';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=4cd04775f52e2f98d793')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
