import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ec75087acca3b5355dfc';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=a4t-carriage-57')).mount(scope);
 else await showMissingAssets();
}
