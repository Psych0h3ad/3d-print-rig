import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ada4e2d0117a9b584df7';
import {siboorMachine} from './siboor-catalog.mjs?v=ef8812f5039f8c1d8d36';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=71cd006101e4ad91230c')).mount(scope);
 else await showMissingAssets();
}
