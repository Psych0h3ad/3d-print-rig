# Maintaining machines and combinations

Use the [live support index](https://psych0h3ad.github.io/3d-print-rig/support/)
for current choices and [combination support](COMBINATION_SUPPORT.md) for status
definitions. Do not maintain a second hand-counted compatibility matrix in
Markdown. A source catalog may contain options unused by a particular machine;
the production-composed variants determine what is offered there.

## Where changes belong

Paths below are relative to the repository root. JSON catalogs shipped only in
the model bundle are addressed relative to the assembled site root.

| Change | Authoritative inputs and behavior | Update/review alongside it |
| --- | --- | --- |
| Machine, vendor or size | `site/viewer/machines.js` and its imported machine lists; model manifest, motion profile and controller | Availability/reason, correct page and baseline STEP entry; [machine review](MACHINE_REVIEW.md); coverage row and family regression registration |
| Standalone head assembly | `TOOLHEAD_CONFIGURATIONS.json`; `site/viewer/configuration-model.js`; `site/viewer/embedded-boards.mjs` | Exact IDs, real module/visibility differences, author/component terms, probe/head limits; source-only variants retain their limitations |
| Head installed on a machine | `MACHINE_HEAD_REGISTRATIONS.json`; `ASSEMBLY_CONFIGURATIONS.json` or `machines/<machine-id>/configurations.json` for Trident; `site/viewer/machine-head-model.mjs` | Native mating datums, replacement parts, belt width/carriage, nozzle reference, size-specific motion and colors |
| Monolith standalone and installed | `GANTRY_CONFIGURATIONS.json`, `MONOLITH_MACHINE_REGISTRATIONS.json`, `MONOLITH_BELT_ROUTES.json`; `site/viewer/monolith-head-model.mjs` and `monolith-machine-model.mjs` | VT/V2, size, printed/sheet-metal, belt width, drive and fixed/changer registration; [Monolith](MONOLITH_MACHINE.md) |
| V0 installed Mods | `site/V0_INSTALLATIONS.json`; `site/viewer/v0-installations.mjs` | All seven slots, `requires` / `conflicts`, stock replacement, door/tophat/chain behavior; [V0](V0_INSTALLATIONS.md) |
| V0 library or independent accessory | `COMPONENT_LIBRARY.json`, `MACHINE_MODS.json`, catalog accessories | Source-only versus installed status, exclusive groups and required selections; do not infer installation from library membership |
| Parked tools / docks | `TOOLCHANGER_BANK.json`; `site/viewer/changer-bank-model.mjs` | System, gantry and cooling-specific choices, capacity, `bank_permitted`, active slot and saved-state validation; [banks](CHANGER_BANK.md), [INDX](INDX.md), [MadMax](CUTTERS_MADMAX.md) |
| Selection or layout | `site/viewer/configurations.js`, `configuration-draft.mjs`, `configuration-editor.mjs`, workspace modules | Draft versus installed state, companion changes, rollback, save/load, return links, mobile layout; [workspace](UI_WORKSPACE.md) |
| Public support report | `scripts/build_support_catalog.mjs`; `site/support/` | Production composition, strict filter intersections, unsupported reasons, exact links and JSON output; [support maintenance](COMBINATION_SUPPORT.md) |
| Text, sharing or artwork | `localization/`, share/embed modules, `site/fun/`, `site/viewer/art/` | [Translations](TRANSLATING.md), [embed contract](EMBEDDING.md), [wallpapers](WALLPAPERS.md), [background](CAD_BACKGROUND.md) |

## Adding a combination

1. Identify the actual source revision, native bodies, terms and intended scope:
   standalone reference, installed head, installed Mod or parked-tool bank.
   Keep these capabilities separate in the UI and documentation.
2. Register the exact assembly and its measured interface. Shared family names,
   similar bolt patterns or a Cartesian product of menu options do not establish
   compatibility. Preserve source dimensions and document any display omissions.
3. Exercise the production composition functions, including board expansion and
   machine/gantry overrides. Verify the exact configuration is reachable, keeps
   its ID through save/load and links, and has the correct installed geometry.
   Keep existing IDs or provide explicit verified migrations; embeds update live.
4. Cover both acceptance and rejection boundaries: wrong machine/size/belt,
   missing mounting data, conflicting V0 Mods, unavailable docks, capacity and
   explicit unavailable IDs. In the configurator, show companion changes before
   Apply; in the support index, an empty filter intersection stays empty.
5. Review actual exported assets and native geometry under
   [MACHINE_REVIEW.md](MACHINE_REVIEW.md). Record input hashes, poses, findings,
   scope and browser coverage. An accepted selector tuple is not fit evidence.
6. Update the relevant feature document, notices and all supported languages.
   Add a documentation-index link if introducing a new feature document. Rebuild
   the support data and compare it with production composition before publishing.

The support generator includes all machine specifications, including unavailable
ones, and enumerates registered head/gantry variants and valid V0 Mod states.
It records independent accessories and dock support separately; it does not
enumerate their full cross-product. See [counting scope](COMBINATION_SUPPORT.md).

## Build and check

Run commands from the repository root. Use Python 3 and Node.js with
`node:module.register` support; the site bundles its browser dependencies.
Native CAD preparation and artwork rendering have separate dependencies in
their feature documents/source archives.

After editing, stage the intended new files so `git ls-files` can find them.
Regenerate the inventory after the final source/document edits:

```sh
python scripts/update_inventory.py
python scripts/check_repository.py
```

Stage the resulting `docs/SOURCE_INVENTORY.json` too. The publication check
scans tracked files and Git history, validates the inventory and JavaScript,
discovers independent `scripts/test_*.mjs` regressions, and checks translations.
It does not load the full release CAD for every regression.

Build into a **new** directory outside the repository:

```sh
python scripts/build_site.py --output ../rig-preview
node scripts/test_support_catalog.mjs ../rig-preview ../rig-preview/support/data
python -m http.server 8000 --directory ../rig-preview
```

The default build downloads the archive pinned by `site/ASSET_BUNDLE.json`,
checks its size/hash, validates every extracted file and mounting-evidence
input, and generates `support/data/`. To reuse an already downloaded archive:

```sh
python scripts/build_site.py --output ../rig-preview-local --assets ../viewer-models.zip
```

Before using `--assets` for release verification, compare that archive's bytes
and SHA-256 with `site/ASSET_BUNDLE.json`. The local path still verifies the
internal manifest, but bypasses the download's outer archive hash check. Do not
label an arbitrary local bundle as the pinned release.

Keep output models, native source archives, logs and generated reports outside
Git. The build rejects existing output directories and enforces its total site
size budget. Wallpaper originals belong in release assets; only their previews
and catalogs belong in the site.

## Evidence and publication

For a model, registration, renderer or interaction change, run the affected
actual-asset audits separately and retain coverage for every available machine.
Use each audit's argument contract: Monolith audits may take separate source,
overlay and native-overlay roots. Do not pass a directory merely because a
different audit accepts it. [Review requirements](MACHINE_REVIEW.md) describe
the evidence layers and changed-input rules.

A Markdown-only edit keeps the existing model and coverage hashes. Check its
links and claims against current source and rerun the repository publication
check; do not rewrite model evidence to make it look freshly measured. If a
documentation review uncovers an implementation mismatch, repair and review that
implementation separately before making a new behavior claim.

Before publication, inspect the complete staged diff, retain upstream changes,
and verify that source, pinned bundle and evidence agree. Main-branch pushes run
the [source check](../.github/workflows/source-check.yml) and
[Pages build/deploy](../.github/workflows/pages.yml). Confirm their success for
the published commit. Site changes also need checks of the deployed behavior;
local output alone does not demonstrate that Pages serves the new version.

Historical audit counts stay attached to their release or source baseline.
For new evidence, record the actual input identity and scope instead of updating
an old count or changing its date. Link the current generated support report
when the reader needs the present catalog.
