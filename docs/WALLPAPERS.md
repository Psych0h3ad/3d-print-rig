# CAD-derived wallpapers / Just for fun

[Open the gallery](https://psych0h3ad.github.io/3d-print-rig/fun/) ·
[Original CAD credits](../site/fun/credits.html)

The gallery offers assembly drawings, exploded views, filament-path sections,
multiview sheets and collections/repeating patterns. Phone, desktop and
ultrawide downloads use paper, blueprint and graphite palettes. Current items,
dimensions, bytes, checksums and download packs come from
[`site/fun/wallpapers.json`](../site/fun/wallpapers.json); avoid duplicating totals
in Markdown when extending the collection.

Drawings come from reviewed CAD projections. Strong outer outlines and readable
internal edges show the design; generated decorative geometry is not a source.
Exploded views use illustrative rigid offsets. Sections pass through the
measured filament axis where specified. Incomplete source assemblies retain
their scope: the selected Sphinx section contains printed parts only, and the
selected YUDX assembly has no hotend. These are illustrations, not manufacturing
drawings or assembly-fit certificates.

## Artwork and attribution rules

- Keep resolution/size information in the gallery, filenames and manifests;
  **do not print wallpaper dimensions inside the artwork**.
- Retain original-author attribution. URLs included in the artwork should point
  to the original author's repository. Collection sheets name their authors;
  full source URLs also travel in PNG metadata, gallery entries and manifests.
- Use uniform scaling for layout; do not mirror or distort native drawings.
  Views on a collection sheet can have independent scales. A repeating pattern
  reuses the reviewed views rather than inventing more machine geometry.
- Preserve credits and individual licenses in download ZIPs. Component terms
  remain separate; do not assign one blanket license to every image.
- Review the outline/internal-edge balance and readable labels at actual phone
  and desktop sizes. Avoid broken/faint lines, clipped drawings and text overlap.

## Files and workflows

| Purpose | Files |
| --- | --- |
| Gallery, filters and download links | `site/fun/index.html`, `site/fun/wallpapers.json`, `site/fun/previews/` |
| Original source attribution and notices | `site/fun/credits.html`, `site/fun/licenses/` |
| Collection input hashes and placement records | `site/fun/collection-provenance.json` |
| Original collection packaging | `scripts/prepare_wallpapers.py` |
| Collection/repeating-sheet composition | `scripts/compose_wallpaper_collections.py` |
| Image checks and visual contact sheets | `scripts/check_wallpaper_compositions.py` |
| Append collection downloads and regenerate packs | `scripts/extend_wallpaper_release.py` |
| Source regression | `scripts/test_wallpaper_catalog.mjs` |

The original hidden-line projection/render workspace is an input to these
packaging tools; the source repository alone does not regenerate every base
drawing. Keep the reviewed projections, source manifests and licenses available
before rebuilding. The viewer's decorative background has a separate
[Blender reproduction recipe](CAD_BACKGROUND.md).

For the existing collection-sheet recipes, use the reviewed projection workspace
and new output directories outside the repository:

```sh
python scripts/compose_wallpaper_collections.py --collection ../technical-wallpapers --output ../wallpaper-collections
python scripts/check_wallpaper_compositions.py ../wallpaper-collections
```

These tools require Pillow and NumPy; the current composer/contact-sheet code
uses Windows Bahnschrift/Consolas fonts. Inspect all generated contact sheets and
representative full-resolution PNGs before packaging. Checks cover hashes,
dimensions and layout overlaps, but do not judge line clarity or CAD accuracy.

`prepare_wallpapers.py` reproduces the original 243-file collection and uses a
fixed release tag. It is **not an append command**. The collection composer,
checker and `extend_wallpaper_release.py` describe the later 12-design /
108-image addition. When adding different recipes, update those batch-specific
assertions and contact-sheet selections together; do not relabel a new batch
as a reproduction of the old one.

For the existing addition, `extend_wallpaper_release.py` accepts `--collection`,
`--existing-assets`, `--release-output` and `--tag`. It verifies old PNG hashes,
preserves their existing URLs, writes new previews/provenance, and rebuilds the
packs with credits. It stages local release files and the catalog; it does not
upload them. Verify released PNG/ZIP bytes and links before publishing a catalog
that points to them. Never replace a file behind an immutable old download URL.

Run `node scripts/test_wallpaper_catalog.mjs` and the normal
[publication checks](MAINTENANCE.md). Keep full PNGs/ZIPs and working geometry
outside Git. Confirm the gallery filters, single downloads, format packs and
credits in the deployed site after a wallpaper release.
