import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=98f22b8a6b185e5aa7e3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=e8aa120ece0ca623982f';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=39bc8022521a99823cb7')).mount(scope);
 else await showMissingAssets();
}
