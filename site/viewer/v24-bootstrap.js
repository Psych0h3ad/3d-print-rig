import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=40aa5a9cbbbbb5e1d1a9';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=2fe7702a49890bf8cd75')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
