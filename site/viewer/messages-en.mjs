// Compatibility exports for existing catalog and controller checks.
// Edit locales/source.json; IDs remain stable when copy changes.
import {definitions} from './locales/manifest.mjs?v=ca5ec7f3f3d31ac810b4';
export const messages=Object.fromEntries(Object.values(definitions).filter(e=>e.kind==='message').map(e=>[e.ja,e.en]));
export const templates=Object.fromEntries(Object.values(definitions).filter(e=>e.kind==='template').map(e=>[e.ja,e.en]));
