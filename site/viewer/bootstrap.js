import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=7190e93ccffc5f996682';
import {siboorMachine} from './siboor-catalog.mjs?v=d8ad4eebeb2a0c62cf9a';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=71dc75f32a00e08a71c1')).mount(scope);
 else await showMissingAssets();
}
