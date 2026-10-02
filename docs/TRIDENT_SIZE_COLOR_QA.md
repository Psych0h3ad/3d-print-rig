# Trident sizes and V2.4 color coverage

## Corrected behavior

- Standard VORON Trident now selects and loads 250, 300 and 350 mm assemblies.
- Each size uses its own base, gantry, belt axes, display limits, endstop reference offset, frame fixtures and head registrations.
- HEX palette changes apply immediately; saved palettes are isolated by size. Existing 350 mm palette settings remain readable.
- V2.4 printed front idlers, Z bearing blocks, belt clamps/drives/tensioners, skirt guards, door handles and several supports now follow the palette. Hardware, LDO replacement aluminium and optical diffusers retain their original materials.

## Native geometry

The pinned Voron-Trident source is `a8628f48546948ce1fc15511b7765b7f31f80722`, native 250 mm assembly. `prepare_trident_size_assets.py` uses a separate preparation workspace and output directory. Fasteners, carriages and mounts translate rigidly. Extrusions and sheets receive central/perimeter section inserts. Rail hole patterns repeat at their native pitch; 350 mm Y rails use a 60 mm insertion followed by 5 mm trimming at each end.

| Size | Base parts | Gantry parts | X rail | Y rails | Fixing holes X / Y |
|---|---:|---:|---:|---:|---:|
| 250 | 856 | 361 | 300 mm | 300 mm | 12 / 15 each |
| 300 | 856 | 369 | 350 mm | 350 mm | 14 / 18 each |

All generated BREP parts are valid. Analytic rail hole axes and unchanged fastener axes agree within 0.001 mm. STEP and GLB outputs accompany the native generation. The browser bundle includes gzip GLBs, manifests, profiles and configurations.

`prepare_trident_size_catalogs.py` registers new sizes from generated geometry and a published bundle. Its `TRIDENT_SIZE_REGISTRATIONS.json` contains only the new machine entries and handle assets for merging into newer head/mod/bank registries. Do not overwrite unrelated registry entries with its preview snapshots.

## Verification

- `audit_v24_colors.mjs`: actual GLBs for all six V2.4 size/structure pairs; 8,316 mesh materials; two contrasting palettes, protected material preservation and original-color restoration.
- `audit_trident_sizes.mjs`: actual 250/300/350 base and gantry GLBs; 3,673 part meshes, 3,606 belt routes sampled every 0.5 mm over Y travel; finite geometry, tangent contacts, constant length, noncrossing routes, closed seams, bed/guide motion and fixed frame positions.
- 344 registered head variants per Trident size. Size-specific gantries persist in expanded catalogs. Stock nozzle/bed reference gap is zero. Existing conventional StealthChanger dock restrictions remain enforced; INDX uses the correctly sized crossbar and existing limitation messages.
- Browser: 250 → 300 → 350 through the machine selector; Trident 300 at X=300, Y=0, Z=250; stock → fixed Sphinx → INDX → stock; bed fans, handles and shifted Disco lighting; palette edits and reload. V2.4 300 palette survives reload with protected material changes = 0.
- Repository publication checks and regression suite passed.

## Limits

These checks verify geometry registration and viewer behavior. Belt clamp return paths, tension, teeth, full swept collision, electrical homing thresholds and flexible wiring are not simulated. The existing SC/INDX physical mounting limitations remain visible. This change does not certify those assemblies as printable.
