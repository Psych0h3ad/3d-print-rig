import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=aa70cdd0ecdd3beb1a9e';
import {siboorMachine} from './siboor-catalog.mjs?v=59436addbdfb83cd304a';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=0bf8aa697b60d4e447a5')).mount(scope);
 else await showMissingAssets();
}
