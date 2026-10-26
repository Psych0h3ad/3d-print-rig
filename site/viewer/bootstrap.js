import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=43bbf9d5e578ae5c1a5e';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ebd46c76bc665d9c0e64';
import {siboorMachine} from './siboor-catalog.mjs?v=7b2168350a804d7d5f12';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=b5f1647973dd4bfaa426')).mount(scope);
 else await showMissingAssets();
}
