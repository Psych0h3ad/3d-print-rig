import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupMachineNavigation} from './machines.js?v=0b03f369fa4dd3b3de8f';
import {machineAssetsAvailable,showMissingAssets} from './asset-availability.js?v=ada4e2d0117a9b584df7';
import {siboorMachine} from './siboor-catalog.mjs?v=632c197a61a4fe66320b';
export async function mount(scope){
 const {id:machine,size}=siboorMachine();
 document.querySelector('h1').textContent='Trident / '+size;
 setupMachineNavigation(machine);
 if(await machineAssetsAvailable(machine))await (await import('./app.js?v=d8331b2960ecf591c27c')).mount(scope);
 else await showMissingAssets();
}
