import {setupMachineNavigation} from './machines.js?v=crossant-36';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=standard-step-42';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=sphinx-report-45');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
