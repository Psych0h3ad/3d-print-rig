import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=a29d003d13bf7826c13a';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=529362630e1937bcff06')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
