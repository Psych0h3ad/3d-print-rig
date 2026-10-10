import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=fc646ce45d0df9ca7da4';
import {siboorMachine} from './siboor-catalog.mjs?v=92bc547e8389cf0c0805';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=95c00957357a72ad6793')).mount(scope);
 else await showMissingAssets();
}
