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
coordinates or resized V0 paths are used. Trident bed-chain visibility depends
on Z only and is independent of toolhead selection. Toolhead reference wiring
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
- V0/Trident bed chains have no articulation away from their source Z pose.
- Existing SIBOOR AWD/R2 per-vertex deformation needs a separate endpoint and
  tooth-spacing audit; these tests do not certify it.
- FYSETC 250 Pro remains a static reference page.
- Full swept collisions, homing contacts, teeth, clamp cuts, tension and
  firmware/macros are outside these checks.

Existing finite-grid V0 contacts at nominal Y/Z limits remain: V0.2 candidate
Y ≤119.07 / Z ≤116.96 mm; V0.2r1 Y ≤119.12 / Z ≤117.17 mm. These are not
continuous swept-volume checks or real-printer endstop guarantees.
