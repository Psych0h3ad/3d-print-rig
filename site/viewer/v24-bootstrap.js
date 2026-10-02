import {setupMachineNavigation} from './machines.js?v=combinations-1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=combinations-1';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=combinations-1');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
