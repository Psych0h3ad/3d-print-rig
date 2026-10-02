# Rat Rig V-Core

The viewer includes eighteen stock assemblies: V-Core 4.0 and 4.1, 300/400/500 mm, in CoreXY, Hybrid and IDEX forms. Select V-Core 4 → Rat Rig → size → version/motion system. Other head, gantry and vendor combinations are not registered for these assemblies.

The native Three.js r180 adapter uses the original, byte-identical GLB geometry. The host verifies compressed and decoded file checksums before loading. Parts, rail carriages, bed arms, VAOC and lights follow their assigned motion groups; Z screws rotate at the native 4 mm pitch. The print surface assumes a 1.5 mm sheet above the bare bed. IDEX COPY/MIRROR controls restrict travel to the paired carriage limits and minimum separation.

Configuration JSON saves pose, coupling mode, palette, visibility, light levels and camera. It is separate from Klipper's G-code state. The trace preview accepts expanded Cartesian, white-light and dual-carriage commands; it stops at unsupported lines. `ACTIVATE_EXTRUDER` does not change the selected carriage. `RESTORE_GCODE_STATE` does not restore lights, colors, active hotend, IDEX mode or unselected heads. Applying a mode or restoring a viewer configuration initializes the trace interpreter.

The preview does not execute extrusion, heaters, homing, probing, independent Z tilt, Jinja or complete RatOS/Klipper macros. Cable routes follow continuously, but slack and hanging service loops are proposed representations, not verified cable lengths or contact/stiffness simulations. Fixed extrusion/panel travel boundaries and IDEX head separation were inspected. Full bracket/electronics and moving-body collision coverage is not provided.

## Native assemblies and source revisions

[RATRIG_ASSETS.json](../site/RATRIG_ASSETS.json) records each official share URL/version URN, source kind, native import filename, file checksums and editable archive. The native assembly named by `native_import_file` is the completed assembly. Archives retain original STEP and BREP, prepared BREP, source revision, per-part native export/adjustment records and motion/appearance profiles.

V-Core 4.0 300 IDEX is explicitly derived from the official 300 Hybrid frame/bed/rails and official IDEX modules; it is not an official complete 300 IDEX assembly. The completed 4.1 300 CoreXY omits an unused second X block. The completed 4.1 400 Hybrid omits a duplicate CoreXY belt. Original representations remain as hidden source references and native archive records. Documented local cap/orientation adjustments include SO8/umbilical/VAOC cylindrical parts, two 4.1 multi-shell spacers and the 4.0 500 IDEX planar cap. Original and prepared BREP remain distinct.

Official sources: [V-Core 4.0 files](https://wiki.ratrig.com/en/products/v-core-4-0/files), [V-Core 4.1 files](https://wiki.ratrig.com/en/products/v-core-4-1/files). RatOS motion references use [RatOS-configurator 9a820c035a4f112a5c78087ab343b5523be62831](https://github.com/Rat-OS/RatOS-configurator/tree/9a820c035a4f112a5c78087ab343b5523be62831); firmware code is not bundled or executed.

Rat Rig CAD and derived geometry retain [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), based on the [vendor license](https://ratrig.com/products/rat-rig-v-core-4-1#license). Component-specific notices and terms remain applicable. The viewer's software license does not relicense this CAD. Three.js 0.180.0 is MIT; its license and provenance accompany `vendor-r180`.

## Validation and distribution

All eighteen incoming packet hashes and original/prepared BREP were checked. Host tests load real GLBs through the production loader, exercise pose/light/palette controls and configuration restoration, and execute 186 supplied trace fixtures through the UI. The incoming GPU review used the same raw GLB hashes. Host DOM/geometry tests do not themselves provide GPU visual review.

Rat Rig web assets are distributed from the separate [Rat Rig model repository](https://github.com/Psych0h3ad/3d-print-rig-ratrig-models). CAD archives are release assets; model binaries are not stored in source history. The existing printer model bundle stays separately pinned.
