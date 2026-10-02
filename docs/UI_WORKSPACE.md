# Viewer workspace

The shared viewer shell makes the model and its main controls available together. All eleven viewer pages use the same navigation, control categories and responsive layout.

- Machine selection opens in a dialog instead of occupying the configuration panel.
- Configuration, appearance, motion/inspection and reference tabs separate tasks. Empty categories are hidden.
- Mount, carriage and electronics options are progressively disclosed. Configuration save/load controls remain available in the panel footer.
- The mobile layout places the model above the settings. The settings can fold down to expose more of the model.
- Camera presets show their selected state. The operation guide includes touch gestures and keyboard shortcuts: 1 for isometric, 2 for front, 3 for top/side and 4 for the head where available.
- Tabs support arrow keys, Home and End. Native dialogs provide Escape dismissal and focus restoration.

`workspace-ui.mjs` moves existing DOM controls without replacing their IDs or event handlers. Machine-head and G-code panels added asynchronously are routed into the appropriate category. The shared stylesheet is loaded after the existing page styles. CAD selection, fit warnings, source links and rendering remain controlled by the existing modules.

`responsive-camera.mjs` preserves viewing direction and scale when a viewport changes between landscape and portrait. Six full-machine controllers use it for resize; fixed camera presets also compensate for portrait aspect ratios. The responsive-camera test verifies projected scale, repeated resize stability, round-trip distance, target preservation and preset framing.

Run `node scripts/test_responsive_camera.mjs` or the publication checker. Screen checks should include desktop, mobile, folded mobile settings, a dependent configuration change and an unavailable machine specification.

When integrating into a newer CAD release, retain that release's version parameters and catalogs, add the shared stylesheet/module to each viewer HTML page, and merge the small camera changes into the current controllers. Regenerate the source inventory after integration.
