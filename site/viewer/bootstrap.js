import {setupMachineNavigation} from './machines.js?v=workspace-belts-1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-1';
export async function mount(scope){
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await (await import('./app.js?v=workspace-belts-1')).mount(scope);
 else await showMissingAssets();
}
