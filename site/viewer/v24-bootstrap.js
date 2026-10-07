import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=0b03f369fa4dd3b3de8f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ae4fc0eefece98689d93';
export async function mount(scope){
 if(await machineAssetsAvailable('siboor_v24_350'))await (await import('./v24-app.js?v=e7cdb536915ba90d3e83')).mount(scope);
 else{setupMachineNavigation('siboor_v24_350');await showMissingAssets()}
}
