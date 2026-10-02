# Stealthburner component combinations

Component menus expose registered alternatives within the selected head. Mount
selection can also choose a registered head supporting the requested mechanism;
the companion changes identify that head change. On a printer they retain the
current gantry. An alternative requiring another
extruder, hotend or mount carries a companion-change label; the committed
selection lists the changes. Probe and board menus remain bound to the selected
mechanical assembly. No unregistered geometry is inferred from a product name.

98 additional SB configurations reuse the registered CW2, Galileo 2 G2E, LGX
Lite, StealthOrbiter and Bondtech CPAP assemblies:

- 26 combinations add the existing Revo/R2 probe carriage or the existing short
  SIBOOR Rapido 2 HF probe mount to registered extruder/cooling alternatives.
- 72 combinations add Beacon RevD/RevH or Cartographer V1–V3/V4 to R2 SB with
  Rapido 2 HF, Dragon SF or Dragon HF, CW2/G2E/LGX Lite and source/CPAP cooling.
  These use 3.0 mm insulating spacers for Rapido HF and 2.5 mm for Dragon.

The eight spacer modules preserve the native carriage, manufacturer sensor and
M3x10 button-head screw dimensions. Probe and screw positions move together;
the spacers retain the original 7 mm outside and 3.4 mm bore diameters. A rigid
0.0003 mm Y correction resolves the native rear mounting-plane discrepancy.
The resulting coil/nozzle gaps are approximately 2.83–2.87 mm. The sensor,
connector, screw and spacer heights are inspected at nozzle contact. Editable
STEP, BREP, module metadata and native QA accompany the source archive.

Body clearance is separate from electromagnetic keepout and full-machine
compatibility. Retained belt-clamp screws enter RevD and Cartographer keepout
volumes; these choices remain labelled comparison previews. RevH clears the
inspected head metal in these configurations. Earlier source assembly body
intersections, unresolved tests and missing wiring/blower/hose details remain
visible. No existing conflict is reclassified as a certified full head.

The examined R2 StealthOrbiter mount intersects the Annex probe carriage, so
those combinations are excluded. V6's heater enters the inspected metal
keepout for all four sensors and is excluded from these added probe options.
UHF requires its own extension/mount; these spacer modules are not stretched or
reused as a UHF registration. The SIBOOR unidentified kit PCB retains its
unverified manufacturer generation and electromagnetic keepout status.

Sources and terms remain separate:

- [Annex SB Beacon carriage](https://github.com/Annex-Engineering/Annex-Engineering_User_Mods/tree/c73acdda56535898fb3aef6b62998388e0c51670/Printers/Non_Annex_Printers/VORON_Printers/VORON_V2dot4/annex_dev-stealthburner_beacon_x_carriage),
  `c73acdda56535898fb3aef6b62998388e0c51670`, GPL-3.0 for the original mount.
- [Beacon manufacturer CAD](https://github.com/beacon3d/docs/tree/bb8e34c6fd7fb3b200c3a2688fee9f4ce8c76278/mcad/beacon),
  `bb8e34c6fd7fb3b200c3a2688fee9f4ce8c76278`, MIT with the included Molex
  subassembly exceptions.
- [Cartographer manufacturer CAD](https://github.com/Cartographer3D/cartographer-probe/tree/bf01749f16f239b5310aaf03e96b18e9dfb9b832/STEP/Cartographer%20Probes),
  `bf01749f16f239b5310aaf03e96b18e9dfb9b832`. Retrieved STEP files do not
  specify a redistribution license; neither the mount GPL nor the viewer GPL
  is assigned to these manufacturer bodies.

Existing extruder/front and hotend licenses and original versions remain in
the public source catalog and respective component archives.
