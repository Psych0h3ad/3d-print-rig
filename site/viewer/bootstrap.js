import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=268c3c7f6767524ed489';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=d232bd52901060a5074b';
import {siboorMachine} from './siboor-catalog.mjs?v=c1640cd9214e2ffcc4c7';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=3b80a762a6b7e33dfa18')).mount(scope);
 else await showMissingAssets();
}
