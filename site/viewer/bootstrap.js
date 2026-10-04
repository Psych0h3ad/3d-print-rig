import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ec75087acca3b5355dfc';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=9c0974a982dfa1ded7e6')).mount(scope);
 else await showMissingAssets();
}
