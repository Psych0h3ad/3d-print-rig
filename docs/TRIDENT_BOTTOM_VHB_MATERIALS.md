# Trident bottom-panel tape materials

The standard 250, 300 and 350 mm Trident viewers preserve the original material
of the six bottom-panel VHB sheets when the printed-part palette changes.
Their adjacent printed hinges and clips still follow the base color.

The identities come from [VoronDesign/Voron-Trident revision a8628f48](https://github.com/VoronDesign/Voron-Trident/tree/a8628f48546948ce1fc15511b7765b7f31f80722)
and the bottom-panel assembly on page 290 of its manual. The two hinge sheets
are source leaves 1171 and 1174; the four clip sheets are 1177, 1180, 1183 and
1186. Each is a separate leaf with an exact owning component path. A printed
parent does not classify its purchased adhesive descendant as printed.

The normal source-map release gate checks all three standard sizes against the
actual exported sheets and printed owners. Contrasting, reversed and restored
palettes must preserve the attached adhesive materials. Recolored or altered
adhesive material slots fail the check. Geometry, original materials, placement
and visibility are restored after inspection.

This is a display-material correction. It does not change geometry, qualify
adhesive strength or mounting clearance, or cover the separate door-hinge and
handle tape, vendor kits, custom sizes or CNC assemblies.
