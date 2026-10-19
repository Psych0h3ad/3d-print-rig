// Manufacturing identity and palette eligibility are separate. An optical
// part is printed only when its own source leaf explicitly says so.
export function printedInventoryRole(row) {
 if (row.role === 'base' || row.role === 'accent') return row.role;
 return row.role === 'optical' && row.component === 'printed' ? 'fixed' : null;
}
export function visibleInAsset(mesh, root) {
 for (let node = mesh; node; node = node.parent) {
  if (node.visible === false) return false;
  if (node === root) return true;
 }
 return false;
}
export function headPrintedCounts(assets) {
 const counts = {base:0, accent:0, fixed:0, total:0};
 for (const asset of assets) {
  if (!asset?.root || asset.root.visible === false) continue;
  const identities = {base:new Set(), accent:new Set(), fixed:new Set()};
  for (const row of asset.meshes) {
   const role = printedInventoryRole(row);
   if (role && visibleInAsset(row.mesh, asset.root)) identities[role].add(row.key);
  }
  for (const role of ['base','accent','fixed']) counts[role] += identities[role].size;
 }
 counts.total = counts.base + counts.accent + counts.fixed;
 return counts;
}
