# Embedded viewers

**Experimental / テスト公開中.** Appearance and controls may change while this
feature is developed. This notice appears in the sharing dialog, the download
gallery, the embed cover, and the persistent embed footer.

Open a machine and choose Share → Embed. Copy the iframe into a page that
permits third-party frames. The wrapper is responsive; edit its height to fit.
It loads CAD only after the visitor presses Load 3D model. A permanent link
opens the original viewer, and original credits remain accessible there.

`/embed/?v=1&viewer=trident.html&machine=voron_trident_300&theme=dark`

`v=1` versions the URL contract, **not** the geometry. These embeds are live:
the next visit receives the current implementation and model corrections.
An already open scene is not forcibly reloaded during interaction. Machine and
configuration IDs are preserved; unavailable machine IDs are rejected before
loading and unavailable explicit configuration IDs do not fall back to a
different default assembly. Registered source-head aliases remain accepted.
Unsupported protocol versions show a link to the original site.

Maintain old IDs (or explicit, verified migrations) when updating catalogs.
Do not silently repurpose an ID for a different machine. Keep `v=1` readable
if a future contract is introduced, and add regression fixtures for migrations.

A frozen interactive embed requires an immutable runtime, catalogs and geometry
snapshot. This feature does not claim to freeze a display with a query string.
Until a snapshot host exists, static image exports provide a fixed illustration.
The site must not expose a fixed-version option that still requests live models.

Dark/light/automatic background is explicit in the embed URL. Embedded theme
choices do not replace the visitor's full-viewer theme preference. The embed
does not read its parent's DOM or accept arbitrary parent-origin commands.
