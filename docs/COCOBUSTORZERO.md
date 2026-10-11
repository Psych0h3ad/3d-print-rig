# CocobustorZero

The component viewer includes 35 reviewed public STL exports from
[CoconutDevelopment/CocobustorZero](https://github.com/CoconutDevelopment/CocobustorZero),
revision `052e6c321a7e3fffad5057ce1e9f87de38f0e867` (6 December 2023).
Each file can be selected independently; print-layout coordinates are not
presented as an assembled printer. The six groups load separately.

| Source group | Parts | Preview |
| --- | ---: | --- |
| Coconut V2 AWD | 5 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_awd_coconut_v2&lang=en) |
| ULW X gantry | 6 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_ulw_x&lang=en) |
| Thick belted Z | 9 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_belted_z&lang=en) |
| M4max | 8 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_m4max&lang=en) |
| Coconut air ducts | 1 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_air_ducts&lang=en) |
| Mounts, front idlers and spool holder | 6 | [Open](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=v0mod_cocobustorzero_accessories&lang=en) |

The source is GPL-3.0. Exact public URLs, file hashes and included/excluded
identities are recorded in [COCOBUSTOR_SOURCES.json](../site/COCOBUSTOR_SOURCES.json).
Derived payloads include LICENSE, NOTICE.txt and SOURCE_FILES.json. Source
attribution is retained for Coconut, VoronDesign, LittleTimTim, MathematicalPotato
and Kl3pt; the README also cites 247printing as inspiration.

Conversion preserves source triangles and their winding. The right air duct
is withheld: its eight degenerate facets mask four zero-width boundary cycles.
The belted-Z bed mount is also withheld: auxiliary shells have four nonmanifold
point contacts whose function has not been identified. Normals are recomputed
at unit length. Built-in supports
have not been identified or removed; these are original source-part previews.
STL files do not supply the viewer palette. Base/accent colors follow the
source filenames (`[a]_` denotes accent), with correct sRGB-to-linear conversion.
Archived Coconut V1, unfinished Superwide Stance files and the separate TimTim
AWD exports are excluded from this current Coconut V2 collection.

The public Fusion master archive is available, but its occurrence transforms,
hardware completeness and companion mapping have not been verified. The project
does not supply a completed build manual or firmware profile. Complete printer
assembly, installed motion, belt specifications and native mating/clearance
checks remain open. This collection creates no installed Mod or complete-machine
registration. The README's speed targets are not advertised as verified limits.

The exporter is [convert_cocobustor_sources.py](../scripts/convert_cocobustor_sources.py).
It accepts only the 37-file receipt for this revision, verifies each file's
byte count, Git blob identity and SHA256, and emits six independent glTF payloads.
Source, actual-export and browser review scopes are recorded separately in
[COCOBUSTOR_QA_123.json](COCOBUSTOR_QA_123.json).
