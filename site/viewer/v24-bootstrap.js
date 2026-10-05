import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=bbb10b08e04530c1040e';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f011d3e3cc1700bc517e';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=71af900c4de7afb79c7f')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
