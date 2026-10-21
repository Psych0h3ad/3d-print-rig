import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=5503ac507978b3d4e928';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=c4d4fd575516b3ecf8b3';
import {siboorMachine} from './siboor-catalog.mjs?v=7a35813f99ed20c58034';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=10f6bf87da5120bc0e5d')).mount(scope);
 else await showMissingAssets();
}
