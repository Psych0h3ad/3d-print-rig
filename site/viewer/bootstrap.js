import {setupMachineNavigation} from './machines.js?v=machines-v1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=bundle-v2';
if(new URLSearchParams(location.search).get('machine')==='siboor_v24_350'){
 const next=new URL('./v24.html',location.href);next.searchParams.set('machine','siboor_v24_350');location.replace(next);
}else{
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await import('./app.js?v=mounts-v4');
 else await showMissingAssets();
}
