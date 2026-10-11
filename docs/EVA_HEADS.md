# EVA toolhead assemblies

Inspect EVA 2.x and EVA 3.x as complete toolheads and in their source printers. Each registered recipe contains its extruder, hotend, cooling fans, nozzle, probe, printed companion parts and fasteners.

| Generation | Extruder | Hotend | CAD parts | Source printer |
| --- | --- | --- | ---: | --- |
| EVA 2.x | LGX Lite | [Dragonfly BMO](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva125__2__vminion_lgx_bmo&lang=en) | 90 | V-Minion 180 |
| EVA 2.x | LGX Lite | [Dragon (source CAD)](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva129__2__vminion_lgx_dragon&lang=en) | 98 | V-Minion 180 |
| EVA 2.x | LGX Lite | [E3D V6](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva129__2__vminion_lgx_v6&lang=en) | 85 | V-Minion 180 |
| EVA 3.x | LGX Lite | [Rapido HF v1](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva125__3__vcore_lgx_rapido&lang=en) | 123 | V-Core 3.1 300 |
| EVA 3.x | LGX | [Rapido HF v1](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva129__3__vcore_lgx_full_rapido&lang=en) | 138 | V-Core 3.1 300 |
| EVA 3.x | Orbiter 2.0 | [Rapido HF v1](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva129__3__vcore_orbiter20_rapido&lang=en) | 177 | V-Core 3.1 300 |

Open the source printer to switch between these complete recipes: [V-Minion](https://psych0h3ad.github.io/3d-print-rig/viewer/community.html?machine=ratrig_vminion_180&lang=en) or [V-Core 3.1](https://psych0h3ad.github.io/3d-print-rig/viewer/community.html?machine=ratrig_vcore31_300&lang=en). The standalone and installed views use the same recipe and model pins.

Registrations are source-specific. A compatible rail designation alone does not register another printer, belt plane, board or changer. Sampled movement and native mating checks are recorded separately from continuous clearance and firmware validation.

The exact EVA patch versions are unidentified. V-Minion v7 / EVA Assembly v5 and V-Core 3.1 v9 / EVA 3 Assembly v4 identify the source CAD assemblies; they do not establish EVA 2.4.2 or EVA 3.0.2.

EVA is by Paweł Kucmus; the source printer assemblies are by Rat Rig. The versioned public [V-Minion source](https://github.com/Rat-Rig/V-Minion/tree/6811558082d6a1797dac160ca027692cd7904a4b) and [V-Core source](https://github.com/Rat-Rig/V-core-3/tree/4f5d91f42c9a9f7ec346c73728fa6329491aad8c) each publish [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) terms: attribution, noncommercial use and ShareAlike. See their exact [V-Minion license](https://github.com/Rat-Rig/V-Minion/blob/6811558082d6a1797dac160ca027692cd7904a4b/LICENSE) and [V-Core license](https://github.com/Rat-Rig/V-core-3/blob/4f5d91f42c9a9f7ec346c73728fa6329491aad8c/LICENSE). These repository pins identify the public source and license notices, not the native CAD patch versions.

The composed EVA 2 heads also use the official [EVA 2 STEP exports](https://2.eva-3d.page/) at the Onshape microversions recorded in their metadata. That STEP page identifies GPLv3, while the pinned EVA 2 repository LICENSE identifies CC BY-NC-SA 4.0. Both notices are retained separately; the viewer does not infer a common license grant from them. EVA 3 component exports retain their own pinned source notices.

Individual upstream components retain their applicable source terms.

The viewer preserves the original geometry and occurrence placements. EVA 2 metadata is normalized with the pinned V-Minion display origin; two conservative source envelopes are replaced by hash-bound extrema measured on the original trimmed solids, while their original bounds and measurement witnesses remain recorded. The GLB geometry is unchanged. Purchased black polymer has fixed material overrides, independent of the printed base/accent palette. EVA 3 uses native surface tessellation. The two retained stock assemblies have no identified support removals; unidentified support identity remains an open source finding. The composed EVA 2 V6 and Dragon heads remove three and seven source-authored bridge membranes respectively. Their source notices and native removal witnesses identify these edits.

Companion checks reject missing fans, nozzles, probes, hardware or mixed-generation metadata. Hash-bound links return EVA 2 to its original V-Minion assembly. Other machines, belt planes, boards and changers require their own measured installation adapters. The exact historical EVA 2.0.0 is not substituted with later EVA 2.x parts.

Automated exported-model, source-frame, palette/reset and saved-selection checks are separate from browser visual inspection and native-solid review. See [review coverage](MACHINE_REVIEW_COVERAGE.json) and [source identities](../site/EVA_SOURCES.json).

The original stock EVA 3 native review covers its 123 leaves and 328 candidate pairs against the original solids. Five body overlaps and 75 fastener engagement/seating candidates remain unqualified; intended threaded engagement is not classified as a collision-free pass. Native validity, exported mesh quality and correct display do not establish mechanical fit.

Additional recipes, their current model/adapter hashes and tested scope are recorded in [the option review](EVA_OPTIONS_REVIEW_129.json). Recipe count is not proof that all upstream combinations or all compatible printers have been implemented.

The complete Dragon Burner v8 source inputs, companion recipe, derivation scripts and separate license notices are available in the [source supplement](https://psych0h3ad.github.io/3d-print-rig-large-voron-models/head-coverage/dragon-v8-dragon-sherpa-mini/source/dragon-v8-dragon-sherpa-mini-source-supplement.zip). Its original input hashes are recorded; an independent full native rebuild is not claimed.

The [EVA 2 V6 and Dragon derivation sources](https://psych0h3ad.github.io/3d-print-rig-large-voron-models/eva-options-v1/sources/eva2-vminion-lgx-v6-dragon-source-supplement.zip) include the pinned original public inputs, preprocessing and composition scripts, recipes, support-removal records and separate license notices. Archive integrity and input identities were checked; independent reconstruction was not performed.
