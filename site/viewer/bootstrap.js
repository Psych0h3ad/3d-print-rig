import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=8be9bd78c0872cd263f0';
import {siboorMachine} from './siboor-catalog.mjs?v=b5270f9e545abbef54b9';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=77bed0f8055e885f6d7f')).mount(scope);
 else await showMissingAssets();
}
