import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=098a2effa3fb8d19dd46';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=bc8cf7d7ab3262d61cde')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
