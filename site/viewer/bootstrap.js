import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=dedc575bbef34e348ec3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-2';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=c6475f6471e7a7fabd90')).mount(scope);
 else await showMissingAssets();
}
