// Match the repository's existing data-URL import approach. Source regressions
// run as plain `node test_*.mjs`, without a loader, VM flag or child worker.
import fs from 'node:fs/promises';
export async function loadV0StateModules(viewer=new URL('../site/viewer/',import.meta.url)){
 const source=await fs.readFile(new URL('v0-installations.mjs',viewer),'utf8');
 const installationCode=source.replace(/from 'three'/u,`from '${new URL('vendor/three.module.js',viewer).href}'`).replace(/from '\.\/v0_adapter\.mjs[^']*'/u,`from '${new URL('v0_adapter.mjs',viewer).href}'`).replace(/from '\.\/v0-tophat\.mjs[^']*'/u,`from '${new URL('v0-tophat.mjs',viewer).href}'`);
 const installationURL='data:text/javascript;base64,'+Buffer.from(installationCode).toString('base64');
 const installationsModule=await import(installationURL);
 const stateSource=await fs.readFile(new URL('v0-state.mjs',viewer),'utf8');
 const stateCode=stateSource.replace(/from '\.\/v0-installations\.mjs[^']*'/u,`from '${installationURL}'`);
 const stateModule=await import('data:text/javascript;base64,'+Buffer.from(stateCode).toString('base64'));
 return {installationsModule,stateModule};
}
export const {installationsModule,stateModule}=await loadV0StateModules();
export const {v0Slots,createV0Installations,v0TophatMaxAngle}=installationsModule;
export const {stockV0Mods,validateV0State,readV0ModsURL,v0ModsURL,v0ConfigurationSchema,v0ModsParameter,createV0StateRestorer}=stateModule;
