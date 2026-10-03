# Probe mounting and machine travel

Complete-head and parked-tool intersection counterexamples are reported
separately in [Head travel](HEAD_TRAVEL.md). A probe travel pass does not
suppress a head-body conflict.

Sphinx Beacon RevH / Cartographer V4 and the registered fixed Xol Beacon
RevD / RevH / Cartographer V1–V3 / V4 mount assemblies are checked against
seven displayed V2.4 stock assemblies: VORON printed and LDO CNC reference
models in 250/300/350 mm, plus the SIBOOR 350 mm model.

The check groups source combinations by identical probe module placement and
nozzle coordinates. This produces 168 distinct geometric cases: 28 Sphinx and
140 Xol. They cover the external probe geometry of 1,064 registered source
configuration installations. Extruder and head-body differences remain subject
to their separate local checks; this count is not a pass for entire printers.

Native CAD envelopes were read and validated for 8,739 retained machine solids,
396 probe/mount/fastener solids and 14 manufacturer keepout inspection solids.
The checked envelopes contain their native geometry. Flexible source routes
and the replaced stock head are excluded; retained rail/carriage hardware is
included.

The continuous check covers the Cartesian slider ranges, not just sampled
poses. Swept bounding envelopes first prove separation. Close pairs use native
face distances, subdivision and the translation-distance Lipschitz bound.
Closed-solid containment is checked explicitly. The required separation margin
is 0.01 mm; unresolved cells cannot pass. Metal keepout checks conservatively
include stock frame/hardware bodies and exclude identified printed and panel
parts.

The viewer shows **Probe rigid-body travel checked** only for the matching
machine, source configuration, probe module, rigid placement, nozzle datum and
pinned input data. A changed model bundle, catalog, registration, machine
manifest or motion profile leaves the original unverified state. Changing
gantries or moving a previously checked probe clears its machine evidence.
Existing head-local height, physical and metal conflicts retain priority.

This check excludes additional mods, the head body, moving belts, cables,
homing contacts, docking, actual sensor operation and thermal effects. The
complete machine remains unverified. Source geometry, upstream licenses and
source revisions are unchanged. Exact input hashes, ranges, tested pair counts
and scope are recorded in [MOUNT_VALIDATION.json](../site/MOUNT_VALIDATION.json).
