import {setupMachineNavigation} from './machines.js?v=rear-cooling-34';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=rear-cooling-34';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=rear-cooling-34');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
