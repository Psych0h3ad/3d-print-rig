# FilamATrix and MadMax

The toolhead and printer selectors include these source assemblies:

| Mount | Head | Extruder | Hotend | Machine interface |
| --- | --- | --- | --- | --- |
| FilamATrix | Stealthburner | Clockwork 2 or Galileo 2 G2E | Revo Voron, Rapido v1 HF, Rapido v1 UHF, Rapido 2 UHF | Standard 6 mm MGN12H |
| MadMax | Xol | Sherpa Mini | Rapido 2 UHF | Standard 6 mm MGN12H, Andrewmcgr plate |

These entries use dedicated native printed bodies. A cutter-equipped head replaces its ordinary extruder housing and hotend cartridge; those bodies are never superimposed. Knife holder, blade, spring, cutter arm, extruder internals and motors are included. Electronics, wiring and cutter motion are not modeled. The gantry-side Beefy Depressor is available in the component library as a separate source assembly; it is not installed at an arbitrary printer location.

The independent CW2 cutter-arm bridge support is omitted. Its native solid volume matches the detached support in the source print STL. No cutter-arm production geometry is scaled or cut. The source module metadata records that selection. Native trim tolerances repaired in the source Revo front, G2E carrier and carriage retain their recorded dimensions and volume within the published tolerances. The source native collision report remains visible; a source assembly is not automatically a fit pass.

MadMax's MGN9H and MGN12H Maxwell interfaces are separate choices on the toolchanger page. The Dragon Burner / AntHead interface entries show coupling parts, rather than asserting that a completed hotend and extruder are installed. Andrewmcgr's Xol / A4T plate uses its own carriage and dock bracket. The completed Xol head is a separate head-selector entry. The source rail attachment and Xol plate axes are registered without scaling. No 9 mm or Monolith inverted belt keeper is inferred from the 6 mm clamp.

The standard Trident 250 Xol / Sherpa Mini / Rapido 2 UHF selection uses the measured original source2 carrier datum and four source315 screw seats. The screw correction is approximately 0.2 mm; original geometry and hardware materials are preserved. Configuration changes restore the original source placement before applying a new selection. [Native joint evidence](MADMAX_NATIVE_JOINT_101.json) covers this local rail attachment only. Four collapsed triangles inherited from the original screw meshes remain recorded. The whole head, parked tools, docks, belts, travel clearance and other sizes are not certified by this correction.

MadMax supports Trident: the original design uses XY-only exchanges with gantry-attached docks, without a Liftbar. The upstream README lists completed Trident builds, and Andrewmcgr's Xol/A4T modification documents testing on Trident 350. This differs from the standard StealthChanger fixed-dock arrangement, which cannot be exchanged by a Trident head without a horizontal conversion or moving docks. The MadMax selector and saved state use a distinct exchange system. Its unregistered machine dock bank is shown separately from the standard StealthChanger bed-collision restriction. On 6 mm Trident configurations, the bank panel links directly to the registered MadMax Xol head.

FilamATrix and the registered MadMax Xol assembly can be placed on the available VORON Trident and V2.4 6 mm machine references. They are not offered on SIBOOR AWD 9 mm. Their static head bodies and attachment datums are checked separately from printer-wide travel. Door clearance, wires, sensor keepouts, continuous cutter stroke, docking paths and physical operation remain unverified. MadMax docks are separate references, not a multi-tool bank installed on the frame.

Sources:

Rapido uses its four-bolt heatsink attachment. The optional groove adapter, collet and their retaining screws are omitted from HF v1 and UHF v2 assemblies. Unrouted heater lead references that cross the source carriage are omitted; the module records each selected native solid, its bounds and volume. The heatsink, heater and nozzle retain their original geometry. Small supplied body intersections remain visible as measured native contacts.

- [thunderkeys/FilamATrix](https://github.com/thunderkeys/FilamATrix/tree/eefd18fe21a0bcfcb08b4f6f3735ef200cbcb4a3), native v5 assembly; GPL-3.0. This is the credited derivative of [sorted01/Filametrix](https://github.com/sorted01/Filametrix), not a renamed copy of that repository. The original project and IRTrail's G2E work remain credited. Embedded VORON, Galileo and manufacturer references retain their own terms.
- [zruncho3d/madmax](https://github.com/zruncho3d/madmax/tree/277a63cbb696f937fbf9d883a8d8c46a658cd6d9), v11 coupling interfaces and Andrewmcgr's original Xol / A4T user Mod; GPL-3.0. Xol and Sherpa geometry retains its separately pinned sources and licenses.

The corresponding editable native modules and source records are provided in the release source archive. The default-machine STEP download menu is unchanged.

Editable sources contain native BREP parts and assembly metadata. Generated STEP is included only for assemblies passing analytic round-trip validity, body count, volume and dimension checks. Original author CAD remains linked at its exact source commit.
