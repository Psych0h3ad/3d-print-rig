# Head and parked-tool intersections

The machine viewer reports measured volumetric intersections and offers **Show
intersection pose**. This moves the XYZ controls to the recorded pose and draws
orange bounds around the two affected parts. These boxes are part bounds; the
intersection volume is computed from native CAD, not from the rendered boxes.
Inspecting a pose invalidates any compiled G-code playback. Switching back to
the stock head clears the custom-head evidence and bounds.

The runtime retains these original witnesses after the separately audited Trident rear-deck repair. It checks the exact repair proof, original evidence bytes, current bundle identity and every original input, allowing only the two declared manifest changes. This restores standard Trident 250/300/350 loading while preserving the original findings. No witness for the altered deck is inherited, and this binding adds no native clearance or whole-machine qualification.

`HEAD_VALIDATION.json` retains 561 V2.4 source-configuration installations:
84 complete Sphinx placements across the seven displayed V2.4 contexts, and
253 Xol / 224 Stealthburner placements on the VORON 350 mm printed R2 context.
Original embedded PCB and bare-board variants are treated separately. The
check includes 5,404 unique near-pair native operations and 492 positive
intersection witnesses. A candidate pose with no positive volume is **not** a
certificate for the rest of the travel. Failed operations remain unresolved.
The v34 rear cooling placement adds 14 native fan/machine candidate checks;
none produces a positive volume at the tested pose. Unchanged native files
and relative translation ranges retain their exact previous pair evidence.

The Trident R2 check adds 48 complete Sphinx installations: twelve each on
VORON 250/300/350 and SIBOOR 350 with the printed 6 mm gantry. It evaluates
2,749 distinct native near pairs against the retained base and gantry. Unlike
the V2.4 check, the head remains at a fixed Z and the bed and Z blocks move
by the negative sum of the displayed Z and the signed bed datum offset.
Recorded poses include that datum, the exact XY reference and gantry identity.
Results from this gantry are not transferred to AWD or Monolith.

The Trident envelopes cover 4,729 native inputs. Ten SIBOOR inputs are surfaces
or an invalid original shape; five candidate volumetric operations remain
unresolved. They are not certified as collision-free solids. The production
GLB checks compare both affected parts at every reported body-intersection
pose, including moving-bed fixtures. Repeated findings share immutable
`intersection_witnesses` records; `intersection_ids` resolves the full list
without discarding individual part pairs. Added accessories may restrict Z;
a witness outside their current range is refused rather than clamped.

Examples include the Sphinx extruder plate entering an XY-joint screw at the
right edge, its Sherpa motor entering the roof at maximum Z, and Xol's 4010 fan
housing entering front idler parts. Stock native MGN12H bearing bodies remain
present. Fastener/bearing interfaces, switch contacts and fixed source wire
shapes are reported separately; their volumetric overlap does not establish
either a free-running mechanism or an unintended rigid-body obstruction.

The StealthChanger check additionally evaluates 5,838 unique near pairs between
the parked bank and moving native gantry bodies on the 350 mm printed R2
context. The viewer matches 72 measured conditions to the exact active-head
datum, dock count, slot and retained parked part. This supports mixed and
repeated parked heads without transferring results to unrelated geometry.
One confirmed intersection is sufficient to report a conflict; no bank
configuration receives a complete travel or automatic docking pass.

Native envelopes were checked for 3,158 distinct head-part files. Four inputs
are meshes or surfaces without solid volume, including the Rapido HF heatsink
surface and Orbiter front lever mesh. They are not certified as collision-free
solids. The separate probe travel check remains scoped to probe hardware.

Evidence is tied to the model bundle, raw catalogs, machine manifest, motion
profile and complete head placement. Stale inputs, missing hashing support,
changed modules, changed hidden parts or a Monolith gantry do not inherit it.
The supplied geometry, nominal build volume and upstream licenses are
preserved. There is no silent geometry trimming or reduced-volume fit claim.

Full head travel certification, additional mods, flexible belt/wire clearance,
contact homing, sensing, thermal operation and tool exchange paths are still
outside these checks. G-code playback does not implement general collision
detection. The production DOM/GLB checks exercise selection, witness poses,
part bounds, mixed banks, stale-state clearing and playback invalidation on
the CPU; they do not constitute a GPU or visual review.

Upstream revisions are pinned in the model metadata and source catalog. The
Sphinx body comes from [the author's repository at the recorded revision](https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180),
with its original hotend-specific Voron files. Its documented mounting and
hardware support does not certify clearance against every machine revision.
