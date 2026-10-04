import {setupMachineNavigation,machinePage} from './machines.js?v=machine-scope-52';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=standard-step-42';
const requested=new URLSearchParams(location.search).get('machine');
if(requested&&requested!=='siboor_trident_350'&&machinePage(requested)){
 const next=new URL(machinePage(requested),location.href);next.search=location.search;location.replace(next);
}else{
 setupMachineNavigation('siboor_trident_350');
 if(await machineAssetsAvailable('siboor_trident_350'))await import('./app.js?v=sphinx-report-45');
 else await showMissingAssets();
}
