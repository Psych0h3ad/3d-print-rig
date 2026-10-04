# Sphinx tLW hardware assemblies

Discovery indices point to the author's [Sphinx Toolhead repository](https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180). The displayed mounting bodies come directly from its Voron and Monolith archives at that pinned commit, under CC BY-NC-SA 4.0. They are not models supplied by Awesome Toolheads.

Eight head assemblies combine those original prints with Tricorn Long or the acquired SIBOOR Rapido 2 UHF subassembly, plus [Annex Engineering Sherpa Mini Release 2 Rev1](https://github.com/Annex-Engineering/Sherpa_Mini-Extruder/tree/e95e98dcb83f523c33f022acfd5be4893082ae3c). Sherpa uses the standard front, with separate short and long idler alternatives. The K front intersects the tLW floor/main body and is excluded. This is the printed Sherpa housing, not a CNC product approximation. The Annex EULA, Tricorn CC0 terms and kit CAD's unstated redistribution terms remain separate from the Sphinx print license.

The 90 source bodies in the new modules retain their original dimensions under rigid transforms; the two generated PTFE interface tubes are explicitly labeled references. Extruder bottom, motor mating face, hotend seat and screw axes are registered independently. Rapido's four allowed mounting orientations were compared with the native Sphinx body: two intersect heater connection parts and two clear them. The selected orientation retains every acquired hotend body.

The Voron variants register to existing 6 mm machine catalogs using the MGN12H mating plane and four 20 × 20 mm screw axes. The maximum bore-axis discrepancy is below 0.002 mm, and the original head prints do not intersect the native rail block. Separate Monolith print variants register to native Monolith 6/9 mm carriages and printer gantries. No 9 mm SIBOOR AWD combination is inferred from the standard Voron clamps.

The native static checks retain a 0.0195 mm³ intersection between the supplied motor envelope and the original Sherpa bracket and show it as a minor source intersection. Duct-to-bed clearance at nozzle contact is approximately 2.90 mm for Tricorn Long and 3.20 mm for Rapido 2 UHF. These are static geometry measurements, not thermal, airflow or full-travel certification. CPAP blower/hose, toolboard, fan mounting fasteners and wiring are absent. Other source-only mounting patterns remain labeled references.

Every air-cooled Sphinx pattern displays a native 25 × 25 × 10 mm axial hotend fan, rigidly placed from the pinned Xol assembly on the tLW rear seat at Y = 0.210375 mm, facing the heatsink. Its four 20 mm screw axes align with the finite 7 mm insert bores opening at that seat. The fan reference retains its existing analytic seam repair and dimensions. The rear seat, actual bore depth, physical contact and open corridor toward the heatsink were inspected across all ten source mounting bodies, along with native body intersections for assembled Tricorn/Rapido UHF, Short/Long Sherpa and Beacon/Cartographer hardware. The 2510 source is reversed 180 degrees about Z before placement. No brand, voltage, measured airflow or thermal result is inferred. The updated rigid placement and native component are in the viewer-v34 cooling source archive. Its source remains under the Xol component terms, separate from the Sphinx printed bodies.

The eight assembled head patterns now offer no probe, manufacturer Beacon RevH Normal, or Cartographer V4 Standard. Both probes mount directly to the author's integrated underside seat with the original 31.6 mm hole pitch and native M3x6 button screws. Cartographer V4 coil/nozzle gaps are 2.625 mm (Tricorn Long) and 2.925 mm (Rapido 2 UHF); Beacon RevH gaps are 2.600 and 2.900 mm. The closest physical sensor/connector/screw body remains at least 0.89 mm above the nozzle contact plane. Static native CAD checks cover the printed bodies, hotend, extruder, fan and complete manufacturer metal keepout; inspection volumes are excluded from physical part counts. Heat-set insert detail, wires, probe operation and complete machine travel are unverified. Probe coordinates follow the same transforms as the physical modules through both Monolith carriage and machine registration.

Beacon's MIT and embedded connector exceptions, and Cartographer's acquired CAD terms, remain separate. Original versions, hashes and corresponding edited native component assemblies are supplied in the component source archive.

Native modules, source identifiers and registration data are provided in the separate Sphinx source archive. The standard-machine STEP download policy is unchanged.

Dedicated Goliath Air/Water assemblies, sensor heights, water-cooling differences and the separate Short WC reference are documented in [Goliath](GOLIATH.md).

## Archived V3 and Single Inlet

The same [pinned author repository](https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180) supplies these archived generations separately from current tLW. Select Sphinx, then choose V3 WS7040 / WS9290 in Cooling. Ten new hardware combinations are available on the head page and standard 6 mm VORON machine mounts:

| Author body | Hardware hotend | Extruder alternatives |
| --- | --- | --- |
| Tricorn 7040 / 9290 | Tricorn Long | Sherpa Mini R2 Standard Short / Long |
| Goliath / CHC XL 7040 / 9290 | Goliath Air | Sherpa Mini R2 Standard Short / Long |
| Rapido UHF Sherpa 9290 | Acquired Rapido 2 UHF | Sherpa Mini R2 Standard Short / Long |

V3 uses its own measured MGN12H plane and four 20 × 20 mm bore axes. The native block contacts the bracket without body intersection. Tricorn rotates 90 degrees and Goliath 270 degrees about the cold-end axis relative to initial registration, preserving dimensions and seats. All eight resulting native hotend/body/extruder/fan assemblies clear static body checks. Rapido retains minor 0.101 / 0.078 mm³ connector/body intersections, explicitly shown as source CAD contact. Alternative quarter-turn orientations create larger intersections and are excluded. Printed-body clearance at nozzle contact is about 1.90 mm (Tricorn), 5.15 mm (Goliath), 2.40 mm (Rapido).

V3’s 2510 hotend fan uses its own seat, distinct from tLW. Native plane, lower screw axes and body clearance are checked; upper holes retain author slots. Tricorn uses the matching archived Rapido/Tricorn bracket, with native body contact. Remote WS blowers, hoses, toolboards, mounting screws and wiring are absent. V3 probe substitutions, Monolith and 9 mm clamps are not inferred. Full-machine travel and thermal behavior remain unverified.

Single Inlet on the head page uses a corrected Orbiter 2 / Tricorn / Beacon assembly. The extruder is lowered 3.388 mm onto its seat; only the motor rotates 180 degrees about its shaft, and the author's Orbiter upper support replaces the Sherpa support. A local clearance relief in the rear printed bracket preserves its mounting bores and rail plane. All 85 parts remain; 1,718 static category pairs have no exterior intersection above 0.001 mm³. The final bracket/gearcase clearance is 0.0804 mm, which does not certify manufacturing tolerances. The native axial hotend fan remains absent, and source Beacon shape/position is retained without modern metal-keepout certification. This standalone derivative is excluded from machine choices; the original reference remains available in earlier source archives.

The v45 source archive supplies pinned files, native placed parts, registrations and scoped geometric reports. No integrated print supports are removed. Sphinx CC BY-NC-SA 4.0, Annex EULA, Orbiter CC BY-NC-SA, Tricorn CC0, Goliath CC BY-NC 4.0 and fan terms remain separate. Existing tLW variants and mounting evidence are preserved.
