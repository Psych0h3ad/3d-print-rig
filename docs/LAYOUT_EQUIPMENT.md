# Layout reference models

Snapmaker U1 is a simplified exterior reference; PopStation Mini uses BIQU's supplied cabinet mesh with separate approximate rubber-pad references. Both are for room
and furniture planning. They are available in Layout. Their dimensions describe
these reference models; leave space for access, cables and moving parts.

The U1 has a standalone view with four spools. Its docked exterior omits
the spool holders and feeders; those internal parts are not supplied in the
BIQU cabinet mesh. Moving or rotating the cabinet carries the printer with it.
Detaching the printer restores its standalone appearance.

| Reference | Width × depth × height |
| --- | --- |
| U1, standalone | 582.7 × 514.3 × 441.9 mm |
| U1, on PopStation | 418.1 × 514.3 × 441.9 mm, above the cabinet |
| PopStation Mini, with pad references | 423.1 × 478.3 × 428.0 mm |

[Snapmaker specifies 584 × 499 × 730 mm overall](https://www.snapmaker.com/en-EU/snapmaker-u1/specs),
including [cables and protrusions](https://forum.snapmaker.com/t/u1-faq-official-info-summary/39648). The reference model shows the body and omits
the overhead cable routes. Layout reserves at least 730 mm above the supporting
surface for ceiling, shelf and object height checks, in both U1 modes. Its
horizontal envelope follows the reference geometry, whose depth is slightly
larger than the published figure. Allow additional access and service space.
The mounted cable route remains approximate.

## Sources and licence notices

The U1's fixed PEI plate uses the outline and slots from the
[Snapmaker OrcaSlicer bed display model](https://github.com/Snapmaker/OrcaSlicer/blob/229efa64b8ed6093aa2d99ab1fb422182a05a63e/resources/profiles/Snapmaker/Snapmaker%20U1_bed.stl),
revision `229efa64b8ed6093aa2d99ab1fb422182a05a63e`. Its outline was extruded,
placed rigidly and given a plain display colour. The original repository's
[AGPL notice](../site/layout/assets/equipment/u1-exterior/Snapmaker_OrcaSlicer_LICENSE.txt)
is retained. The [component source record](../site/layout/assets/equipment/u1-exterior/U1_BED_SOURCE_RECEIPT.json)
identifies the affected plate in both U1 models; the [outline data](../site/layout/assets/equipment/u1-exterior/U1_BED_OUTLINE.json)
contains its editable contours. This source record concerns the plate component.

PopStation's dimensions and arrangement refer to the
[BIQU manual](https://neo.bttwiki.com/en/docs/more-series/pop-module/popstation-mini/)
and [product page](https://biqu.equipment/products/biqu-popstation-mini-sealed-dual-drawer-storage-cabinet-for-4-filament-spools).
Cabinet details, spool placement and contact surfaces are approximate. These
models do not establish manufacturer mounting dimensions or load ratings.

All supplied notices are preserved in the
[reference notices](../site/layout/assets/equipment/u1-exterior/U1_exterior_notices.json).

## BIQU PopStation Mini cabinet

The **PopStation Mini · BIQU** entry uses cabinet CAD supplied by BIQU, with permission to distribute a Web mesh. The original STEP is not included in the site, downloads or export packages.

The supplied cabinet retains all 70 source occurrences, with a bare envelope
of 423.100 × 478.283 × 417.400 mm including the handle. Four separately
identified rubber-pad references are based on BIQU's official installation
images. Their profile, bore and placement are estimates, not supplied CAD.
A rigid 10.6 mm cabinet lift gives a composed height of approximately 428 mm;
no original component is scaled or deformed. The cabinet has no added spools,
holders, feeder assemblies or casters.

The white exterior, smoky window, black handle, dark seals and silver hardware
follow [BIQU's product photographs](https://biqu.equipment/products/biqu-popstation-mini-sealed-dual-drawer-storage-cabinet-for-4-filament-spools).
They are display finishes; unconfirmed interior finishes stay neutral gray.
Individual materials within compound source parts have not been established.
The selected cabinet shows the [BIQU official store affiliate link](https://psych0h3ad.link/lxbhIoR)
with an adjacent disclosure. Preview and PNG use the same color assignments.

This cabinet replaces the former approximate PopStation selection. Old plans,
clipboard units and saved groups retain IDs, X/Z, rotation and attachments
while migrating to the supplied envelope. Changes in the measured depth can
produce a boundary warning; objects are not silently moved. U1 sets use the
composed deck height of 422.700 mm. The actual finite deck was checked against
the four reference footprints at the locked layout pose; small noncoplanar
foot gaps remain. This is not a fastening, load or native-solid fit certificate.

The preview shares one cabinet mesh and one pad geometry across copies.
Detailed PNG output loads all 70 source occurrences plus the four separately
identified pad references. The source STEP is excluded from both outputs and
all download packages. Room and furniture envelopes remain planning checks.
