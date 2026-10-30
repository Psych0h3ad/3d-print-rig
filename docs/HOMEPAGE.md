# Home page

The project root is a lightweight, six-language entry page for the machine
collection, room planner and component library. Explicit root links carrying
`machine` or `configuration` still enter the viewer with their query and fragment.
Existing `/viewer/` URLs are unchanged.

`site/home/` owns its small message dictionary and controller. The page loads
static WebP images rather than CAD, catalogs or Three.js. All three destination
panels use actual registered-model or planner WebGL exports with one background,
1200 × 750 canvas, framing treatment and link row. They contain no schematic
navigation drawings. `site/home/render-scenes.json` records the source scenes,
output image hashes and processing scope. These renders do not certify physical
fit. The layout planner link identifies the desktop requirement.
The theme switch shares the viewer preference, with light and dark styles.
The shared brand links in the viewer, machine gallery and planner return home.

Analytics uses the existing versioned, expiring consent record. No choice means
no measurement; the privacy page provides the choice UI. An existing grant is
honored only on the production origin, with a canonical root path and fixed
page title. Review exclusion, privacy signals and withdrawal remain effective.
See [analytics](ANALYTICS.md) and run `node scripts/test_homepage.mjs`.

The page introduces configuration tools; it does not certify mechanical fit,
complete STEP exports or all component combinations. Original sources retain
their own terms. Business use is accompanied by the existing sponsorship request.
