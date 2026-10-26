import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=77f435f375b155c202d5';
import {siboorMachine} from './siboor-catalog.mjs?v=d982c54517da55735f16';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=b47a7f184c41042a2222')).mount(scope);
 else await showMissingAssets();
}
