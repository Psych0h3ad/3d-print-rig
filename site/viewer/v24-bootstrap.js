import {setupMachineNavigation} from './machines.js?v=monolith-machine-1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=public-v24';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=monolith-machine-1');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
