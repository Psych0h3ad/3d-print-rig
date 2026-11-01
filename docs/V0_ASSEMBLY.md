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

Open **Assembly steps** in the V0 printer's Configuration tab. The temporary view uses the stock assembly and closed enclosure at its CAD reference pose. Select a stage, use Previous/Next, or focus the added parts. The manual link opens the pinned document at that stage's page. **Return to previous configuration** restores the previous Mod selection, pose, appearance, enclosure settings and camera.

V0.2 has 106 stages and 1,653 exported source leaves. V0.2r1 has 107 stages and 1,678 leaves. Preparation, preloaded fasteners, inspection and wiring instructions are retained even when they add no modeled parts. Electronic board components count as individual source leaves. Parts are shown cumulatively at their final CAD positions; this view does not animate insertion, screw tightening or wiring.

| Version | Pinned source revision | Official manual |
| --- | --- | --- |
| V0.2 | `a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8` | [V0.2 manual](https://raw.githubusercontent.com/VoronDesign/Voron-0/a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8/Manuals/VORON_V0.2_Assembly_Manual.pdf), 246 pages |
| V0.2r1 | `a53fc87562fd630c846af38d7de850c894dc3d85` | [V0.2r1 manual](https://raw.githubusercontent.com/VoronDesign/Voron-0/a53fc87562fd630c846af38d7de850c894dc3d85/Manuals/VORON_V0.2r1_Assembly_Manual.pdf), 253 pages |

The manuals, native source CAD and exports belong to [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0), under its [GPL-3.0 license](https://github.com/VoronDesign/Voron-0/blob/a53fc87562fd630c846af38d7de850c894dc3d85/LICENSE). Model, manifest and manual hashes are pinned in [V0_ASSEMBLY_STAGES.json](../site/V0_ASSEMBLY_STAGES.json). Stage assignments use exact native occurrence keys. Missing, duplicated, unknown or unassigned parts fail validation.

The existing stock carriage model omits its built-in print support. Its display replacement follows the source carriage's stage; hidden support geometry stays hidden. Native CAD alternatives and supplements are called out in the stage notes. A manual instruction without corresponding source geometry remains a text-only step.

The displayed V0.2r1 uses the runout-sensor rear foot and the V0 display. Its plain rear foot, matching fasteners/accent and headless skirt insert are excluded from the display because they occupy the same native seats. V0.2 also excludes the headless insert when displaying the screen. This is a viewer selection of source alternatives. All alternative leaves remain in the stage inventory.

Preloading instructions stay on their manual pages. Twenty source frame-slot nuts per version appear in 3D only when their receiving extrusion is shown, preventing isolated nuts in earlier steps. Their exact native source keys and receiving members are recorded in `seat_display_dependencies`; stage validation rejects a nut assigned before its receiving member. All source leaves remain assigned exactly once.

Publication runs `audit_v0_assembly_assets.mjs` on both decoded stock GLBs with the production adapters, stage controller and support-omitted carriage. It exercises all forward and reverse stages, intermediate jumps and leaving/re-entering the view, checks exact visibility restoration, and rejects transform, geometry, material or source-hash changes. Source-executed UI tests separately check locking, rollback and configuration restoration.

The alternative-selection regression also moves every axis through minimum, maximum, intermediate and reversed poses, then resets the native assembly. The excluded alternatives must remain hidden. Motion may rebuild flexible meshes; their geometry content, source transforms and materials must return to the reference state.

Native-solid review confirmed the overlapping foot/display alternatives and four r1 insert/carrier pairs by their pilot axes and contact geometry. It does not classify every source contact: 99 V0.2 and 90 r1 positive-contact candidates in the retained native inventory remain held, together with four invalid Boolean results and one unresolved motor/mount operation per model. These inventory counts do not describe simultaneous display contacts. The original support-bearing carriage/Motor Plate pair is not displayed together. Insert/pilot engagement is recorded separately from unintended body overlap. No insertion or folding path is certified by this static view.

These automated checks concern displayed geometry and software state. Manual diagram review, native-solid contact classification, continuous assembly paths and physical build fit are separate scopes. Retaining an author's native pose does not certify every source contact or assembly path.
