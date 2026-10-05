import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=de0df76326354fc0fecd';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f011d3e3cc1700bc517e';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=b7d3e2d147497c9219e8')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
