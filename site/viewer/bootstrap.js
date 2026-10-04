import {setupMachineNavigation,machinePage} from './machines.js?v=controls-icons-1';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=controls-icons-1';
const requested=new URLSearchParams(location.search).get('machine');
if(requested&&requested!=='siboor_trident_350'&&machinePage(requested)){
 const next=new URL(machinePage(requested),location.href);next.search=location.search;location.replace(next);
}else{
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await import('./app.js?v=controls-icons-1');
 else await showMissingAssets();
}
