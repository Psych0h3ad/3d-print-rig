# StealthChanger attachment scope

The displayed printed V1.1 attachment is **MGN12H block → selected belt Keeper → shuttle**, with four M3 screws passing through the shuttle and Keeper into the carriage. The detachable tool carries its own backplate and three 4 mm pins, which engage the shuttle's three bushes. The Keeper is an optional spacer for an MGN12 printed shuttle; this viewer currently selects the Keeper arrangement. It is not a direct, spacer-free mount or a CNC shuttle configuration.

The original author's [mounting description](https://stealthchanger.com/hardware/stealthchanger/) states that the Keeper advances the head by about 5–6 mm and is only compatible with the printed shuttle. The [original BOM](https://github.com/DraftShift/StealthChanger/wiki/Bill-of-Materials) lists M3×12 for that standard Keeper arrangement. Separate BT123 9 mm and Monolith inverted-belt Keepers retain their own measured mating faces and source pins.

| Displayed interface | Current native screw geometry | Insertion into native block | Clearance to cylindrical hole end |
| --- | --- | ---: | ---: |
| Standard 6 mm | M3×12 BHCS | 2.600 mm | 1.775 mm |
| Standard 9 mm / BT123 | M3×12 BHCS | 2.600 mm | 1.775 mm |
| Monolith 6 / 9 mm | M3×14 BHCS, geometric reference | 3.160 mm | 1.215 mm |

The former M3×16 standard and M3×20 Monolith display bolts extended into solid material beyond the modeled mounting holes. The current screws replace those bodies using unchanged native bolt shapes and rigid placements; printed bodies, Keepers, pins, bushes, reference carriages, and installation datums are unchanged. The standard M3×12 body comes from the pinned DraftShift DragonBurner backplate source; the Monolith M3×14 body comes from the pinned PrintersForAnts AntHead Papilio assembly. Monolith's selected length is a native-CAD depth fit, not an upstream hardware recommendation or certification of a real bearing's tapped-hole depth.

The current CAD checks inspect all sixteen bolt axes, head seats and hole-end margins. Forty-eight distinct shuttle/backplate interfaces cover 432 pin positions at 0 / 1.5 / 3 mm. Maximum pin/bush axis discrepancy is 0.000401 mm. Straight pin engagement is 4.5 mm at the seated pose and 1.5 mm at the displayed 3 mm lift; rounded tips are excluded from this measurement. Those numerical observations do not certify a permitted probe stroke or preload.

**Residual head/counterbore interference:** the original split-shuttle upper counterbores are 5.526 mm in diameter, while the displayed native button heads are 5.700 mm. Their radial overlap is about 0.087 mm. The current standard 9 mm screws intersect the shuttle by 0.671–0.672 mm³ each at the two upper heads; Monolith 6/9 mm intersects by 0.508 mm³ each. Similar upper-head interference existed with the former hardware. This is retained and flagged, not considered a clear mechanical fit or silently removed by resizing the screws or printed source. Standard 6 mm has only approximately 0.0064 mm³ per screw at the native seat transition. Actual head dimensions, printed bore allowance and material tolerances need a separate hardware/print check.

The assembly is a comparison reference. Missing shuttle magnets, preload adjustment, belt retention and tension, material/shrinkage tolerances, retention loads and executable docking are not certified. Existing head/backplate body-intersection warnings remain applicable. A clear fixing-bolt depth does not make those head configurations mechanically compatible.

Standard fixed docks remain unavailable on Trident: the retained geometry intersects the bed at the nozzle plane and Trident lacks the original head-side Z exchange motion. See [bank scope and dedicated Trident alternatives](CHANGER_BANK.md). V2.4 banks remain arrangement previews with individual intersection witnesses, not fully validated tool exchange paths.

Printed V1.1 sources: DraftShift/StealthChanger `50e3c769297b273ac390fb33b455aa7f4dfe3099` (GPL-3.0). Native 14 mm bolt source: PrintersForAnts/AntHead `249f64302ed1f159e79e3ee07682fea8e0644288` (GPL-3.0, embedded component terms retained). Editable current modules and the native bolt references accompany the v47 source archive; older source archives retain their historical version and dimensions.
