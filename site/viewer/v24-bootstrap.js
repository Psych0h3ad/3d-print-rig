import {setupMachineNavigation} from './machines.js?v=trident-clearance-35';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=trident-clearance-35';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=trident-clearance-35');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
