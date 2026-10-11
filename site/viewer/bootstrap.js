import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=7d90ace65109ee54e1d2';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=896ba437d458a7518559';
import {siboorMachine} from './siboor-catalog.mjs?v=703ef6a80a9551ecbb38';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=f39be3e25ab62052192b')).mount(scope);
 else await showMissingAssets();
}
