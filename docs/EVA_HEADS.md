# EVA toolhead assemblies

Inspect two EVA generations as assembled toolheads, with native part placements, cooling, probes, rail blocks and fasteners.

| Source assembly | Parts | Configuration |
| --- | ---: | --- |
| EVA 2.x · V-Minion 1.0 v7 / EVA Assembly v5 | 90 | LGX Lite · Dragonfly BMO · 4010 hotend fan + 5015 part fan · M8 inductive probe |
| EVA 3.x · V-Core 3.1 v9 / EVA 3 Assembly v4 | 123 | LGX Lite · Rapido HF v1 · 4010 hotend fan + Sanyo 4028 part fan · SuperPINDA |

[Open EVA 2.x](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva125__2__vminion_lgx_bmo&lang=en) · [Open EVA 3.x](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=eva125__3__vcore_lgx_rapido&lang=en)


These previews preserve their source-machine configurations. Mounting on other printers, toolchanger interfaces and clearance throughout a complete motion path have not been verified.

The exact EVA patch versions are unidentified. V-Minion v7 / EVA Assembly v5 and V-Core 3.1 v9 / EVA 3 Assembly v4 identify the source CAD assemblies; they do not establish EVA 2.4.2 or EVA 3.0.2.

EVA is by Paweł Kucmus; the source printer assemblies are by Rat Rig. The versioned public [V-Minion source](https://github.com/Rat-Rig/V-Minion/tree/6811558082d6a1797dac160ca027692cd7904a4b) and [V-Core source](https://github.com/Rat-Rig/V-core-3/tree/4f5d91f42c9a9f7ec346c73728fa6329491aad8c) each publish [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) terms: attribution, noncommercial use and ShareAlike. See their exact [V-Minion license](https://github.com/Rat-Rig/V-Minion/blob/6811558082d6a1797dac160ca027692cd7904a4b/LICENSE) and [V-Core license](https://github.com/Rat-Rig/V-core-3/blob/4f5d91f42c9a9f7ec346c73728fa6329491aad8c/LICENSE). These repository pins identify the public source and license notices, not the native CAD patch versions.

Individual upstream components retain their applicable source terms.

The viewer preserves the original geometry and occurrence placements. EVA 2 metadata is normalized with the pinned V-Minion display origin; two conservative source envelopes are replaced by hash-bound extrema measured on the original trimmed solids, while their original bounds and measurement witnesses remain recorded. The GLB geometry is unchanged. Purchased black polymer has fixed material overrides, independent of the printed base/accent palette. EVA 3 uses native surface tessellation. No identified built-in supports were removed; support identity remains an open source finding.

Companion checks reject missing fans, nozzles, probes, hardware or mixed-generation metadata. Hash-bound links return EVA 2 to its original V-Minion assembly. Other machines, belt planes, boards and changers require their own measured installation adapters. The exact historical EVA 2.0.0 is not substituted with later EVA 2.x parts.

Automated exported-model, source-frame, palette/reset and saved-selection checks are separate from browser visual inspection and native-solid review. See [review coverage](MACHINE_REVIEW_COVERAGE.json) and [source identities](../site/EVA_SOURCES.json).

The native EVA 3 review checks all 123 leaves and 328 candidate pairs against the original solids. Five body overlaps and 75 fastener engagement/seating candidates remain unqualified; intended threaded engagement is not classified as a collision-free pass. Native validity, exported mesh quality and correct display do not establish mechanical fit.
