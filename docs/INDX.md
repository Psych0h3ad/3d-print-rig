# INDX tools

One Smart Head carries the selected passive tool. Each other tool stays in its own 2020 dock at 41 mm pitch. The standalone workbench accepts 1–9 tools. Machine references have a size-dependent geometric capacity; this is not a certified tool-changing installation.

Each slot can select the source nozzle or CHT 0.4/0.5/0.6/0.8/1.0 mm and standard 0.25/0.4 mm. These choices share Bondtech's simplified external reference. Individual bores and CHT internals are not modeled. Cooling can use the source 4010 or CPAP duct. The open pose is an original CAD comparison, not an exchange animation. Save/load and shared URLs retain tool count, slot choices and active tool.

Original source: [BondtechAB/INDX](https://github.com/BondtechAB/INDX/tree/da2036945ca0d09f44704f78f1681497bcca6b48), GPL-3.0. Models use `CAD/INDX_simplified_1.19.step` and `community/1_printer_agnostic/2020-dock/CAD/dock_2020_1x.step`. The parked tool uses the source open pose translated 8 mm toward the dock; mating magnet faces coincide and the parked nozzle is 2 mm above the closed tool. Original dimensions are retained.

An additional 2020 crossbar uses the constant extrusion profile from [VoronDesign/Voron-2](https://github.com/VoronDesign/Voron-2/tree/a192410e27ea345644ae5c4b29b4c9c40cbe1a73), GPL-3.0. Crossbar lengths are 400/450/500 mm for 250/300/350 references. End fastening, enclosure changes, belt retention and complete docking travel are unverified. No print supports were removed from these selected bodies.

On the current Trident source model, this generic INDX MGN12 position puts the nozzle above the reachable bed plane. The preview stops before the Z carriage leaves its rail and reports the remaining gap. It is a reference arrangement, not a printable Trident INDX conversion. Bondtech's linked Trident R2 conversion needs its dedicated mounting and Z parts.

The v22 source archive contains original-size native BREP parts, verified assembly STEP files, exact source pins, licenses and static body checks. Original component licenses remain separate. Static checks do not certify full travel, automatic docking or electrical operation.
