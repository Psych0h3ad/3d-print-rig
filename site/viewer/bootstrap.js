import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=215e7383cab0c0fc3b4b';
import {siboorMachine} from './siboor-catalog.mjs?v=dafca8864d4061d9dc21';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=5760b19854f59bedd2e8')).mount(scope);
 else await showMissingAssets();
}
