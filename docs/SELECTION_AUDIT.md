# Configuration and selection audit — 2026-10-02

The original delegated audit used source baseline `c135140` and assembled `public-v18-probe1` assets. Its selector fixes were integrated after the published probe and motion changes at `e2f2597`. The v19 rerun includes Sphinx hardware and machine placement. Neither audit certifies physical compatibility or full-travel clearance.

## Reproduced and repaired

| Problem | Result |
| --- | --- |
| Chube selected on the head page reverts to stock Rapido on the printer page | Resolve exact IDs and registered `source_head_configuration` aliases. Unknown IDs produce an explicit message. |
| Standalone heads marked `head_only` lose their configuration even when a machine mount is registered | Derive printer links from the actual machine registration catalog. Unsupported mounts remain explicitly unregistered. |
| V2.4/Trident → head → printer returns to the wrong machine | Preserve machine and original configuration context. Add the missing dynamic head link on V2.4 reference pages. |
| V2.4 header still says Revo after installing Chube | Update the selected-head subtitle and remove the misleading original-part count for custom heads. |
| Later mount selection hides earlier extruder/hotend choices | Standalone menu dependencies now follow the visible order: head, extruder, hotend, cooling, mount, gantry, carriage, probe, board. Dragon Burner archive vs fixed mounts was a concrete case. Dependent changes are explained in the status. |
| Selecting the same head again can discard a conflicting probe | Preserve an exact registered selector tuple before applying fallback scoring. Existing warnings remain. |
| Monolith link silently drops the probe | Require a matching probe as well as head, extruder, hotend, board and cooling. No link to an incompatible registered tuple. |
| “No board” still shows SHT36 or EBB2209 | Correct the embedded-board labels and add real board-free variants. Source SHT-36v2 hierarchy identifies 785 meshes in 84 Xol configurations; the SB source identifies EBB2209/connector in 38 configurations. Mounts/spacers remain and this is stated. Existing IDs preserve their original geometry. |
| Failed rollback claims the previous configuration is visible | Report an uncertain/failed display honestly, clear committed state, and disable configuration export until a successful retry. |
| Workbench audit hardcodes obsolete 692-head/46-component counts | Use catalog coverage and uniqueness assertions so new registered variants are included. |

## Delegated audit baseline

- Catalog audit: 1,187 standalone variants after adding 122 board-free variants; 707 SIBOOR variants; 354 standard Trident variants; 354 registered custom-head variants for each of seven V2.4 catalogs. V2.4 baseline stock heads are additional runtime entries and are not included in those custom-head counts.
- 136,853 offered selector transitions checked; no missing assets, invalid hidden keys, unreachable registered tuples, non-idempotent choices, or source-link losses. Every distinct selector tuple has a distinct module/visibility signature. This is catalog evidence, not a rendered-pixel or physical-fit test.
- Production installed-head controller with real GLBs: 4,726 standalone/registered machine plans, 184 modules, 3,612,837 mesh visibility checks. Checked old-module removal, exact transforms, visibility masks, nonempty meshes and motion delta. This is an offline Three.js test, not browser rendering.
- Real browser: all 18 head families; all 9 cleaning Mods; all 58 component models and 842 selectable component parts; all 43 toolchanger assemblies; all 32 Monolith gantry configurations. Selection IDs matched committed display IDs and loading completed. Representative renderings were visually inspected.
- Real browser regression: Chube survives head → SIBOOR, and V2.4 300 → head → same V2.4 300. Xol board switch changes visible CAD instances from 961 to 176; SB switch removes the two identified board/connector instances. Screenshots and raw UI records accompany the task handoff.
- Source tests include unknown IDs, board normalization/idempotence, dependent options, unchanged probe, Monolith matching, failed installation and failed rollback. Existing repository tests cover JSON imports, accessory transactions, appearance and machine navigation.

## Integrated v19 verification

- Catalog audit: 1,195 standalone variants, 711 SIBOOR variants, 358 standard Trident variants, and 358 registered custom heads in each of seven V2.4 catalogs. All 140,851 offered selector transitions passed. Every distinct selector tuple has a distinct module/visibility signature; there were no missing assets, invalid hidden keys, unreachable tuples, non-idempotent selections or source-link losses.
- Actual GLBs through the production installed-head controller: 4,770 placement plans, 189 modules and 3,615,587 mesh visibility checks passed. This checks module replacement, exact transforms, masks, nonempty geometry and XYZ motion deltas offline in Three.js. It is not a browser rendering test.
- Sphinx adds eight hardware assemblies, four with registered 6 mm VORON machine destinations. Its original Monolith variants remain standalone pending clamp/routing registration. Native mating-axis, static intersection and rail-block checks are described in [Sphinx assemblies](SPHINX_ASSEMBLIES.md).
- Japanese/English DOM switching passed on all 11 pages. Existing explicit probe warnings survive idempotent selection; genuine component changes retain safe fallback handling. New Sphinx configurations do not invent a probe registration.
- The browser observations above belong to the delegated baseline. The integrated v19 rerun used offline geometry/controller, DOM and native CAD checks; it did not repeat that browser review.

## Boundaries and further CAD work

- The integrated catalog has 484 standalone configurations without a registered printer destination. They are not asserted to be physically incompatible; they need registered machine carriage/datum data. No Cartesian-product compatibility was invented.
- Chube Compact's supplied SB mount is CW2-specific. G2E/Orbiter/LGX combinations require mount evidence; generic similarity does not justify exposing them as verified assemblies.
- Original CAD collisions, incomplete reference heads, dock registration and whole-travel verification remain visible in the existing status/notes. This patch does not remove those qualifications.
- Source catalog records may contain unused options because they are shared supersets. Absence from a particular machine menu alone is not a bug.

Run `scripts/audit_selection_catalogs.mjs <assembled-site-root> <report.json>` and `node --expose-gc --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_loaded_heads.mjs <assembled-site-root> <report.json>` for the asset-backed audit. Run the repository checker for source/unit verification. Keep generated evidence and geometry outside Git.
