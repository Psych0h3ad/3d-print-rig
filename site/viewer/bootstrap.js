import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=bbb10b08e04530c1040e';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f011d3e3cc1700bc517e';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=fad20d95d7d16eb2d3cd')).mount(scope);
 else await showMissingAssets();
}
