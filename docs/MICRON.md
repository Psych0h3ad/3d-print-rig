# Micron reference assemblies

Micron 120 and Micron Plus 180 show the selected AntHead / Wristwatch G2 / Revo Voron examples from [PrintersForAnts/Micron](https://github.com/PrintersForAnts/Micron/tree/f76aa28767211ddfee2e30290aadcea3c45f8513), commit `f76aa28767211ddfee2e30290aadcea3c45f8513`, GPL-3.0. The 120 model combines the R1 v4 body with the registered RC8 head; the 180 model uses the RC8 assembly. They contain 1,074 and 1,512 separate parts respectively. Each page links its own complete assembly STEP ZIP, retaining part names and hierarchy. Displayed colors and motion are not exported into those baseline STEP files.

Vertices contain their world placements. The adapter matches `part_key` to the manifest and applies `[CAD x, CAD z, -CAD y] * 0.001` translations. The bed remains fixed, the gantry moves in Z, the beam in YZ and the head in XYZ. Plus chain frame brackets remain fixed, the upper end follows Z and the PUG clamp follows XYZ. Flexible curves appear only at the source reference pose.

The 120 Z display limit is 95.13 mm; the 180 limit is 165 mm. These limits preserve source guide containment, not a collision-free working envelope. Native source contacts remain in the published collision reports. QGL tilt, homing, automatic flexible routes and hardware control are unverified. These are not exact LDO kits: the Plus example uses Octopus / Meanwell UHP-200. LDO-specific printed parts and component references are uninstalled; the machine page links the BOM comparison. Other toolhead and Mod combinations are not installed in these assemblies.

The release source archive provides placed native BREP files, source file hashes, registration and exclusion records, collision reports and GPL-3.0. Original authors retain their licenses and attribution.
