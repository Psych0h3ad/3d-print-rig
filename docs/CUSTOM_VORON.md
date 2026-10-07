# Custom VORON dimensions

Select VORON / standard in **Change printer**, then choose 500 mm, 1000 mm or the **Half Z** variant under 350 mm.

| Reference | Build area and Z travel |
| --- | --- |
| V2.4 500 | 500 × 500 × 469 mm |
| Trident 500 | 500 × 500 × 250 mm |
| V2.4 1000 | 1000 × 1000 × 969 mm |
| Trident 1000 | 1000 × 1000 × 994 mm |
| V2.4 350 Half Z | 350 × 350 × 165 mm |
| Trident 350 Half Z | 350 × 350 × 125 mm |

Half Z preserves the 350 × 350 build surface and halves the current standard viewer Z travel: V2.4 330 mm and Trident 250 mm. These are custom derived references rather than official VORON kits. Frame sections, rails, panels, bed and printed mounting sections are edited; fasteners, bearings, motors and toolhead hardware retain their native dimensions. The stock Stealthburner / CW2 / Revo assembly is included. Mod mounting interfaces for these custom dimensions are not registered.

At 1000 mm, consider upgrades to the frame and mechanisms. Review frame rigidity, linear guides and drives, bed mass, power requirements and cable routing before a real build. The 1000 mm Trident reference extends its Z guides, lead screws and native-link bed chain; V2.4 uses a 969 mm closed-roof viewer limit. These scaled references have not been tested as printer designs. Original source revisions, component terms and editable solids are supplied in the [1000 mm native source release](https://github.com/Psych0h3ad/3d-print-rig-large-voron-models/releases/tag/voron1000-v1).

The Trident bed-chain upper end retains contacts found in the original CAD between its link, cap and printed mount. Their intended mechanical fit has not been established. Corrected link orientation, mounting alignment and viewer motion do not certify these contacts or full swept clearance; inspect the native solids before adapting this reference for a build.

The viewer supports XYZ motion, palettes, black/silver frame appearance, panel/grid controls, configuration save/load, image export and G-code visual playback. Smooth moving belt and PTFE routes do not reproduce teeth, clamp cuts, tension, electrical behavior or complete physical fit. Trident uses a custom 4.4 mm stationary roof feedthrough for its PTFE preview. Printed lower-chain and electronics mounts include native section extensions to preserve mounting-end geometry. Model-specific changes and upstream source revisions are included in each manifest.

Editable native solids, dimensions, original source revisions, licenses and selected inspection evidence are supplied in the [custom native source archive](https://github.com/Psych0h3ad/3d-print-rig-community-models/releases/tag/custom-voron-v1). The 500 mm V2.4 and Trident pages offer assembled native STEP downloads in the printed R2 / Stealthburner / Clockwork 2 / Revo Voron reference configuration. These custom assemblies are separate from official build sizes; selected Mods, palette changes and motion slider poses are not exported. [STEP assemblies and complete editable native source](https://github.com/Psych0h3ad/3d-print-rig/releases/tag/voron500-assy-v93) include exact upstream revisions and component license notices. Geometry retains upstream and component terms; these selected checks do not certify full-printer swept clearance or a build-ready kit.

## PTFE repair

Trident 500 and 350 Half Z use the corrected `custom-voron-v2` models. The former tube ended 28.975 mm outside its native holder. The replacement uses the holder's measured 4.2 mm bore axis, a straight insertion segment and a straight rise above the head's rear chain mount. Exact native intersections are recorded in [the PTFE inspection](CUSTOM_PTFE_NATIVE_QA.json); the corrected tube solids and reproduction script are in the [model repository](https://github.com/Psych0h3ad/3d-print-rig-community-models/tree/main/site/custom-voron-v2).

Trident 500 uses a constant 1410 mm cut-length route; the Half Z preview retains a variable length. Both preserve the measured head inlet and holder datums. Full swept clearance and material bending remain unqualified.

V2.4 500 adds an external PTFE viewer preview from the measured CW2 inlet, through the native rear exhaust connector and along the spool-side holder's horizontal bore. Two tangent bends guide it away from the head; XYZ movement, reversal and reset regenerate the route. The closed-roof viewer Z limit is 469 mm; the native frame and reference assembly are unchanged. This external preview has variable length and is not included in the source-derived STEP assembly. It is not a physical hose simulation or a complete clearance certification.

## Trident internal spool holder

Standard Trident 300 and 350 offer **Internal spool holder · elcrni** under Additional mods. The [author's v32 design](https://github.com/elcrni/Voron-Mods/tree/b35e4ddcde50adc4f93a1a29342ac467e651f992/Trident_Internal_Spool_Holder) accepts spools up to 200 mm diameter and 75 mm width. The viewer includes the holder, guides, bearings and native fixing hardware. These parts remain fixed to the frame during bed movement. Selected native checks cover the rigid holder and guides over the 0–250 mm bed-down interval; they do not certify the full printer.

A spool body and filament feed route are not included. The external PTFE preview remains independent. SIBOOR 300/350 are not registered for this mounting: their existing slot covers intersect the holder or fixings. Original source revisions, GPL-3.0/component licenses and editable placed solids are in the [internal spool source release](https://github.com/Psych0h3ad/3d-print-rig-large-voron-models/releases/tag/internal-spool-v1).
