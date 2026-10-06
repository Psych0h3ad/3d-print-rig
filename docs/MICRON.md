# Micron reference assemblies

Palette regression now checks both actual 120 / Plus exported models with
contrasting base/accent/frame colors, reversal, reset and all-axis endpoint
movement. Anonymous native panel clips, handles and printed 64T gear bodies
are resolved by their assembly identities. Manufactured descendants of a
printed parent (washers, rail blocks, ECAS fittings and power-supply parts)
remain protected. Accent assignments follow the author's `[a]` print library.
Native linear RGB is restored for 54 purchased leaves whose old exported
materials had already inherited a printed parent's palette. The pinned material
map checks native source identities before use. Printed NEMA motor mounts and
M2 nut adapters remain printed parts; their names do not make them hardware.
`scripts/audit_micron_colors.mjs <assembled-site> <report.json>` records current
model hashes and every material checked; fixture tests alone are insufficient.

Micron 120 and Micron Plus 180 show the selected AntHead / Wristwatch G2 / Revo Voron examples from [PrintersForAnts/Micron](https://github.com/PrintersForAnts/Micron/tree/f76aa28767211ddfee2e30290aadcea3c45f8513), commit `f76aa28767211ddfee2e30290aadcea3c45f8513`, GPL-3.0. The 120 model combines the R1 v4 body with the registered RC8 head; the 180 model uses the RC8 assembly. They contain 1,074 and 1,512 separate parts respectively. Each page links its own complete assembly STEP ZIP, retaining part names and hierarchy. Displayed colors and motion are not exported into those baseline STEP files.

Vertices contain their world placements. The adapter matches `part_key` to the manifest and applies `[CAD x, CAD z, -CAD y] * 0.001` translations. The bed remains fixed, the gantry moves in Z, the beam in YZ and the head in XYZ. Plus chain frame brackets remain fixed, the upper end follows Z and the PUG clamp follows XYZ. The eight Z drive belts remain at their fixed pulley positions during XYZ movement. The Plus two XY belts use the RC8 face arcs to update their common-tangent routes with Y, and follow gantry Z. They are smooth 6 mm envelopes; teeth, clamp cuts and tension remain unmodeled. Plus chain links follow their native pivots; PTFE and umbilical display routes retain straight sections through their fitting bores. Printed AB drives, clamps, idler carriers, extruder parts, split PUG clamps and panel locks use the base/accent palette; optical diffusers, fittings and hardware keep their source colors. The displayed umbilical cable is black.

The Plus PTFE inlet is aligned to the actual WWG2 4 mm fitting, replacing the older source tube axis displaced by approximately 1.15 mm. Its straight outlet extends beyond the fitting lip. The umbilical remains coaxial through the entire split PUG and the 15-degree PG9 gland; it bends after clearing the clamp. PTFE's frame endpoint stays fixed, the cable gland follows only Z, and both head outlets follow XYZ. Continuous tangent routes are used at every pose, including reset, without switching back to the misaligned source tube. Downloadable author CAD remains unchanged. These are routing previews; service length, manufacturing cut length, minimum bend radius and swept interference are not certified.

The 120 Z display limit is 95.13 mm; the 180 limit is 165 mm. These limits preserve source guide containment, not a collision-free working envelope. Native source contacts remain in the published collision reports. QGL tilt, homing, cable/chain articulation and hardware control are unverified. These are not exact LDO kits: the Plus example uses Octopus / Meanwell UHP-200. LDO-specific printed parts and component references are uninstalled; the machine page links the BOM comparison. Other toolhead and Mod combinations are not installed in these assemblies.

The release source archive provides placed native BREP files, source file hashes, registration and exclusion records, collision reports and GPL-3.0. Original authors retain their licenses and attribution.
