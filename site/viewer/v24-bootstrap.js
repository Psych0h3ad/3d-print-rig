import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=afead1e4d7e26afb597d';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=57df7c2f0dfe75f4f6d1')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
