import {setupMachineNavigation} from './machines.js?v=machines-v1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=public-v5');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
