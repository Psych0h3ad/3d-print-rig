# Viewer workspace

The shared viewer shell makes the model and its main controls available together.
Machine and workbench entry pages share navigation, control categories and a
responsive layout; the available controls depend on the loaded controller.
See the [support index](COMBINATION_SUPPORT.md) for current configurations.

The model corner credits project sponsor **Watchtower by YGK3D**. Open the
credit to visit its website, Kickstarter, YouTube channel or introduction video.

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

## Implementation and review

`workspace-ui.mjs` moves existing DOM controls without replacing their IDs or event handlers. Machine-head and G-code panels added asynchronously are routed into the appropriate category. The shared stylesheet is loaded after the existing page styles. CAD selection, fit warnings, source links and rendering remain controlled by the existing modules.

`responsive-camera.mjs` preserves viewing direction and scale when a viewport changes between landscape and portrait. Six full-machine controllers use it for resize; fixed camera presets also compensate for portrait aspect ratios. The responsive-camera test verifies projected scale, repeated resize stability, round-trip distance, target preservation and preset framing.

Run the publication checker; relevant independent regressions include
`test_configuration_draft.mjs`, `test_configurations.mjs`,
`test_workspace_choices.mjs`, `test_workspace_sections.mjs`,
`test_workspace_scroll.mjs` and `test_responsive_camera.mjs` in `scripts/`.
Browser review should include desktop/mobile, folded settings, long labels,
dependent choices before Apply, Discard, restore, load failure/retry and an
unavailable machine. Check all supported languages and both themes. Inspect
that the selected and installed configuration IDs agree after a successful Apply.

When integrating into a newer CAD release, retain that release's version parameters and catalogs, add the shared stylesheet/module to each viewer HTML page, and merge the small camera changes into the current controllers. Regenerate the source inventory after integration.
