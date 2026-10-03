# V0 installed configurations

The V0.2 and V0.2r1 machine page mounts original Mod parts on the printer. Selection replaces the corresponding stock parts, follows native XY or bed Z motion, preserves hardware colors, and supports configuration files. The separate 18-family source library provides original alternatives and their component provenance.

| Mod | Machine | Registered geometry and conditions |
| --- | --- | --- |
| Dragon Burner v8 / Revo Voron / Sherpa Mini R2 | V0.2 / V0.2r1 | Standard and Cat cowls, dedicated hotend and extruder mounts, complete extruder, 3010 hotend fan, twin 4010 blowers, LEDs and mounting hardware. Native rear carriage and hotend holes determine placement. Closed stock-door contact occurs near the front travel end; this is an installation condition, not a collision-free 120 mm travel claim. |
| Rapid Burner v8 / Rapido UHF / Sherpa Mini R2 | V0.2 / V0.2r1 | Standard and Cat cowls with the dedicated UHF mount and complete original hotend. Four M2.5×8 screws fit the four-hole pattern; maximum axis registration error is 0.048 mm. The hotend is clocked 90° to route the wiring outlet away from the carriage. Include the 3010 fan, twin 4010 blowers, extruder and mounting hardware. |
| Kirigami bed | V0.2 / V0.2r1 | Sheet, nut block, wire guide, chain mounts and spacers replace the stock support. Reposition the complete bed stack, springs, adjustment knobs, inserts and leadnut from their seats. Include eight M2×4 rail screws and the native chain fixing hardware. Retain both moving Z rail blocks. Nozzle/bed datums and the chain endpoint update with the selection. |
| Stock and heat-insert X carriage | V0.2 / V0.2r1 | Support-omitted display models. The independent 178.103 mm³ printing support is excluded; the original main-body dimensions, volume and mounting holes are retained. The original source variants remain available. |
| Official Adafruit ADXL345, LIS3DH, generic ADXL345 and LDO ADXL345 mounts | V0.2 / V0.2r1 | Mount, sensor, two spacers and two tapping screws; reuse both stock M3×12 mounting screws. Reference carriage and duplicate fasteners are excluded. |
| Stealth Handles | V0.2 / V0.2r1 | Left/right handles replace the top center clips. Native M3×12 screw copies replace the shorter stock screws. Each unmodified stock side panel intersects the handle by approximately 59.6 mm³; panel-edge relief is required. The geometry is retained so this condition remains visible. |
| Picobilical strain relief | V0.2 / V0.2r1 | Mounting plate only. The original component does not include a PCB, connectors or harness. |
| Cat Flap extrusion tophat | V0.2r1 | Closed original assembly with 45 parts. Replace the stock frame, printed clips, hinges, panels and duplicated frame screws; retain the stock clip mounting hardware. Door opening motion is not registered. |

`site/V0_INSTALLATIONS.json` records native rigid transforms, replacement part identities, appearance roles and source metadata hashes. Models retain their original dimensions. Selected head and bed geometries determine nozzle-to-bed coordinates. Older four-selector saved configurations migrate to the stock head, bed and carriage.

The native eleven-link Z chain remains visible through motion. Every link keeps its original dimensions and rotates about its measured hinge axis. Kirigami moves the bed connector datum by 9 mm in X; the chain solves the endpoint with a fixed 16.7 mm link pitch. This is a routing preview, not a cable bend-radius or chain joint-limit certification.

The stock front door pivots about the measured cylindrical hinge axis from 0–110°. Panel, clips and their hardware remain together through XYZ changes and configuration restoration. The Cat Flap top door and tophat opening are separate mechanisms.

Controller verification covers 864 valid configurations, 576 rejected combinations, 2,592 XYZ poses and two 962-step chain sweeps. Native BREP checks align mounting axes and seats, and inspect installed bodies separately from intended fan retention contacts. The ADXL/strain-relief interface has a native CAD contact sliver below 0.01 mm³; handle/panel interference remains explicitly recorded. Nominal travel-end contacts are retained for inspection. These checks do not certify continuous collision-free travel, physical homing, wiring, electrical compatibility or load capacity.

Sources and licenses:

- [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0/tree/a53fc87562fd630c846af38d7de850c894dc3d85), V0.2r1: GPL-3.0.
- [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0/tree/a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8), V0.2: GPL-3.0.
- [MapleLeafMakers/V0_Stealth_Handles](https://github.com/MapleLeafMakers/V0_Stealth_Handles/tree/55107e204e805705c2ffecff02a147f004e95eb2): GPL-3.0.
- [MotorDynamicsLab/LDOVoron0](https://github.com/MotorDynamicsLab/LDOVoron0/tree/4c543a41f25372adbd4c650e5aab1d722c46461a): GPL-3.0.
- [chirpy2605/voron](https://github.com/chirpy2605/voron/tree/cc2e749d09d7f24418f9f8c73c90bcefb1e29584): GPL-3.0.
- [christophmuellerorg/voron_0_kirigami_bed](https://github.com/christophmuellerorg/voron_0_kirigami_bed/tree/70f0d9dc6186b6221332fb10eb46427437c7602d): Kirigami sheet metal under CC BY-SA 4.0 or GPL-3.0; derived printed parts under GPL-3.0.
- [Annex-Engineering/Sherpa_Mini-Extruder](https://github.com/Annex-Engineering/Sherpa_Mini-Extruder/tree/e95e98dcb83f523c33f022acfd5be4893082ae3c): Annex Engineering EULA; original vitamin terms apply.
- Original Lineux/Rapido component provenance and hardware terms are listed in the sources dialog; printed-body licenses do not replace their terms.

[Editable carriage variants](https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v38/viewer-v0-carriages.zip) provide the three native display bodies, their original revisions, support-omission records and GPL-3.0 text.

Original source archives, individual licenses and component provenance remain available from the viewer's sources dialog. Selection-specific omissions above remove duplicated stock references; the source models remain unchanged.
