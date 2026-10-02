# Monolith in complete printers

The printer gantry selector includes native Monolith configurations for the
machine family and size registered in `MONOLITH_MACHINE_REGISTRATIONS.json`.
Fixed Sphinx and the dedicated Monolith StealthChanger carrier remain separate
mount choices. Existing printer configuration JSON files remain readable.

The gantry workbench links to a complete printer with the selected gantry and
head. Returning from the head builder preserves the machine, size and gantry.
Machine navigation saves the complete configuration ID, including long IDs.

## Required assets

Publish these together with the viewer source, in the asset bundle:

- `GANTRY_CONFIGURATIONS.json` and all of its module metadata and GLBs.
- `MONOLITH_MACHINE_REGISTRATIONS.json` with measured native mounting datums.
- `MONOLITH_BELT_ROUTES.json`, exported from the pinned smooth source belts by
  `scripts/export_monolith_belt_routes.py NATIVE_OUTPUT DESTINATION` using
  CadQuery Python.
- Existing complete-head and machine registration assets.

The machine registration contract is:

```json
{
  "machines": {
    "MACHINE_ID": {
      "family": "VT or V2",
      "size_mm": 350,
      "translation_mm": [0, 0, 0],
      "stock_hidden_keys": [],
      "bed_min_xy_mm": [0, 0],
      "datum_checks": {},
      "x_delta_limits_mm": [-170, 170],
      "y_delta_limits_mm": [-180, 165],
      "z_delta_limits_mm": [-40, 240],
      "hidden_module_keys": [],
      "part_offsets_mm": {},
      "gantry_ids": [],
      "gantries": {}
    }
  }
}
```

Values above illustrate the schema, not mounting coordinates. Translation is
from Monolith's native assembly coordinates into machine CAD coordinates.
`bed_min_xy_mm` is required for Trident's display coordinates. Optional
`gantry_ids` limits choices; omit it to expose all matching native assemblies.
Optional `gantries[id]` overrides machine registration fields per configuration.
`x_delta_limits_mm` and `y_delta_limits_mm` keep complete bearing blocks inside
their native rails. `z_delta_limits_mm` bounds V2 gantry displacement from the
registered reference pose, retaining all eight blocks. The actual head nozzle
offset converts these stops to display coordinates. Sliders and adapters use
the same restricted ranges; V2 G-code preview uses the adapter's limits.
Changing back to a stock gantry restores the original machine limits.
`stock_hidden_keys` must include the replaced head, XY assembly and, for V2,
the original Z joints/blocks that are replaced by Monolith's double joints.
`hidden_module_keys` can omit native reference frame members when the machine
already supplies them. Native measurements must justify any per-part offsets.

## Motion

X beam, X rail and XY joints move with Y. The MGN12H block alone moves with XY.
The two MGN9H Y blocks move with Y; their rails remain stationary in XY. V2
adds the common Z translation to the whole replacement gantry, including its
Z joints. Trident keeps the gantry fixed in Z and retains independent bed motion.

The open belt centerlines come from paired native contour edges. Size changes
extend straight spans by native frame increments, retaining pulley radii and
belt width. Head endpoints follow XY and beam idlers follow Y. Fixed Sphinx
ends stop at the registered clamp entrance. The runtime strips are smooth;
clamp return loops, teeth, tension and docking motion are not simulated.

The fixture `scripts/fixtures/monolith-belt-routes.json` is derived from
[Monolith Gantry](https://github.com/Monolith3D/Monolith_Gantry), commit
`5b729c2f96bdbd24ea180a80476364727444c038`, under CC BY-NC-SA 4.0; see the
bundled [license](../site/licenses/monolith_gantry/LICENSE).

## Verification

`node scripts/test_monolith_machine.mjs` checks native open belt routes at 864
poses, constant path length, closed strip topology, widths, native arc radii,
head endpoints, catalog filtering, fixed/SC switching, saved configurations,
builder links and individual bearing motion. Native 300 mm assemblies extend
constant frame sections and repeat full rail-hole periods; Y rail ends are
trimmed equally to 350 mm with 20 mm hole pitch. Original fasteners occupy each
measured hole axis. Native mating planes/axes, NP rear-drive screw/T-slot
registration and guide containment are verified separately in the matching
model-source archive.

`node --experimental-loader ./scripts/three-test-loader.mjs
scripts/audit_monolith_motion.mjs ASSET_BUNDLE OVERLAY REPORT` exercises the
production renderer against exported GLBs. It checks actual part translations,
palette propagation/protected colors, belt visibility and complete removal.
It does not certify the printer mounting datum. Verify that separately against
native mating surfaces/axes, then inspect complete machines in the browser.

Before publishing, verify stock → Monolith → stock, fixed ↔ SC, base/accent/frame
colors, XYZ motion, belt/enclosure toggles, saved configuration restoration and
workbench → printer → builder → printer links for each registered machine.
