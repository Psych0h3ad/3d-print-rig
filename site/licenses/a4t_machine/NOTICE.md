# A4T on Xol carriage

Original authors: DW-Tas / Armchair Heavy Industries; VoronDesign for the
native DIN562 square-nut reference. Assembly placements: 3D Print Rig.

A4T: https://github.com/Armchair-Heavy-Industries/A4T
Revision e1fc27113bb3061458f528db837d517c35e0b88a, CC BY-NC-SA 4.0.
Xol: https://github.com/Armchair-Heavy-Industries/Xol-Toolhead
Revision c00b13ef851d38fef6e295e18296650e1ca50d7e, CC BY-NC-SA 4.0;
embedded component exceptions retained.
Archetype: https://github.com/Armchair-Heavy-Industries/Archetype
Revision 152709791048d67aab45ea7b774cc16c2a25efd0, CC BY-NC-SA 4.0.
Square nut: https://github.com/VoronDesign/Voron-Stealthburner
Revision 8bcb9c246fac19d8ac03931ef97fa07c5e5f0f2b, GPL-3.0.

The existing native A4T/Sherpa/fan/hotend assemblies remain separate.
New configurations add the original Xol carriage, its rail fasteners,
washers, heatsets, pins and separate 6 or 9 mm belt clamps. Six A4T
mounting fasteners use original native shapes with rigid placements.
The 4 mounting axes agree within 0.00001 mm; the two native mating planes
have positive contact areas. No model is scaled or deformed to fit.

Each original square nut contacts the native cowl by about 0.728 mm3;
each hanging screw contacts the native cowl by about 0.049 mm3.
These source geometry contacts are retained, not treated as clear or as
a manufacturing-tolerance certificate. No external intersection was
detected between the carriage body and the added mounting fasteners.

Rapido HF is rigidly rotated about its filament axis to clear the original
heater-wire references from the carriage. All 16 hotend bodies retain
their dimensions; four symmetric native mounting screws are retained.
The source cowling/duct contacts remain recorded in the existing head
inspection. Only finite renderer poses and static native interfaces are
checked. The rotated Rapido retains four flexible wire-reference contacts
with the left 4010 fan (maximum about 0.845 mm3); its physical wiring route
is unverified. Front idlers, continuous travel, wiring, probes, cooling behavior
and automatic tool changing are not certified. This is a fixed-carriage
preview; no StealthChanger or Monolith installation is implied.

Six separate manufacturing supports from the original A4T cowling are
omitted as already documented. No additional body material is removed.
LEDs, backflow inserts, toolhead board, external wires and probes are absent.
The author's stock front-idler and Cartographer CNC-carriage warnings
are preserved. Chube manufacturer integration references retain their
existing notice; no new redistribution license is assigned to them.

Individual source licenses and native source records accompany the
archive. No single license is assigned to all included components.
