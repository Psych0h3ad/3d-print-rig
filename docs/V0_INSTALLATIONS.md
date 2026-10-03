# V0 installed configurations

The V0.2 and V0.2r1 machine page mounts selected original Mod parts on the printer. Selection replaces the corresponding stock parts, follows native X/Y motion, preserves hardware colors, and supports configuration files. The separate 18-family source library remains available for variants whose complete machine installation is not registered.

| Mod | Machine | Registered geometry and conditions |
| --- | --- | --- |
| Official Adafruit ADXL345, LIS3DH, generic ADXL345 and LDO ADXL345 mounts | V0.2 / V0.2r1 | Mount, sensor, two spacers and two tapping screws; reuse both stock M3×12 mounting screws. Reference carriage and duplicate fasteners are excluded. |
| Stealth Handles | V0.2 / V0.2r1 | Left/right handles replace the top center clips. Native M3×12 screw copies replace the shorter stock screws. Each unmodified stock side panel intersects the handle by approximately 59.6 mm³; panel-edge relief is required. The geometry is retained so this condition remains visible. |
| Picobilical strain relief | V0.2 / V0.2r1 | Mounting plate only. The original component does not include a PCB, connectors or harness. |
| Cat Flap extrusion tophat | V0.2r1 | Closed original assembly with 45 parts. Replace the stock frame, printed clips, hinges, panels and duplicated frame screws; retain the stock clip mounting hardware. Door opening motion is not registered. |

`site/V0_INSTALLATIONS.json` records native rigid transforms, replacement part identities, appearance roles and source metadata hashes. Geometry is loaded from the existing model bundle without changing dimensions. The registry does not authorize arbitrary alternative bodies from a source library as complete installations.

Native BREP checks aligned the mounting axes and Cat Flap frame datums. The ADXL/strain-relief interface has a native CAD contact sliver below 0.01 mm³. This is recorded separately from the handle/panel interference. These checks do not certify continuous collision-free travel, physical homing, wiring, electrical compatibility or load capacity.

Sources and licenses:

- [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0/tree/a53fc87562fd630c846af38d7de850c894dc3d85), V0.2r1: GPL-3.0.
- [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0/tree/a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8), V0.2: GPL-3.0.
- [MapleLeafMakers/V0_Stealth_Handles](https://github.com/MapleLeafMakers/V0_Stealth_Handles/tree/55107e204e805705c2ffecff02a147f004e95eb2): GPL-3.0.
- [MotorDynamicsLab/LDOVoron0](https://github.com/MotorDynamicsLab/LDOVoron0/tree/4c543a41f25372adbd4c650e5aab1d722c46461a): GPL-3.0.
- [chirpy2605/voron](https://github.com/chirpy2605/voron/tree/cc2e749d09d7f24418f9f8c73c90bcefb1e29584): GPL-3.0.

Original source archives, individual licenses and component provenance remain available from the viewer's sources dialog. Selection-specific omissions above remove duplicated stock references; the source models remain unchanged.
