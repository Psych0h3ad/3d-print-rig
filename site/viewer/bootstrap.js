import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=4e6d24bf287bad29f513';
import {siboorMachine} from './siboor-catalog.mjs?v=e973b822bd4a124f239c';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=3da596d64400674b95ad')).mount(scope);
 else await showMissingAssets();
}
