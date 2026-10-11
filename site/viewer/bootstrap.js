import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=f884e9be087c61766aae';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=95b1810a68098ca230e4';
import {siboorMachine} from './siboor-catalog.mjs?v=cd566164c09e6beaa7e7';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=d65449207508cd9e16cd')).mount(scope);
 else await showMissingAssets();
}
