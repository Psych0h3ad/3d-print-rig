import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=9383d20caf1cef38e5d4';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=8c6fae47e8e10bb0abbd')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
