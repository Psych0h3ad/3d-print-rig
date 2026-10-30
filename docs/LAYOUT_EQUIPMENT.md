# Layout reference models

Snapmaker U1 and BIQU PopStation Mini are simplified exterior models for room
and furniture planning. They are available in Layout. Their dimensions describe
these reference models; leave space for access, cables and moving parts.

The U1 has a standalone view with four spools. Placing it on PopStation moves
the four spools, holders and two feeders into the cabinet. Moving or rotating
the cabinet carries the printer with it. Detaching the printer restores its
standalone appearance.

| Reference | Width × depth × height |
| --- | --- |
| U1, standalone | 582.7 × 514.3 × 441.9 mm |
| U1, on PopStation | 418.1 × 514.3 × 441.9 mm, above the cabinet |
| PopStation Mini | 422 × 456 × 428 mm |

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

This reference retains the 70 source occurrences. Its displayed envelope is 423.100 × 478.283 × 417.400 mm, including the handle. The bottom of the modeled housing is the floor datum. The supplied assembly has no spools, feeder assemblies, protruding feet or casters. The white exterior, smoky transparent window, black handle, dark seals and silver hardware follow [BIQU's product photographs](https://biqu.equipment/products/biqu-popstation-mini-sealed-dual-drawer-storage-cabinet-for-4-filament-spools). They are display finishes; the supplied CAD does not specify colors. Unconfirmed interior finishes remain neutral gray. Individual materials within compound source parts have not been established.

Both PopStation entries show a [BIQU official store affiliate link](https://psych0h3ad.link/lxbhIoR) in the selected item's panel, with an adjacent affiliate disclosure. The lightweight preview and detailed image export use the same source-based color assignments.

The cabinet is a separate versioned layout item. Existing PopStation Mini references, U1 sets and saved placements keep their previous dimensions and support datum. The supplied cabinet's upper deck has cutouts; it is not offered as an automatically verified U1 mounting surface. The existing U1 reference remains available for that layout arrangement.

Placement preview shares one merged mesh between copies. Detailed image output loads the original 70 occurrences. Both derive from the supplied geometry without resizing it to match the older reference. Room and furniture envelopes remain planning checks, not load ratings or native-solid clearance certification.
