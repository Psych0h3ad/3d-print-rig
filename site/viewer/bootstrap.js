import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=24ecd91cd2dae366e90c';
import {siboorMachine} from './siboor-catalog.mjs?v=5b8156e6fed25fdf40eb';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=32c6dff55f0f2bfd68dc')).mount(scope);
 else await showMissingAssets();
}
