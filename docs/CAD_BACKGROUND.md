# CAD-derived background

This document covers the viewer's decorative background. Downloadable assembly,
exploded, section and collection wallpapers have their own
[gallery and maintenance guide](WALLPAPERS.md).

The background uses six hidden-line orthographic projections of actual catalog
meshes: V0.2r1, V2.4, Trident, Micron Plus, the original V2.4 toolhead and its XY
gantry. Geometry and relative part placements are not altered. Transparent
panels are hidden, and the two detail views select existing assembly groups.

The shared interface uses graphite and copper colors with the PR wordmark.

## Reproduction

Use the exact viewer-v34 asset bundle recorded in
`site/viewer/art/cad-background.json`. Extract it outside the source repository.
This is the artwork's pinned input, not a claim that the live viewer still uses
that release. Reproducing this image and rendering a new current-CAD background
are separate operations; update its provenance when changing the inputs.
With Blender 5.2 (Cycles CPU and Freestyle):

```sh
blender --background --python-exit-code 1 --python scripts/render_cad_background.py -- --assets /path/to/extracted/models --output /path/to/outlines
python scripts/pack_cad_background.py /path/to/outlines
```

The packing step requires Pillow. Rendering uses no generated images and no
hand-authored paths. `--only v0` (or another recipe ID) can render one view. Raw
renders and detailed visible/hidden part records stay in the output directory.
The published manifest records input hashes, selections, rendering parameters,
counts and the packed PNG hash. Original CAD, credits and licenses are linked
from `site/viewer/art/credits.html` and the operation guide's CAD credits link.

The browser loads one static PNG and no additional mesh data. The image is
decorative, hidden from accessibility APIs and pointer input, masked away from
the center of the model view, and absent from exported model images. Review
desktop/mobile, light/night views and orbit/camera controls when changing it.
