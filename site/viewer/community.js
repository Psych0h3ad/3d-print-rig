import {ensureWorkspaceEntry} from './workspace-entry.mjs';
import {isElegooMachine} from './elegoo-catalog.mjs';
ensureWorkspaceEntry(import.meta.url);

// Select the delegated renderer before importing ordinary community features.
export async function mount(scope) {
  const machine = new URLSearchParams(location.search).get('machine');
  if (isElegooMachine(machine)) return (await import('./elegoo.mjs?v=665c78959605d5869efa')).mount(scope);
  return (await import('./community-renderer.mjs?v=922427c63da929a9d5b8')).mount(scope);
}
