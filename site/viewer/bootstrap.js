import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=d6045b8af89b3984adcb';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=c4c95a77757d7292807d';
import {siboorMachine} from './siboor-catalog.mjs?v=c59d93be54e1c7637a63';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=f8a877cf2263bfca60de')).mount(scope);
 else await showMissingAssets();
}
