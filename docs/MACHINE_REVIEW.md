# Machine review

This is the default review procedure for every existing and newly added printer,
vendor, size, gantry, toolhead and mod. A release covers all available machines;
a source-only reference retains its explicitly declared motion limitations.

Use [maintenance](MAINTENANCE.md) for the catalog/update map and
[combination support](COMBINATION_SUPPORT.md) for registration status. The review
unit includes machine/vendor/size, gantry, head, mount/carriage, hotend, extruder,
cooling, probe and board where applicable. V0 Mod states and parked-tool banks
have separate dependency and capacity rules; a single family-level pass cannot
stand in for every registered configuration.

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

Compare the generated support data against production composition with
`node scripts/test_support_catalog.mjs <assembled-site> <assembled-site>/support/data`.
The no-argument source regression does not perform that actual-catalog audit.
Include selection/loaded-head, V0 installation, rear-enclosure and relevant
bank/Monolith audits when those inputs change. Test rejected combinations as
well as offered choices; an unavailable explicit ID must not install a different
assembly silently.

## Evidence scope when patterns grow

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Catalog / support comparison | Exact registered tuples, option reachability, strict intersections, IDs and reported status | Correct rendering, native mounting or physical compatibility |
| Production controller with exported GLBs | Installed modules, masks, transforms, colors, sampled poses, reset and teardown | GPU/browser appearance, continuous solid clearance or real operation |
| Native solids and mating datums | The measured interfaces, intersections and travel scope for the exact pinned inputs | Untested parts, other gantries, flexible wiring, tolerances or exchange paths |
| Browser review | Observed behavior and rendering at the named browser, viewport, configurations and poses | Every unvisited tuple or mechanical fit |

Keep all available-machine rows in the coverage record. Shared geometry may
reuse evidence only when identical inputs and relative placements justify it;
record the grouping and exceptions. Distinct board visibility, nozzle offsets,
carriages, parked tools or replaced fixtures can change the required checks.
Adding rows to a support report never extends a native-clearance certificate.

For Markdown-only corrections, retain the existing model evidence and its hashes.
Verify links and statements against the current implementation, regenerate the
source inventory and run the publication check. Do not refresh measurement dates
or coverage hashes without the corresponding review. Historical audit counts
remain tied to their stated source/release; current availability comes from the
generated support index.

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
| Interaction | Mobile orbit, concurrent model/settings view, measured download percentages with a separate assembly phase, failed/canceled load cleanup, atomic selection changes, save/load, configurable image export and all supported languages. |
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
