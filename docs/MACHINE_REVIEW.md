# Machine review

This is the default review procedure for every existing and newly added printer,
vendor, size, gantry, toolhead and mod. A release covers all available machines;
a source-only reference retains its explicitly declared motion limitations.

## Automated checks

`python scripts/check_repository.py` runs every `scripts/test_*.mjs` regression
and the build-evidence tests with bounded parallel workers. New regression tests
are discovered automatically. `check_machine_coverage.mjs` fails if an available
printer family has no required regression suite.

`docs/MACHINE_REVIEW_COVERAGE.json` records the actual model hash and native
inspection scope for every available machine. The coverage check also pins
the model catalogs, renderer, adapters and interaction code. Changing an input
or adding a machine makes the record stale and fails the default repository
check. Refresh the record only after rerunning the affected actual-asset audits
and reviewing their results. `--registration-only` lists registrations for
audit orchestration; it is not the publication check.

Run actual release-asset audits as well: `check_motion_assets.mjs`,
`audit_trident_sizes.mjs`, `audit_v24_colors.mjs`, `check_workbench_assets.mjs`,
`audit_loaded_heads.mjs`, the Monolith audits and the changer-bank audits.
Use the current release assets, not an older fixture or model. Audit the native
models for community printers, Micron, Annex, Remorph, Crossant, Rat Rig and
Positron with their production adapters. Report every available machine, actual
model/adapter hashes, tested poses and combinations, findings and scope.

## Required inspection categories

| Category | Required evidence |
| --- | --- |
| Fasteners and mounting | Nuts inside frame slots; correct screw axis and engagement; rail screws, rail blocks, changer receivers and docks registered to their mating features. |
| Motion | Min/max/intermediate positions, reverse motion and exact reset; correct bed/gantry/rail/sensor groups; all supported gantries and changer modes. |
| Flexible parts | Belts, chain links, PTFE and CAN remain visible and finite; endpoints stay in actual fittings; frame/bed clearance; belt widths, teeth and clamp cuts checked separately. |
| Clearance | Nozzle versus bed; probe versus nozzle/hotend/mount; fans and ducts; parked tools versus bed travel; folding and hand-carried parts through every transition. |
| Mesh quality | Finite vertices, valid normals and bounds; no lost geometry or rendering glitches; built-in supports removed only with documented evidence and notice. |
| Materials | Every printed base/accent role responds to palettes; hardware materials stay correct; aluminum/CNC options and transparent panels. |
| Environment | Consistent floor/grid defaults and environment brightness; site theme separate from chamber lighting; RGB animation. |
| Interaction | Mobile orbit, concurrent model/settings view, atomic selection changes, save/load, configurable image export and all supported languages. |
| Provenance | Original repositories and revisions, licenses, supported combinations, stock download scope and reference-model limitations. |

Fixed endpoints and final poses are insufficient. Adaptively sample fast
transitions, using mesh or solid movement to choose the step size. Separate
authored contacts and intended threaded engagement from new body interference.
Use native solids for physical clearance; boxes are candidate filters only.

Verify browser rendering of changed geometry and representative families on
desktop and mobile. Name the browser actually tested. Attach screenshots.
Record unavailable browser coverage explicitly rather than counting it as a
pass. An automated geometry pass does not certify real-world fit, belt tension,
wiring bend limits, firmware behavior or every possible motion path.
