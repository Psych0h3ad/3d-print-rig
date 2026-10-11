import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=f884e9be087c61766aae';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=f84f1610755a2c6bb07b';
import {siboorMachine} from './siboor-catalog.mjs?v=c6533aaec616911864d7';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=af33fa2c3e370c256ae3')).mount(scope);
 else await showMissingAssets();
}
