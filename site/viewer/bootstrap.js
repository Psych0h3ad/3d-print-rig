import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=8793f1a7c82bcf91f17a';
import {siboorMachine} from './siboor-catalog.mjs?v=b1ea124507703c10a6bd';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=ffc70d8dc0b310a6bcd3')).mount(scope);
 else await showMissingAssets();
}
