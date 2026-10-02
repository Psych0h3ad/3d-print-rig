import {setupMachineNavigation} from './machines.js?v=public-v18-motion1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=public-v18-motion1';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=public-v18-motion1');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
