import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=ab543d6b01637bc5083f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=64a7c48070b52a45d3a9';
import {siboorMachine} from './siboor-catalog.mjs?v=04a8283332c2cfe631e3';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=5d7a5d04cb5a9bdf0e92')).mount(scope);
 else await showMissingAssets();
}
