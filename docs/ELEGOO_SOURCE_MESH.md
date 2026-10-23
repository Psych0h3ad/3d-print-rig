# ELEGOO source assemblies

Neptune 3, 3 Pro and 3 Plus use the manufacturer's pinned GPL-3.0 3DXML
assemblies. Repository revisions, original source links and asset hashes are in
`site/viewer/elegoo-catalog.mjs`. These are static reference assemblies; motion,
Mod installation and physical fit are not certified.

The Pro and Plus display exports omit 660 and 776 exactly zero-area triangles,
respectively. No nonzero triangle, position, normal, color, material, part or
placement is changed. This is an index-only display filter, not a CAD repair.
Original exports remain available at the catalog's `zero_facet_source` URLs.
Each new assembly manifest records original counts and omitted facet IDs under
`mesh_export_filter`. Original upstream facet orientation and opaque vertex
colors remain unchanged. The Neptune 3 export is unchanged.

To reproduce a filtered export, install Python 3 and NumPy 2.4.4, download the
catalog's original model and manifest, then run:

```sh
python scripts/filter_elegoo_zero_facets.py --model model.glb.gz --manifest assembly_manifest.json --profile machine_profile.json --output filtered
```

Use a new output directory. `scripts/check_elegoo_assets_release.py` separately
replays every retained triangle and attribute against the pinned original
exports using the production viewer loader. The source regression includes
nonzero triangles down to Float32 subnormal coordinates so an area threshold
cannot silently remove small features. Native-solid clearance and browser
rendering require separate review.
