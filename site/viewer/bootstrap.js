import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=a29d003d13bf7826c13a';
import {siboorMachine} from './siboor-catalog.mjs?v=617a4f783c56c113083e';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=021362a46a528d92b9f8')).mount(scope);
 else await showMissingAssets();
}
