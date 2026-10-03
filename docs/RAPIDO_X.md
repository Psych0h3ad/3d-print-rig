Rapido X uses Phaetus native CAD at revision
`bc1207931f3d0f51955f3dc03a226a77a79d6581`.
It is a separate hotend, with its own mounting geometry, rather than a renamed
Rapido 2 or ACE. The component viewer switches between the main four-bolt body
and the separate GrooveMount adapter.

Stealthburner / CW2 uses the manufacturer's dedicated front/rear 3MF meshes.
The source print-plate positions are replaced with registered mounting planes
and bore axes. The maximum measured bore-axis offset is 0.038641 mm, with at
least 1.3 mm radial clearance for nominal 2.5 mm screws. The native front mesh
is not watertight; it is preserved rather than rebuilt into a different solid.
The new metal is checked against the analytic common SB/CW2 parts. Source
shell/fan/CW2 contacts are still disclosed. Complete mesh/body certification,
fastener engagement, full travel, wiring and cooling performance are not asserted.

Sphinx tLW uses the actual Rapido X body with Sherpa Mini R2, the rear 2510
hotend fan, and optional Cartographer V4 or Beacon Rev H. The hotend is rotated
180 degrees about X and 225 degrees about Z in the source coordinate system.
The alternative 45/135-degree orientations intersect the tLW printed body's
corner by 3.025489 mm3; the selected orientation clears both native Voron and
Monolith print sets. No hotend scaling or local body cuts are used.
The separate GrooveMount adapter is omitted for four-bolt mounting.

At the nozzle-contact plane the Cartographer coil is 2.624643 mm above the
nozzle; Beacon is 2.600000 mm above it. Native sensor bodies and metal keepouts
are checked against the placed hotend. The existing Sherpa motor/bracket
source contact remains, and complete printer motion is not certified.

The model bundle and corresponding CAD archive are pinned in PUBLIC_CATALOG.
The archive supplies original and prepared hotend STEP separately, original
and placed SB mount STL, native module parts, and source/geometry provenance.
The common analytic SB STEP excludes the two mesh-only cartridge parts.
The manufacturer repository does not provide an explicit CAD redistribution
license. Voron and Sphinx terms remain separate and are not applied to Phaetus.
