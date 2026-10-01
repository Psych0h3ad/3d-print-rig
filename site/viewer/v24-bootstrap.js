import {setupMachineNavigation} from './machines.js?v=machines-v2';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=bundle-v2';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=clearance-v1');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
