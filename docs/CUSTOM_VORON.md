# Custom VORON dimensions

Select VORON / standard in **Change printer**, then choose 500 mm or the **Half Z** variant under 350 mm.

| Reference | Build area and Z travel |
| --- | --- |
| V2.4 500 | 500 × 500 × 480 mm |
| Trident 500 | 500 × 500 × 250 mm |
| V2.4 350 Half Z | 350 × 350 × 165 mm |
| Trident 350 Half Z | 350 × 350 × 125 mm |

Half Z preserves the 350 × 350 build surface and halves the current standard viewer Z travel: V2.4 330 mm and Trident 250 mm. These are custom derived references rather than official VORON kits. Frame sections, rails, panels, bed and printed mounting sections are edited; rigid hardware retains its dimensions. The stock Stealthburner / CW2 / Revo assembly is included. Mod mounting interfaces for these custom dimensions are not registered.

The viewer supports XYZ motion, palettes, black/silver frame appearance, panel/grid controls, configuration save/load, image export and G-code visual playback. Smooth moving belt and PTFE routes do not reproduce teeth, clamp cuts, tension, electrical behavior or complete physical fit. Trident uses a custom 4.4 mm stationary roof feedthrough for its PTFE preview. Printed lower-chain and electronics mounts include native section extensions to preserve mounting-end geometry. Model-specific changes and upstream source revisions are included in each manifest.

Editable native solids, dimensions, original source revisions, licenses and selected inspection evidence are supplied in the [custom native source archive](https://github.com/Psych0h3ad/3d-print-rig-community-models/releases/tag/custom-voron-v1). The custom references do not add standard STEP download entries. Geometry retains upstream and component terms; these selected checks do not certify full-printer swept clearance or a build-ready kit.

## PTFE repair

Trident 500 and 350 Half Z use the corrected `custom-voron-v2` models. The former tube ended 28.975 mm outside its native holder. The replacement uses the holder's measured 4.2 mm bore axis, a straight insertion segment and a straight rise above the head's rear chain mount. Exact native intersections are recorded in [the PTFE inspection](CUSTOM_PTFE_NATIVE_QA.json); the corrected tube solids and reproduction script are in the [model repository](https://github.com/Psych0h3ad/3d-print-rig-community-models/tree/main/site/custom-voron-v2).

The viewer uses the same hollow 4 × 3 mm route at rest, during movement and after reset. The native reference and browser preview share the inlet, roof passage and holder datums. Motion is a geometric route preview: tube length varies with XY, and full swept clearance and minimum bend radius are not certified. V2.4's source assembly contains the internal head PTFE segment but no external Bowden tube; it is not counted as a verified external route.
