import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=dedc575bbef34e348ec3';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f011d3e3cc1700bc517e';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=12ee84160569b74deeb3')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
