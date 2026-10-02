import {setupMachineNavigation} from './machines.js?v=public-v17';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=public-v17';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=public-v17');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
