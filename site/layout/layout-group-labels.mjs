// Unit identity is separate from the user's base name and movement anchors.
// v1 records may omit label. Reads never migrate or mutate legacy layouts.
export const isGroupLabel = value => typeof value === 'string' && value.length > 0 && value.length <= 6 && !/[^A-Z]/.test(value);

function letters(index) {
  let label = '';
  do { index--; label = String.fromCharCode(65 + index % 26) + label; index = Math.floor(index / 26); } while (index);
  return label;
}
function labels(groups) {
  // Reserve explicit labels before filling any holes, including labels on
  // later records. Legacy fallbacks follow document order deterministically.
  const used = new Set(groups.filter(g => isGroupLabel(g.label)).map(g => g.label));
  let cursor = 1;
  return groups.map(group => {
    if (Object.hasOwn(group, 'label')) return group.label;
    while (used.has(letters(cursor))) cursor++;
    const label = letters(cursor++); used.add(label); return label;
  });
}

/** Effective label, without editing the record. Unknown ID returns ''. */
export function groupLabel(state, id) {
  const groups = state?.groups;
  if (!Array.isArray(groups)) return '';
  const index = groups.findIndex(g => g.id === id);
  return index < 0 ? '' : labels(groups)[index];
}

/** Used only after schema validation, before changing group identities. */
export function materializeGroupLabels(state) {
  if (!state.groups?.some(group => !Object.hasOwn(group, 'label'))) return state;
  const effective = labels(state.groups);
  return {...state, groups: state.groups.map((group, i) => Object.hasOwn(group, 'label') ? group : {...group, label: effective[i]})};
}

/** Allocate a currently unused label; deletion never renumbers survivors. */
export function nextGroupLabel(state) {
  const used = new Set(labels(state.groups ?? []));
  let cursor = 1;
  while (used.has(letters(cursor))) cursor++;
  return letters(cursor);
}
