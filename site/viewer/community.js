import {ensureWorkspaceEntry} from './workspace-entry.mjs';
import {isElegooMachine} from './elegoo-catalog.mjs';
ensureWorkspaceEntry(import.meta.url);

// Select the delegated renderer before importing ordinary community features.
export async function mount(scope) {
  const machine = new URLSearchParams(location.search).get('machine');
  if (isElegooMachine(machine)) return (await import('./elegoo.mjs?v=16d275e7c029054153f8')).mount(scope);
  return (await import('./community-renderer.mjs?v=5b5d7748e5574a2afc39')).mount(scope);
}
