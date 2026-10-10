import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=cea8407065ba89be6304';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=22ded36aacf2a688d7ef';
import {siboorMachine} from './siboor-catalog.mjs?v=cdefc7b71a9b6e85fa9f';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=9801a83c5fdaa80e7814')).mount(scope);
 else await showMissingAssets();
}
