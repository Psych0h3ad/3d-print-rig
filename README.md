# 3D Print Rig

[English](https://psych0h3ad.github.io/3d-print-rig/viewer/?lang=en) · [日本語](https://psych0h3ad.github.io/3d-print-rig/viewer/?lang=ja) · [Español](https://psych0h3ad.github.io/3d-print-rig/viewer/?lang=es) · [한국어](https://psych0h3ad.github.io/3d-print-rig/viewer/?lang=ko) · [Русский](https://psych0h3ad.github.io/3d-print-rig/viewer/?lang=ru) · [License](LICENSE) · [Third-party notices](docs/THIRD_PARTY_NOTICES.md)

Compare printer, toolhead and gantry configurations in 3D.

## Explore

- [Viewer](https://psych0h3ad.github.io/3d-print-rig/viewer/): choose a machine and size, inspect its CAD, colors and registered motion. Shared printer/head/Monolith configuration controls show proposed changes before **Apply**; V0 uses its own Mod controls.
- [Combination support / 組み合わせ対応状況](https://psych0h3ad.github.io/3d-print-rig/support/): filter the current registered combinations, inspect installation and dock limitations, and open a matching configuration. Includes stock-only and CAD-unregistered specifications. [Status definitions and scope](docs/COMBINATION_SUPPORT.md).
- [Just for fun](https://psych0h3ad.github.io/3d-print-rig/fun/): CAD-derived assembly, exploded, section and collection wallpapers for phones, desktops and ultrawide screens. [Credits and maintenance](docs/WALLPAPERS.md).
- [Embed a viewer](docs/EMBEDDING.md): Share → Embed creates a responsive iframe. **Alpha test**; future viewer/model updates apply while registered machine and configuration IDs are retained.

Assembled STEP downloads cover standard VORON V2.4 R2 and Trident R2 in
250 / 300 / 350 mm, Micron R1 120 and Micron Plus R1 180. Use the viewer's
**Standard STEP** menu for the matching baseline assembly. These downloads
do not export the currently selected custom head, Mods, colors or pose.

Registration describes what the viewer can display. It does not certify
physical fit, full travel or automatic tool exchange. A head available on its
own may still lack a machine mounting registration; installed-head support and
parked-tool bank support are separate. Native CAD terms and component licenses
remain separate from the viewer software license.

## Documentation and development

[Documentation index](docs/README.md) · [Adding and maintaining combinations](docs/MAINTENANCE.md) · [Review requirements](docs/MACHINE_REVIEW.md) · [Translations](docs/TRANSLATING.md)

The static site source is in `site/`; large CAD models and editable source
archives are distributed as release assets. The build uses Python 3, Node.js
and the model bundle pinned in [ASSET_BUNDLE.json](site/ASSET_BUNDLE.json).
Run from the repository root, choosing a new output directory:

```sh
python scripts/build_site.py --output ../rig-preview
python -m http.server 8000 --directory ../rig-preview
```

Open `http://localhost:8000/viewer/` or `/support/`. Building downloads the pinned
model bundle, validates its contents and mounting evidence, then generates the
support index. A source-only `site/` preview lacks those models and generated
support data. New site files must be staged because the build copies tracked
files. See [maintenance](docs/MAINTENANCE.md) for local bundle use, validation
and publication steps.
