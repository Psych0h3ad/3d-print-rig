Trinity Crossbow native source references

Martin-Ivanc/Trinity-Crossbow-Cutter @ 231a16281d6d34b1b3b0ee8b65ae0b4f00fde7e7
https://github.com/Martin-Ivanc/Trinity-Crossbow-Cutter
WV-design/Trinity-toolhead @ d17a5c9fad6f21fd4a3a9869d498656b4b03d1dc
https://github.com/WV-design/Trinity-toolhead
DW-Tas/Crossbow-Filament-Cutter @ 5395af65bed8c26566069b7009b9a7f8b7a05bb5
https://github.com/DW-Tas/Crossbow-Filament-Cutter

Martin-Ivanc and WV-design printed designs: GPL-3.0. Crossbow CNC hardware by DW-Tas: CC BY-NC-SA 4.0. Prooda is credited for the Chube Compact adaptation. Annex Sherpa Mini Release 2 Rev1 @ e95e98dcb83f523c33f022acfd5be4893082ae3c retains the Annex EULA. Embedded manufacturer geometry retains its own terms; the application license does not relicense this CAD.

Ten hardware source variants include native Sherpa Mini R2 at the measured seating plane / 43.5 mm mounting axes. Construction logo negatives are omitted. Six Chube ducts have trim/topology repairs; the maximum volume delta is below 0.02 mm3, bounds unchanged. Fan, probe, nozzle and cutter are source bodies. No model has been certified for complete machine travel, sensing, continuous cutter motion, wiring or physical operation. Original CAD and editable upstream source are linked at the recorded commits in each model metadata.

Extruder mounting fasteners: native Annex ISO 7380 M3x16 screws replace the source M3x12 screws or fill missing mounts. Their 43.5 mm axes and underside seating plane match Sherpa Mini R2. Source parts and rigid transforms are recorded; no generic hardware approximation is used.

The Monolith Chube 9–10 mm cutter/guide subassembly is moved rigidly 0.25 mm to match its native mounting-hole axes with the body and extruder. Editable native solids, assembly transforms and component-specific licenses are provided in [the corresponding source archive](https://psych0h3ad.github.io/3d-print-rig-toolhead-models/trinity-native-source.zip).

Standard Trinity and native component references
WV-design/Trinity-toolhead @ d17a5c9fad6f21fd4a3a9869d498656b4b03d1dc
https://github.com/WV-design/Trinity-toolhead
Four source bodies cover v1.54 MGN12 and archived v1.41 MGN9, each in 6 and 9-10 mm belt versions, with native Annex Sherpa Mini R2 standard/short at measured seat and mounting axes. The v1.54 9-10 mm reference omits the overlapping older extruder, MGN9 block, 6 mm clips/belt and alternative Voron clamps; original solids are retained in corresponding source. Construction logo negatives are omitted. Some Chube ducts/bodies require native topology repair; per-part volume changes and bounds are recorded. Twenty-one separate component references preserve Klicky mounts, 2020 pretensioner, Xol/Fly SHT36 V2 board assemblies, Apex clips, Prooda Chube variants, Zerodegree79 Magneto variants and cpp0xc0ffeeee Heatcore parts. Incomplete source hardware is not advertised as a complete head. Printer installation, tolerances, motion, probe sensing/clearance and cutter actuation are unverified. Printed designs retain GPL-3.0 and authors; Annex and embedded manufacturer bodies retain their original terms. Editable corresponding native solids and placements are in the trinity-standard-native-source-{legacy,mgn12,extras,chube,magneto}.zip packs listed in ASSET_INDEX.json at https://psych0h3ad.github.io/3d-print-rig-toolhead-models/
Armchair Heavy Industries A4T WW-BMG bodies embedded in the Magneto references retain CC BY-NC-SA 4.0; see licenses/Armchair-Heavy-Industries/LICENSE. This records the embedded part identity and license, without asserting a separately verified upstream geometry revision. The original model geometry remains pinned to the WV-design commit above.
The archived MGN9 variants retain the original seated M3x12 mounting screws; M3x16 would bottom in those blind holes. The MGN12 variants use native M3x16 through the square nuts.
