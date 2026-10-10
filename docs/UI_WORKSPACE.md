# Viewer workspace

The shared viewer shell makes the model and its main controls available together.
Machine and workbench entry pages share navigation, control categories and a
responsive layout; the available controls depend on the loaded controller.
See the [support index](COMBINATION_SUPPORT.md) for current configurations.

The model corner credits project sponsor **Watchtower by YGK3D**. Open the
credit to visit its website, Kickstarter, YouTube channel or introduction video.
The provided horizontal logo appears on a small dark backing in both themes;
phones use the provided circular mark beside the sponsor name. The native
details control opens with Enter or Space, Escape closes it and returns focus,
and clicking outside closes it. Embedded viewers omit the credit.

The two assets in `site/assets/sponsors/` come from the user-supplied
`watchtowerlogos.zip`, with explicit authorization for this sponsor attribution.
The artwork and delivery bytes are unchanged, with no recoloring, resampling or
personal metadata. The PNG is already losslessly optimized; larger originals
are not shipped. The README uses the circular SVG, whose opaque indigo tile
keeps its white mark visible in both GitHub themes. Total asset size is 319,447
bytes. Source entry names and delivery SHA-256 hashes are:

| Source entry | Delivery asset | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `watchtower-sponsor-horizontal-transparent.png` | `watchtower-horizontal.png` | 318,543 | `4393090a3181c6ddc6078790110303a7d13b67440685d08c88b78691f76d288b` |
| `watchtower-circle-logo.svg` | `watchtower-circle.svg` | 904 | `05bb64f57821335192d2fe32ea7f89a3de49c39503ad7e707bafe43658659b10` |

- Machine selection opens in a dialog instead of occupying the configuration panel.
- Configuration, appearance, motion/inspection and reference tabs separate tasks. Empty categories are hidden.
- Registered printer configurations group gantry/mount, head/drivetrain and probe/cooling/electronics choices. Mount choices are accessible without an advanced-settings toggle. Configuration save/load controls remain in the panel footer.
- The mobile layout places the model above the settings. The settings can fold down to expose more of the model.
- Camera presets show their selected state. The operation guide includes touch gestures and keyboard shortcuts: 1 for isometric, 2 for front, 3 for top/side and 4 for the head where available.
- Tabs support arrow keys, Home and End. Native dialogs provide Escape dismissal and focus restoration.

## Choosing a configuration

The shared printer/head/Monolith configurator keeps a draft separate from the
installed 3D configuration. Choose several parts, review the before/after list,
then **Apply** once. Changes required in other parts are marked as companion
changes. **Discard** restores the menus to the displayed assembly. After a
successful application, **Restore previous configuration** restores the previous
configuration and its saved extras.

Menus distinguish choices that preserve the other parts from those requiring
companion changes. Part search uses those same live choices. The Monolith
family/size/structure/belt/drive controls also stage a draft. Every draft names
one registered variant; arbitrary option cross-products are not constructed.

The current-configuration summary describes the installed model. Draft choices
do not change the installed CAD or committed URL. Save is disabled while changes
are pending or loading; the mobile footer keeps Apply/Discard accessible. Import
and explicit configuration links install their validated configuration directly.
An installation error attempts rollback and offers retry; a failed rollback must
not claim that the previous assembly is still visible.

V0's seven Mod slots use their own validated installation controller and apply
selections directly. Independent accessory, appearance and motion controls also
retain their own behavior. The shared draft flow does not imply that every
control on every machine waits for Apply.

The support page serves a different task: its filters report the strict
intersection of registered options. If no tuple matches, it explains that the
combination is unregistered instead of selecting a companion part automatically.

## Machines gallery

`site/viewer/machines.html` opens a responsive collection of the registered
available printers. The Machines tab comes first and is active on this page.
Search matches printer names, vendors, families, IDs and registered sizes;
the family menu narrows that same inventory. Search and family selections stay
in the page URL. Empty results offer Clear filters, and an index error offers
Try again. A failed image is identified as unavailable while its printer link
remains usable.

The gallery uses the shared theme control and language preference. New visitors
start in English; Japanese, Spanish, Korean and Russian use the same reviewed
message catalog as the workspace. Navigation and machine links retain the
selected language. The Printer link restores a valid printer URL remembered in
the current browser session, including its saved selection. Each card opens its
exact registered machine and page without inventing a configuration.

`site/assets/machines/index.json` has schema `machine-thumbnails/113`. Its
machine records name the exact ID, label, family, registered size, page and
`<id>.webp` thumbnail, with image size, byte count and SHA-256 plus recorded
decoded/stored model and companion hashes. The inventory must equal the current
65 IDs in `docs/MACHINE_REVIEW_COVERAGE.json`, including V0 and community
printers; all six unavailable CAD registrations are excluded. Family and vendor
names come from the production machine registry and are checked against the
actual generated support targets when auditing an assembled site.

These are static 320 × 240 viewer-exported images, loaded lazily. The gallery
does not preload CAD, create WebGL scenes or render substitute images. Image
URLs include the first 20 characters of their thumbnail SHA-256 to invalidate
stale previews when an exported model changes. Neutral
thumbnail mattes keep the original previews readable in both themes.

Run `node scripts/test_machine_gallery.mjs --source-only` for focused source,
translation and interaction checks. Run `node scripts/test_machine_gallery.mjs`
after the actual index and images have been prepared, and
`node scripts/test_machine_gallery.mjs --site <assembled-site>` to include exact
support-target coverage and release payload checks. Missing index/images and
stale model or image hashes fail the asset audit. Source checks are not evidence
for thumbnail provenance, browser appearance, CAD mounting or native clearance.
`--support-index <actual-index.json>` can compare the prepared gallery against
an existing assembled support index before the final site build.
Before publication, rebuild the locale outputs, run the repository and actual
asset release checks, and record desktop/mobile screenshots in both themes.

## Implementation and review

`workspace-ui.mjs` moves existing DOM controls without replacing their IDs or event handlers. Machine-head and G-code panels added asynchronously are routed into the appropriate category. The shared stylesheet is loaded after the existing page styles. CAD selection, fit warnings, source links and rendering remain controlled by the existing modules.

`responsive-camera.mjs` preserves viewing direction and scale when a viewport changes between landscape and portrait. Six full-machine controllers use it for resize; fixed camera presets also compensate for portrait aspect ratios. The responsive-camera test verifies projected scale, repeated resize stability, round-trip distance, target preservation and preset framing.

Run the publication checker; relevant independent regressions include
`test_configuration_draft.mjs`, `test_configurations.mjs`,
`test_workspace_choices.mjs`, `test_workspace_sections.mjs`,
`test_workspace_scroll.mjs` and `test_responsive_camera.mjs` in `scripts/`.
`test_sponsor_banner.mjs` exercises the shipped sponsor component, responsive
asset selection, accessible name, localized message IDs, four official links,
outside-click dismissal, Escape focus return and source artwork hashes. These
checks cover the sponsor UI; they do not establish any CAD mounting or clearance.
Browser review should include desktop/mobile, folded settings, long labels,
dependent choices before Apply, Discard, restore, load failure/retry and an
unavailable machine. Check all supported languages and both themes. Inspect
that the selected and installed configuration IDs agree after a successful Apply.

When integrating into a newer CAD release, retain that release's version parameters and catalogs, add the shared stylesheet/module to each viewer HTML page, and merge the small camera changes into the current controllers. Regenerate the source inventory after integration.
