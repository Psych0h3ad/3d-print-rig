import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f275029eeb617d6b022c';
import {siboorMachine} from './siboor-catalog.mjs?v=bb4588aa4076069ab82b';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=6e44c288097fbb63a1c7')).mount(scope);
 else await showMissingAssets();
}
