# SOVOL SV08

[Open the SV08 350 reference](https://psych0h3ad.github.io/3d-print-rig/viewer/community.html?machine=sovol_sv08_350).

The manufacturer’s complete assembly contains 719 native parts. The viewer
offers camera, palette, theme, grid, configuration-save and image-export controls.
XYZ movement is available in the Motion tab. Toolhead/mod swapping is not
registered for this reference. See [native motion](NATIVE_MOTION.md).

The display mesh retains the native CAD tessellation, including fan blades,
threads and rail details. Only zero-area triangles are omitted; no mesh
decimation is applied.

Four Z carrier seats and their mounting axes are aligned to the source gantry.
The gantry/head are displayed 10 mm above the source pose; the inspected nozzle
has about 8.03 mm clearance above the bed. Seven overlapping source instances
and two unconnected PTFE/wire routes are optional references. No built-in
supports were removed. The two smooth native XY belt envelopes follow the
registered pulley contacts; source teeth and cut ends are not synthesized.

Native tensioner 355 has invalid topology. It remains a display mesh; the
mounting-axis/seat observations do not certify its solid clearance. This
reference does not certify full printer fit or continuous motion.

Source: [Sovol3d/SV08 at a606448](https://github.com/Sovol3d/SV08/tree/a60644875f8c756d20b3828c9416518b414b5491),
under GPL-3.0. The [model repository](https://github.com/Psych0h3ad/3d-print-rig-community-models)
contains the original-source pin, conversion recipe, placement overrides,
license, changes and scoped native inspection record. See
[machine review](MACHINE_REVIEW.md) for release evidence requirements.
