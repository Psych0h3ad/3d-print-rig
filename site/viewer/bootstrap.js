import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=7d90ace65109ee54e1d2';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=e57f045aaa40254558f2';
import {siboorMachine} from './siboor-catalog.mjs?v=6549106f568b1a33d001';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=bf3f772bf9a364328671')).mount(scope);
 else await showMissingAssets();
}
