# Motion and flexible geometry

## Registered motion

V0.2 / V0.2r1 XY belts use common tangents and circular wraps at registered CAD
axes. Only the Y-carriage pulley centres move. X changes the clamp position
along the transverse run; Z does not move the gantry. Bed-chain pieces stay
visible during XY travel and are hidden when Z leaves the source pose.

Vanilla Trident 350 R2 now updates both XY belt paths with Y travel. Eight axes
per belt were measured from the native belt solids at VoronDesign/Voron-Trident
commit `a8628f48546948ce1fc15511b7765b7f31f80722`; pulley/bearing or front bolt axes
are checked against the part table before routing. Source back-contact radii
are 6.5 mm at F695 bearings and 6.742203 mm at the toothed pulley/idler.
The latter is the **outer belt back**, not a nominal pulley pitch radius.
The smooth envelope uses centre radii 7.19 / 6.052203 mm respectively. No V0
coordinates or resized V0 paths are used. Trident bed chains use 20 separate native rigid links. Their 17 mm hinge pitch
and both endpoint pivots remain fixed in length while the bed endpoint follows
Z and nozzle-height offsets. They remain visible with custom heads and multiple
INDX docks; only the explicit belt/wiring checkbox hides them. Toolhead reference wiring
still requires its original pose and head.

For V2.4 printed/CNC 250/300/350 and SIBOOR 350, the four fixed Z loops stay
visible throughout gantry travel, including custom head configurations.
Registered A/B belts follow gantry Z at the source XY pose. They hide on XY
travel because dynamic XY routing is not registered there.

These are **closed, smooth routing previews**, 6 mm wide and 1.38 mm thick for
V0 and vanilla Trident. They replace the toothed source meshes in the viewer;
downloaded native geometry is unchanged. Teeth, clamp cuts, pulley rotation,
tension and physical engagement are not simulated. Path length is not a belt
cut-length recommendation. Unsupported cable articulation is disclosed in the
motion panels in Japanese and English.

## Verification

`python scripts/check_repository.py` checks source and synthetic motion. The
belt test checks 482 V0 and 1,442 Trident routes, tangency, width, thickness,
closed mesh seams, fixed axes, length and representative self-crossings.

The actual CAD assets are intentionally outside Git. To audit an assembled
release through the viewer's GLTFLoader:

```sh
node --experimental-loader ./scripts/three-test-loader.mjs scripts/check_motion_assets.mjs <assembled-site-directory> <report.json>
```

| Actual assets | Grid/reference poses | Fine Y sweep |
| --- | ---: | ---: |
| V0.2, V0.2r1 | 216 each | 241 each |
| V2.4 printed/CNC × 250/300/350 | 216 each | — |
| SIBOOR V2.4 350 | 216 | — |
| Vanilla Trident 350 base + R2 gantry | 27 | 701 |

Total: 1,971 grid/reference poses and 1,183 fine-sweep poses, with reset,
show/hide, enclosure, world-transform and registered Trident head-reference
checks. Maximum computed path-length changes were below 2e-13 mm for V0 and
1e-6 mm for Trident. These tolerances measure numerical consistency, not
physical hardware accuracy. Verification here is offline geometry/source/DOM
testing; no browser visual review is claimed.

## Unverified motion

- V2.4 XY routing, CNC A/B belt assets and cable articulation remain incomplete.
- Chain link pitch and endpoint routing do not certify cable bend radii or joint stop limits. The eleven native V0 links now articulate around their measured pin axes throughout Z motion; see [V0 installation checks](V0_INSTALLATIONS.md).
- Existing SIBOOR AWD/R2 per-vertex deformation needs a separate endpoint and
  tooth-spacing audit; these tests do not certify it.
- FYSETC 250 Pro remains a static reference page.
- Full swept collisions, homing contacts, teeth, clamp cuts, tension and
  firmware/macros are outside these checks.

Existing finite-grid V0 contacts at nominal Y/Z limits remain: V0.2 candidate
Y ≤119.07 / Z ≤116.96 mm; V0.2r1 Y ≤119.12 / Z ≤117.17 mm. These are not
continuous swept-volume checks or real-printer endstop guarantees.

The bed-chain route test covers 1,482 positions from a 40 mm raised datum to
330 mm bed descent. Actual GLB checks cover SIBOOR 350 and vanilla
250/300/350 at 4,648 poses, with maximum native hinge separation 0.011084 mm
(the original assembly already has this sub-0.012 mm offset). Link geometry,
scale, fixed anchor and CAD reset are preserved. Offline production UI tests
switch INDX tool counts 1, 3 and the size-specific maximum, active tools, bank
on/off, Z, reference reset and explicit visibility on all four machines.
These checks do not establish cable clearance or an executable tool exchange.

Micron Plus XY tests cover 708 routes with tangent continuity, 6 mm width and
length drift below 0.02 mm, retaining sub-0.1 mm offsets from the RC8 source
pulley placements. Actual Micron 120/Plus geometry checks cover 54 XYZ poses;
Z belts remain fixed and Plus XY belts follow Y/Z. Color, reset and belt
checkboxes are checked through the production controller using an offline DOM.

## StealthChanger seats and Trident fasteners

StealthChanger V1.1 standard 6 mm includes the original belt Keeper. The 9 mm BT123 split Keeper seats on the shuttle before its MGN12H screw lands are registered. Both standard widths use four native M3x12 screws. Dedicated Monolith Keepers use native M3x14 geometry as a CAD depth reference, rather than an upstream hardware recommendation. Four native mounting axes, both Keeper faces, screw seats and modeled hole-end clearance are checked. Original printed-body dimensions are retained. Stock and Monolith reference rails follow the block; no separate rail displacement is used for probe travel or exploded head views. See [attachment scope and limitations](STEALTHCHANGER_MOUNTS.md).

Trident 250/300/350 has one native M3 nut behind every 25 mm X-rail fixing, and the seven X-joint nuts move with the X beam. Thirteen bed-support nuts register to their paired original screws and move with the bed. Actual mesh checks cover 2,700 changer placements and 510 nut poses across all three sizes. Mounting faces and relative motion checks do not certify continuous swept clearance, homing or tool exchange. Existing collision witnesses only remain applicable to unchanged head placements and unchanged fixture parts.

## Micron flexible routing and V2.4 materials

Micron Plus keeps its 18 native 20 mm chain links attached to the fixed and moving pivots. Bed wires remain fixed. PTFE and head wiring use fitting-aligned routing previews at every pose. Straight insertion sections remain coaxial with the measured WWG2, split PUG and PG9 bores, with continuous tangents into the free loops. The PTFE frame inlet stays fixed; the cable's PG9 end follows gantry Z, and both head ends follow XYZ. Service length, bend radii and swept cable clearance are not certified. Actual geometry checks cover whole-Z-range return motion, visibility toggles and reset. The original static author tubes remain in the downloaded CAD.

All six V2.4 250/300/350 printed and LDO reference models apply default or saved palettes during startup and restore defaults through the color controls. Printed materials use zero metalness; protected hardware retains its source color. Actual materials and production controller startup/reset are checked on all six assemblies.

Native fastener checks place the Trident 300/350 spool-holder assemblies on the resized side extrusion and restore the V2.4 300/350 X-beam slot nut to the original beam slot. The 28 finite scan candidates are checked against their assembled supports and native screw axes. Mesh checks cover 432 nut/support poses. The spool nuts retain the original 250 mm CAD modeled contact; these checks establish mounting registration, not a universal zero-collision certificate. Probe travel checks for changed fixture solids are repeated before retaining their certificates.
