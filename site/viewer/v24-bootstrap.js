import {setupMachineNavigation} from './machines.js?v=crossant-36';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=trident-clearance-35';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=sc-seats-39');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
