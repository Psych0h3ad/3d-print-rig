import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=f884e9be087c61766aae';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=7102f2cc91e85ecbaeaa';
import {siboorMachine} from './siboor-catalog.mjs?v=252eb7ccffec6e2c5bd6';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=d164eaaa5f512e488647')).mount(scope);
 else await showMissingAssets();
}
