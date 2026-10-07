import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=9a3eae7a7c53d576c80d';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=d408a79e2ac889fc7d39';
import {siboorMachine} from './siboor-catalog.mjs?v=7b34e992df71aa498743';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=2de6076b2211e1c2fb2e')).mount(scope);
 else await showMissingAssets();
}
