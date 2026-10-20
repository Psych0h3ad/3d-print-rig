import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=40aa5a9cbbbbb5e1d1a9';
import {siboorMachine} from './siboor-catalog.mjs?v=efb2bb0f84ce0efe76d8';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=7de8185835f0a9d1a673')).mount(scope);
 else await showMissingAssets();
}
