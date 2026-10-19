# Stealthburner cutaway

Open [Inside Stealthburner](https://psych0h3ad.github.io/3d-print-rig/viewer/stealthburner-cutaway.html)
from the toolhead builder. The page combines the public `sb_v6` and
`head_sb_cw2` modules: Stealthburner, Clockwork 2 and E3D V6.

Play or pause the explanation, select a chapter, or scrub the timeline. The
section slider moves from the complete model to a longitudinal cut through
the filament axis. Orbit and zoom remain available. The heater, 4010 hotend
fan, filament flow and heat colors can be toggled independently.

The four chapters cover feed, heating, the heatbreak/heatsink and cooling.
The 4010 axial fan cools the heatsink; the separate 5015 blower cools the
printed plastic through the side ducts. Its source housing and blades remain
fixed. Colored heat and air trails are illustrative, without calibrated
temperatures, CFD, extrusion rates or a print-performance prediction.
Air trails change color after passing the fins to show heat being carried away.

The 83 original part identities and placements are retained. The nozzle uses
a complete tessellation of the same original V6 CAD, including all 22 surfaces
and its 0.4 mm bore. The other 82 parts keep their exported geometry. Stencil
caps follow each source surface and its cavities. Thermal tint applies only
to the cartridge, block, nozzle,
heatbreak and heatsink; switching it off restores source colors. This view
does not alter the downloadable assemblies or register a new machine mount.

The source revisions and GPL-3.0 license links are listed on the page.
Stealthburner/CW2 uses VoronDesign/Voron-Stealthburner
`8bcb9c246fac19d8ac03931ef97fa07c5e5f0f2b`; V6 uses the public
VoronDesign/Voron-Afterburner CAD at
`9ebb6bc38ac3a73d513c1d4beb0f88e9061c9073`.

Run `node scripts/test_stealthburner_cutaway.mjs` for the lesson/controller
contract and `node scripts/audit_stealthburner_cutaway.mjs <assembled-site>
<report.json>` against the exact exported assets. These checks are separate
from browser stencil, lighting, orbit and mobile review, and do not certify
native-solid mounting or thermal behavior.
The actual-model audit also runs from `check_motion_assets.mjs` as a required
release check.
