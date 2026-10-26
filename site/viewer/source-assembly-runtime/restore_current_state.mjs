import {migrateCompatibleState} from './state_compatibility.mjs?v=2a8e70edbb59dee3e230';
// Keep the loaded assembly as the transition authority. Recreating it at zero
// must not turn a blocked saved-state jump into an allowed endpoint.
export function restoreCurrentAssemblyState(adapter,saved){const migration=migrateCompatibleState(saved,adapter.packet);adapter.apply(migration.state);return migration;}
