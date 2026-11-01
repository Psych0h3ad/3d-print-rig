# V0 assembly steps

Search by stage title, source part name or source key. The current stage lists its
source items; selecting a displayed item focuses its real geometry. Clicking a
visible source part in the viewport shows its identity and a link to its stage.
Hidden source alternatives remain identified in the list without being exposed.

The reader can check completed stages, resume in the same browser, and export or
load a separate progress JSON. Progress is pinned to the machine, model, manifest,
stage document and manual revision. A mismatched progress file is rejected before
changing the view. This checklist is a personal record, not assembly inspection.
It does not change the existing machine-configuration save format.

Individual source items also have their own checkboxes. Use **Fasteners** to
filter named screws, nuts, washers, shims and inserts, or **Unchecked only** to
find remaining items. **Next unchecked part** focuses a displayed source item
without marking it checked. The selected 3D part can be checked directly too.
Stage completion and individual part checks remain independent records.
Names and sizes come from the source; same-name occurrence numbers count only
this stage's source items, not a purchasing BOM. Hidden alternatives cannot be
checked as displayed parts. No generic fasteners or new mounting claims are added.

Progress v2 stores exact checked source keys. Source-matching v1 files migrate
with their current stage and stage checks retained, and no invented part checks.
Browser storage uses a separate v2 key while preserving old v1 storage. Import
is capped at 512 KiB; actual-asset audits require a complete source-part checklist
to fit that limit. Unknown, duplicated or sparse source records are rejected
before replacing the current progress. Clear and undo cover both record types.

Open **Assembly steps** in the V0 printer's Configuration tab. The temporary view uses the stock assembly and closed enclosure at its CAD reference pose. Select a stage, use Previous/Next, or focus the added parts. The manual link opens the pinned document at that stage's page. **Return to previous configuration** restores the previous Mod selection, pose, appearance, enclosure settings and camera.

V0.2 has 123 stages and 1,653 exported source leaves. V0.2r1 has 128 stages and 1,678 leaves. Preparation, preloaded fasteners, inspection and wiring instructions are retained even when they add no modeled parts. Electronic board components count as individual source leaves. Most stages show cumulative final CAD positions; this view does not animate insertion, screw tightening or wiring.

The rail-nut preparation stage follows page 18 of each pinned manual: all five
source carriers, each with its ten source nuts, are laid out in parallel for
inspection. Each complete group receives one temporary rigid transform. The
arrangement is labelled as a preparation display, rather than an installation
position or insertion path. No part is stretched, regenerated or substituted.

Pages 20–23 use the two Y-rail carriers; pages 24–26 use the two Z-rail carriers.
Prepared carriers for later rails are set aside until their receiving rail's
stage, including the fifth carrier at the X-rail stage (r1 page 119, V0.2 page
113). Their source inventory and individual preparation checkboxes remain
unchanged. They are not shown floating at future X/Z seats during Y-rail work.
Moving back to preparation restores the layout; leaving assembly mode restores
every original transform exactly. Crossing between the laid-out preparation
and installed positions frames the new space automatically; stage changes
within the same work area retain the reader's orbit. Stage IDs, manual/model pins and progress
identity remain unchanged, so existing checked stages and parts are retained.

The A/B drive operations follow pages 69–81. During each drive's preparation,
the viewer isolates only that source subassembly; the frame and previously
prepared drive are set aside. The sequence shows 6, 21, 29 and 37 cumulative
source items for each drive, then returns to the frame at the mounting step on
page 81. No modeled item is deleted, substituted or moved. The original
relative placements remain inspection states, rather than insertion animation.

The bearing-stack operation selects an underside camera view, following the
manual's upside-down assembly recommendation. The next motor operation returns
to an upright inspection view. Guidance distinguishes the 18 mm bearing stack,
0.5 mm shims, A pulley setting of 8.5 mm and B setting of 17.5 mm, inward motor
wires, and the front preloaded nuts versus rear threaded frame ends. Temporary
M3 retaining nuts mentioned by the manual are not invented as permanent CAD
parts. These are manual instructions, not measured acceptance of the source
geometry or a fastening/clearance certificate.

Changing between a drive work area, its underside view and the installed frame
automatically frames the relevant original parts. In particular, the mounting
step can focus both prepared drives while introducing its four original frame screws.
The four original frame mounting M3x35 screws per machine now belong to the
page-81 mounting operation, rather than the earlier bearing/motor preparation.
Stage IDs, model/manual receipts and the complete source inventory stay the same.
Progress from the exact previous stage document is migrated to this corrected
document with a visible notice. Its stage and individual source-part checks are
retained, and the old browser-storage entry remains available. Arbitrary stage
documents or different models/manuals are still rejected.

The idlers follow the separate preparation, mounting and cam-lock instructions
on pages 84–89. Each original seven-item subassembly is laid out upside down
with one rigid transform. The B assembly mounts first on the left; the prepared
A assembly is set aside until its right-side mounting step. Rear M3x35 screws
and cam locks are introduced separately. Returning to installation or leaving
assembly mode restores the original source transforms. A has the taller upper
printed section and lower bearing level; B has the shorter upper section and
higher bearings. The two bearing levels have separate side-view checks.

Four original M3x10 screws belong to the later upper side members, rather than
drive or idler preparation. After those two B profiles are installed (V0.2 pages
121–123, r1 pages 127–129), remove both original cam locks, fit the front screws,
refit the same locks, then fit the rear screws through the drive housings.
The locks remain identified while set aside. Part checks follow the same source
occurrences across these operations, and exact earlier progress records migrate
without marking the new operations complete. These displays do not certify
thread engagement, insertion paths or native-solid fit. See the
[idler operation review](V0_IDLER_ASSEMBLY_REVIEW.json) for source scope.

The stock bed carrier now follows the temporary states on pages 36–46:
right rear mount/chain-end preparation, F and G carrier construction, slot-nut
preloading, temporary rear-mount attachment, coplanarity inspection, removal,
Z-rail-block attachment and carrier refit. Removed original screws and the
carrier are set aside for reuse. They remain source references rather than new
parts. The T8 holder is prepared separately on page 92 and attaches to the G
extrusion on page 93. The two manual revisions retain their different Kirigami
and anti-backlash notes.

Parts used more than once offer an operation selector. Their global checkbox
stays with the same source occurrence across removal/refit; operation checks
remain independent. Stored items are labelled and cannot be newly checked or
focused as displayed geometry. The six new operations receive no fabricated
completion marks when exact old progress is migrated.

The manual specifies ten preloaded carrier nuts, while the original CAD cohort
has eleven occurrences. The close source pair remains distinct and its separate
purpose is unresolved. Use the manual quantity rather than the model count.
No source item is removed or substituted to resolve this difference. See the
[bed operation review](V0_BED_ASSEMBLY_REVIEW.json) for exact manual/source scope.
These are inspection views at original source locations, not insertion,
coplanarity measurement, fastening or native-fit certification.

The feet and Z-motor reference steps separate preparation from frame fixing.
Inlet-foot inserts and pads are prepared on page101; long corner screws and
rear-foot accents appear at their later mounting operations. The Z motor uses
its original motor-case screws separately from the four loose frame screws.
Later alignment references the same existing nuts and top holder screws.
The r1 fitting/bearing and switch operations are separate, while V0.2 retains
its own alignment instructions. The one-piece ECAS04 reference does not expose
its internal rubber removal, and bottom-position alignment is an instruction
rather than an animated source pose. See the [foot and Z-motor review](V0_FEET_ASSEMBLY_REVIEW.json).

| Version | Pinned source revision | Official manual |
| --- | --- | --- |
| V0.2 | `a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8` | [V0.2 manual](https://raw.githubusercontent.com/VoronDesign/Voron-0/a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8/Manuals/VORON_V0.2_Assembly_Manual.pdf), 246 pages |
| V0.2r1 | `a53fc87562fd630c846af38d7de850c894dc3d85` | [V0.2r1 manual](https://raw.githubusercontent.com/VoronDesign/Voron-0/a53fc87562fd630c846af38d7de850c894dc3d85/Manuals/VORON_V0.2r1_Assembly_Manual.pdf), 253 pages |

The manuals, native source CAD and exports belong to [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0), under its [GPL-3.0 license](https://github.com/VoronDesign/Voron-0/blob/a53fc87562fd630c846af38d7de850c894dc3d85/LICENSE). Model, manifest and manual hashes are pinned in [V0_ASSEMBLY_STAGES.json](../site/V0_ASSEMBLY_STAGES.json). Stage assignments use exact native occurrence keys. Missing, duplicated, unknown or unassigned parts fail validation.

The existing stock carriage model omits its built-in print support. Its display replacement follows the source carriage's stage; hidden support geometry stays hidden. Native CAD alternatives and supplements are called out in the stage notes. A manual instruction without corresponding source geometry remains a text-only step.

The displayed V0.2r1 uses the runout-sensor rear foot and the V0 display. Its plain rear foot, matching fasteners/accent and headless skirt insert are excluded from the display because they occupy the same native seats. V0.2 also excludes the headless insert when displaying the screen. This is a viewer selection of source alternatives. All alternative leaves remain in the stage inventory.

Preloading instructions stay on their manual pages. Twenty source frame-slot nuts per version appear in 3D only when their receiving extrusion is shown, preventing isolated nuts in earlier steps. Their exact native source keys and receiving members are recorded in `seat_display_dependencies`; stage validation rejects a nut assigned before its receiving member. All source leaves remain assigned exactly once.

Publication runs `audit_v0_assembly_assets.mjs` on both decoded stock GLBs with the production adapters, stage controller and support-omitted carriage. It exercises all forward and reverse stages, intermediate jumps and leaving/re-entering the view. At preparation it checks proper rigid group transforms, parallel separated rows and the unchanged relative matrices of every carrier and its ten nuts. Other stages retain exact native transforms; geometry, materials, source hashes and final restoration remain exact throughout. Source-executed UI tests separately check locking, rollback and configuration restoration. The preparation policy also has source-identity, external-transform and partial-failure rollback regressions.

The alternative-selection regression also moves every axis through minimum, maximum, intermediate and reversed poses, then resets the native assembly. The excluded alternatives must remain hidden. Motion may rebuild flexible meshes; their geometry content, source transforms and materials must return to the reference state.

Native-solid review confirmed the overlapping foot/display alternatives and four r1 insert/carrier pairs by their pilot axes and contact geometry. It does not classify every source contact: 99 V0.2 and 90 r1 positive-contact candidates in the retained native inventory remain held, together with four invalid Boolean results and one unresolved motor/mount operation per model. These inventory counts do not describe simultaneous display contacts. The original support-bearing carriage/Motor Plate pair is not displayed together. Insert/pilot engagement is recorded separately from unintended body overlap. No insertion or folding path is certified by this static view.

These automated checks concern displayed geometry and software state. Manual diagram review, native-solid contact classification, continuous assembly paths and physical build fit are separate scopes. Retaining an author's native pose does not certify every source contact or assembly path.
