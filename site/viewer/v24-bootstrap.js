import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=f884e9be087c61766aae';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=44330ede0c3900fb1bd9';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=7ad2854b11a6fb323f96')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
