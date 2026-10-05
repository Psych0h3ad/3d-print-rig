# Viewer navigation and display preferences

Viewer HTML files remain valid public entry URLs. Each declares its controller
with `data-controller` and starts `workspace-router.mjs`. Internal viewer links
and the machine chooser now use History API navigation in the same document.
External links, downloads, modifier clicks and new-tab links keep native behavior.

Controllers export `mount(scope)`. They must not start a scene at import time.
The router fetches and validates a destination before replacing the old view;
failure leaves the current controls usable. Back/Forward uses the same route
installation. New navigation requests supersede queued destinations.

`WorkspaceScope` owns renderers, scenes, OrbitControls, observers, global event
listeners, scheduled frames and async UI operations. `workspaceTask` tracks
operations that may update controls after an `await`, including configuration
changes, file imports and render exports. Navigation waits for those operations
to settle, then stops loops, disconnects listeners/observers and disposes GPU
resources before replacing the DOM. It does not abort an in-flight CAD load;
another destination is queued while that load finishes. Never track the router's
own navigation promise as a controller task, which would create a circular wait.

Controller URL writes use `replaceWorkspaceURL` so an older asynchronous load
cannot overwrite a pending Back/Forward destination. Existing selection/query
parameters, machine-specific palette storage and share URLs remain owned by
their controllers. Full CAD geometry is loaded for the selected machine; this
change removes document reloads, not model loading.

Rat Rig and Crossant import their r180 engine explicitly; the import map scopes
their vendor modules separately from the other controllers. Render export
accepts that engine as `three` to create compatible render targets.

Dark mode is shared via `3d-print-rig-display-v1`. The small `display-start.js`
script applies it before styles and migrates the current machine's old lighting
preference once. Actual lights and LEDs remain machine-specific. Reference
viewers retain CAD illumination while changing their backdrop. Mobile layout is
session-scoped; the selected inspector tab carries across compatible views.

The header theme control is available without opening Appearance. Switching
Trident → V0.2 retains the site theme while loading the destination model.
Language follows the explicit URL, then the stored preference, then English;
see [translations](TRANSLATING.md). Shared configuration URLs describe the
committed assembly, not un-applied menu drafts. See
[configuration editing](UI_WORKSPACE.md) and [embed state limits](EMBEDDING.md).

For regression testing, run `scripts/test_workspace_runtime.mjs` and the normal
repository checks. Browser checks should cover Trident → V0.2 → Trident,
Back/Forward, a failed destination and retry, language/mobile-layout persistence,
and switching between the two CAD engine versions. The root
`data-workspace-session` identifies a document lifetime; it remains unchanged on
in-app navigation. Check that exactly one scene canvas remains after each switch.
