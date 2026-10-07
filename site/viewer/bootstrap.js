import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=0b03f369fa4dd3b3de8f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ae4fc0eefece98689d93';
import {siboorMachine} from './siboor-catalog.mjs?v=199fd35f8a3cd15fa1d0';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=37da3fc6bb84a9b46ba9')).mount(scope);
 else await showMissingAssets();
}
