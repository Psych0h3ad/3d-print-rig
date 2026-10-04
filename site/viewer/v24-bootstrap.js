import {setupMachineNavigation} from './machines.js?v=workspace-belts-1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=workspace-belts-1';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=workspace-belts-1')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
