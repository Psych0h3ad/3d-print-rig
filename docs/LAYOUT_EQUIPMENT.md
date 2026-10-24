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
