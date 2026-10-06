import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=d6045b8af89b3984adcb';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=c4c95a77757d7292807d';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=708e6c1a593157dcf6b8')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
