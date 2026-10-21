import {ensureWorkspaceEntry} from './workspace-entry.mjs';
import {isElegooMachine} from './elegoo-catalog.mjs';
ensureWorkspaceEntry(import.meta.url);

// Select the delegated renderer before importing ordinary community features.
export async function mount(scope) {
  const machine = new URLSearchParams(location.search).get('machine');
  if (isElegooMachine(machine)) return (await import('./elegoo.mjs?v=fe22d068cd2d5e0cd19e')).mount(scope);
  return (await import('./community-renderer.mjs?v=31a5bcbac200338ee3df')).mount(scope);
}
