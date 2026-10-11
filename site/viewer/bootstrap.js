import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=7d90ace65109ee54e1d2';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=b8ffeda598712dbeec22';
import {siboorMachine} from './siboor-catalog.mjs?v=09e0b77a1e3484059fa9';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=46071066e858b4c0e5c1')).mount(scope);
 else await showMissingAssets();
}
