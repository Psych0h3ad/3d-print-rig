# Native assembly motion

TicTac 2.1, THE 100 v1.1, Rook MK2, Satsuma180, SOVOL SV08, Annex K1/K2/K3
and FYSETC V2.4 Pro 250 have XYZ movement controls. The Motion tab provides
individual axes, a reversible inspection animation, pause and reset. Saved
configurations retain the axes and camera; Annex and FYSETC also retain their
available appearance settings. These controls preview the registered native
assembly, without firmware or alternative toolhead/mod installation support.

Axis values are millimetre offsets from the displayed CAD pose, not homing or
G-code coordinates. Travel is limited to the inspected source guide and chain
range. Satsuma's complete bed assembly starts 4 mm below its source pose to
clear the nozzle; reset restores that corrected display assembly.

Registrations in `site/viewer/motion-profiles/` pin the decoded model SHA-256
and every native part ID. The loader rejects a changed or incomplete model
instead of applying an old motion assignment. Source assets, dimensions and
hardware materials remain intact. Rails, blocks, fasteners and bed components
use separate motion groups. Native chain bodies and caps move rigidly around
their measured hinges.

## Source limitations

- THE 100's source omits belts and the complete Bowden route. TicTac contains
  ten bed-chain links and only two Z-chain links. Missing hardware is not
  synthesized.
- Satsuma, SV08 and FYSETC XY belts use the source's smooth envelopes and
  pulley-boundary registration. Native width and mesh faces are retained;
  teeth, cut ends absent from the source, tension and exact tangency throughout
  movement are not simulated. Rook and Annex retain native Cartesian loops.
- FYSETC cable/PTFE routes deform as display envelopes. Their lengths and bend
  radii are not constrained by a physical cable solver. Native chain assembly
  offsets are retained at reset.
- SV08 keeps duplicated components and unconnected source PTFE/wires as
  optional references. Existing source topology issues remain documented in
  [SOVOL](SOVOL.md).

## Verification scope

Actual exported models are tested separately from registration fixtures.
Checks cover part identities, native rigid displacement, visible finite
geometry, unit normals, new triangle collapse, belt width, rigid chain pitch
and endpoints, reversal, reset and hardware palette isolation. Transition
sampling is refined to at most 5 mm per axis.

Selected native rail/block solids and the nearest head/bed solids are also
inspected. Browser review covers the changed movement controls and selected
poses. These observations do not certify every fastener thread, flexible-route
clearance, continuous frame clearance or modification combination. Current
model/registration hashes and inspection scopes are recorded in
[release coverage](MACHINE_REVIEW_COVERAGE.json).
