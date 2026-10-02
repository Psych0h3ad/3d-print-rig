import {setupMachineNavigation} from './machines.js?v=probe-travel-32';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=probe-travel-32';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=probe-travel-32');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
