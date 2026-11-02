import {ensureWorkspaceEntry} from './workspace-entry.mjs?v=7e4c8f98212e989784bd';
import {isElegooMachine} from './elegoo-catalog.mjs?v=3309535203a88f622ae0';
ensureWorkspaceEntry(import.meta.url);

// Select the delegated renderer before importing ordinary community features.
export async function mount(scope) {
  const machine = new URLSearchParams(location.search).get('machine');
  if (isElegooMachine(machine)) return (await import('./elegoo.mjs?v=23f62a79918633293a59')).mount(scope);
  return (await import('./community-renderer.mjs?v=90cf124237db3185c01a')).mount(scope);
}
