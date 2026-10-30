# Home page

The project root is a lightweight, six-language entry page for the machine
collection, room planner and component library. Explicit root links carrying
`machine` or `configuration` still enter the viewer with their query and fragment.
Existing `/viewer/` URLs are unchanged.

`site/home/` owns its small message dictionary and controller. The page reuses
existing attributed artwork and model thumbnails and does not load CAD, catalogs
or Three.js. Its layout/component drawings are navigation illustrations, not
manufacturing geometry. The layout planner link identifies the desktop requirement.
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
