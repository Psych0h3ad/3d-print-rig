# HYDRA source parts

[Open the component CAD](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=hydra_ender3_parts).

The [author's HYDRA](https://www.printables.com/model/169197-hydra-fan-duct-tool-change-system-for-ender-3-ende)
uses a manually removable tool plate while retaining the fan ducts. It is not
registered as an automatic multi-dock changer in this viewer.

The component page offers 17 native STEP parts individually:

- Ender-3 rear and side bases without threaded inserts.
- Bowden, stock-extruder, dual-gear and BMG tool plates, plus the cable clip.
- Left/right 4010 and 5015 narrow ducts.
- Six MK6 V6 duct alternatives: 5015 at 25°/35°, and 4010.

Only the selected part is shown. Each is centered independently for inspection;
the display coordinates do not establish an assembly transform. Fans, hotend,
extruder, screws and probes are absent from this individual-part view. A separate
[installed Ender-3 configuration](https://psych0h3ad.github.io/3d-print-rig/viewer/community.html?machine=ender3_stock_220&configuration=hydra_bowden_4010)
includes the original Creality hotend, dual 4010 blowers, hotend fan and native
mounting hardware. The source BLTouch plate is labeled work in progress by the author
and is not included as a verified probe option.

Five 0.2 mm sacrificial nut-hole membranes are removed from the bases. The
manifest records each cut, removed volume and the 0.0001 mm radial cleanup
allowance. Other source dimensions are retained; no mesh decimation is used.
Sharp native face normals are exported per triangle to avoid seam cancellation.

Source snapshot: Printables files updated 2022-04-13; no-insert base STEP dated
2021-08-04; tool-plate STEP v1. The component manifest pins every used original
STEP file by bytes and SHA256, and pins the resulting mesh and metadata.
Original CAD remains available from the author. **CC BY-NC-SA 4.0** applies to
these parts and their derived meshes; see [attribution](../site/licenses/hydra/NOTICE.md).

The installed Bowden/4010 assembly uses measured Creality carriage and fan axes.
Printed mounting lips and pilot seats have recorded clearance adaptations;
purchased hardware retains its native dimensions. Its native-solid mating and
continuous added-body travel checks are recorded in [the installation review](HYDRA_ENDER3_QA.json).
Stock/Belted Z and attached KlackEnder combinations are recorded separately in
[the Ender-3 Mod review](ENDER3_MODS_QA.json). The viewer adds a 450 mm Bowden route assumption,
attached to the measured source connector ports and checked separately during
Stock/Belted Z movement. The route does not model tube strain or connector internals.
Other HYDRA plates, hotends, blower sizes and the author's WIP BLTouch
plate remain individual-part references until their assemblies are registered.
Airflow, print strength, manufacturing tolerances and automatic tool changing
are not established by these CAD checks.
