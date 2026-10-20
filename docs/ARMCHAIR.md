# Armchair Heavy Industries

In the [toolhead builder](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html),
select Archetype to compare the registered extruders, hotends, duct lengths,
MGN9/MGN12 mounts and original Beacon mounts. Printed parts use the base and
accent colors.

| Source | Available models |
| --- | --- |
| Archetype Public CAD v22 | BlackBird, Breakneck, Mjolnir, Zephyr ducts and Atrocity, with the matching source lengths |
| A4T | Rapido v1 HF or Chube Compact with Sherpa Mini and cooling hardware; original cowl, duct and WW-BMG printed references remain separate |
| Escapement | Four Galileo 2 printed housing parts |
| Sharketype | Seven BMG housing and auxiliary printed parts |
| Trailhead XY Joints | Original 1515/2020, 6/9 mm and Plated printed parts |
| ADXL Mounts | Original Rapido ADXL/KUSBA clamps and nozzle screw mounts |

The [component page](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=ahi_reference_escapement)
also offers individual printable references in their source orientation.
These references are not assembled extruder STEP models.

## A4T assemblies

The Rapido v1 HF and Chube Compact standalone assemblies include the original
hotend, a 30-part Sherpa Mini, two 4010 part-cooling blowers, a 2510 axial
hotend fan and native mounting fasteners. They have 61 and 55 display parts,
respectively. These assemblies replace the former print-only presets without
changing their existing links.

For Rapido v1 HF, the **A4T printed LED housing** cooling option adds the source
carrier, filter and translucent diffuser, for 64 display parts. It does not add
an LED board, wiring or illumination. The three printed companions have their
own static source-body review; the assembly's existing contact findings remain
visible.

Backflow inserts, toolboard and carriage are absent. Native cowl/duct and Chube
cartridge contacts are disclosed in the viewer. Machine installation, travel,
wiring and cooling performance remain unverified. The original author excludes
stock Cartographer CNC mounts and documents stock VORON front-idler constraints.
The standalone assembly does not establish an installed-machine combination.

## Archetype and other references

Archetype uses Public CAD v22; it is not treated as the same revision as the
author's current printable files or web configurator. Long BlackBird uses the
source's Forbidden body. Duplicate Sherpa front covers, construction cutters,
unselected LED alternatives and external CPAP hose examples are excluded.
Retained parts preserve their source dimensions and positions.

Static body contacts and unresolved pairs are shown in the mounting checks.
Bed-plane comparison uses the display meshes rather than the large bounding
boxes of curved CAD surfaces. Candidate mesh intersections are rechecked with
native solids, separating display approximation from retained source contacts
and unresolved results. Beacon Rev D coil datum, mounting height and metal
keepout, machine installation and complete travel remain unverified. Zephyr's
part-cooling fan and the external CPAP blower are absent.

Escapement and Sharketype are printed housing references without the complete
extruder hardware. Sharketype is not compatible with Breakneck.

## Supports, versions and licenses

Models marked **supports omitted** exclude individually inspected manufacturing
supports: six separate A4T cowl supports; separate v22 support solids in the
MGN9 left/right mounts, Goliath/Rapido/Dragon UHF/VolcMosq/TeaKettle mounts,
BlackBird Medium right rear and Mjolnir Medium/Long ducts; and the toothed
support in Escapement Core. Source dimensions, holes and retained native bodies
or STL triangles are preserved. The model notices and source archives identify
the omitted supports. Disconnected cavity surfaces are retained; separation or
small size alone is not a reason to remove a surface. Display models are
distinct from the original printable files.

Exact authors, commits, component terms and changes are listed in
[third-party notices](THIRD_PARTY_NOTICES.md#armchair-heavy-industries-native-references)
and the viewer's **References** panel. A4T, Archetype and Sharketype use
CC BY-NC-SA 4.0, including its noncommercial restriction. Escapement, Trailhead
and the ADXL mounts use GPL-3.0. Embedded manufacturer components retain their
separate terms. The component source archives include the placed native bodies
and part metadata for the assembled variants.
