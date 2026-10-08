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

## Hotend and head companion parts

Apply this review to every added or changed hotend, extruder, toolhead, cooling
variant, carriage and mounting method. Record which companion parts are required
by the exact author/manufacturer assembly and revision: outer cover length,
cartridge/mount, extension or spacer, duct, cooling fan, LED carrier, nozzle,
probe and fasteners. Use original part identities and mating features. HF/UHF
labels do not establish a universal cover, spacer thickness or nozzle offset;
different head designs may use different solutions. An unknown requirement
remains an open finding.

Review the production-composed parts after board expansion and machine/gantry
overrides. Enumerate every affected vendor, size, gantry and fixed/changer
registration. Check both the standalone head and installed-machine consumers.
Inspect the actual exported meshes and compare their dimensions and placement
with the pinned native/source assembly. Required parts must be present once,
obsolete alternatives must be absent, and companion parts must move with the
correct group. Include front, side, rear and underside browser views.

Exercise A-to-B-to-A changes, including HF-to-UHF-to-HF where applicable,
discard/rollback, reference reset and save/load. Check each intermediate and
restored assembly for leftover covers, duplicate shells, orphan LEDs, missing
fans or nozzles, and stale replacement/visibility/placement masks. Recheck
materials after contrasting and reversed palettes. Measure nozzle/bed/probe,
mount and cooling-part clearance against original finite mating features;
overall bounds or the selected hotend name do not establish those interfaces.

The existing Rapido X regression is a required example:
[`test_machine_heads.mjs`](../scripts/test_machine_heads.mjs) checks source
selection guards;
[`audit_rapido_x_uhf_cover.mjs`](../scripts/audit_rapido_x_uhf_cover.mjs) reviews
the actual original UHF shell/LEDs, retained manufacturer cartridge meshes,
registered selections, motion, palette, HF return and original-index reset.
The latter is invoked by
[`audit_madmax_native_joint.mjs`](../scripts/audit_madmax_native_joint.mjs) in
the actual-asset release job. Running the exported helper alone does not execute
that audit. Keep both source and actual-asset checks in release orchestration.
For a new defect, add an equivalent regression that rejects the incorrect
companion selection and tests its restored state.

Record the inspected part identities/hashes, expected companions, actual
combinations and transitions, screenshots, native measurements and failures.
Inherited source contacts and incomplete cartridge/fastener/cooling verification
retain their stated limits. A correct cover selection does not certify the
whole head or every machine's physical fit.

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
| Head companion parts | Source-specific cover length, mounts/spacers, ducts/fans, LEDs, nozzle/probe and fasteners form the correct complete variant; no obsolete, duplicate or detached companions through switching, reset and save/load. Review actual standalone and installed assets and native mating features. |
| Motion | Min/max/intermediate positions, reverse motion and exact reset; correct bed/gantry/rail/sensor groups; all supported gantries and changer modes. |
| Flexible parts | Belts, chain links, PTFE and CAN remain visible and finite; endpoints stay in actual fittings; frame/bed clearance; belt widths, teeth and clamp cuts checked separately. |
| Clearance | Nozzle versus bed; probe versus nozzle/hotend/mount; fans and ducts; parked tools versus bed travel; folding and hand-carried parts through every transition. |
| Mesh quality | Finite vertices, valid normals and bounds; no lost geometry or rendering glitches; built-in supports removed only with documented evidence and notice. |
| Materials | Every printed base/accent role responds to palettes; hardware materials stay correct; aluminum/CNC options and transparent panels. Test distinct contrasting palettes, reverse changes, native reset and movement after recoloring on every applicable size. Check anonymous source leaves against the printed-part library. A printed parent assembly does not classify its purchased descendants. Shared GLB materials must be isolated. Record actual model and material coverage, not only role fixtures. |
| Environment | Consistent floor/grid defaults and environment brightness; site theme separate from chamber lighting; RGB animation. |
| Interaction | Mobile orbit, concurrent model/settings view, measured download percentages with a separate assembly phase, failed/canceled load cleanup, atomic selection changes, save/load, configurable image export and all supported languages. |
| Provenance | Original repositories and revisions, licenses, supported combinations, stock download scope and reference-model limitations. |

Fixed endpoints and final poses are insufficient. Adaptively sample fast
transitions, using mesh or solid movement to choose the step size. Separate
authored contacts and intended threaded engagement from new body interference.
Use native solids for physical clearance; boxes are candidate filters only.

When extending a machine size, preserve fixed mounting interfaces and source
cutouts. Extending the Trident deck must retain the original 52 mm rear notch,
its depth and circular corners; stretching the central sheet must not stretch
the opening under the unchanged Z cover. Check the native leaf, exported mesh,
and downloadable assembly together. Retain the source's intentional openings.
Changes to a host part also require a scoped check against installed accessories;
preserve the original accessory receipts and bind the new host delta separately.

Verify browser rendering of changed geometry and representative families on
desktop and mobile. Name the browser actually tested. Attach screenshots.
Record unavailable browser coverage explicitly rather than counting it as a
pass. An automated geometry pass does not certify real-world fit, belt tension,
wiring bend limits, firmware behavior or every possible motion path.
