import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=def15e6e5867393ab8db';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=c3cb7dca52642deded6b';
import {siboorMachine} from './siboor-catalog.mjs?v=5f8e0fba8ac9680fd2ea';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=ea6e3131192ba1e927ae')).mount(scope);
 else await showMissingAssets();
}
