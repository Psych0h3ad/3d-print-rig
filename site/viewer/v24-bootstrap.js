import {setupMachineNavigation} from './machines.js?v=head-witness-33';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=head-witness-33';
if(await machineAssetsAvailable('siboor_v24_350')){
  await import('./v24-app.js?v=head-witness-33');
}else{
  setupMachineNavigation('siboor_v24_350');await showMissingAssets();
}
