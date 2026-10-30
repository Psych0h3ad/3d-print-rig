# Custom STEP exports

In the **Toolhead** page, open **Parts list and sharing → Custom STEP surfaces**.
The dialog lists the exact parts it can include and the remaining parts to obtain
separately. Nothing is downloaded until **Download STEP package** is selected.

The package contains the selected parts in their current component positions
and colors, using millimetres and a Z-up CAD coordinate system. Viewer framing
and camera angle do not move the exported parts. Current probe displacement and
head separation are retained. Tool banks are not included in this export.

This export writes the displayed triangles as **faceted STEP surface models**.
It does not reconstruct parametric CAD, stitch watertight solids or certify
clearance. Existing native STEP assembly downloads remain available from the
header's **STEP** button and retain their own baseline configurations.

The source allowlist covers 14 distinct authored Stealthburner/Revo Voron and
Clockwork 2 printed bodies from the pinned VORON source revision. V6, Dragon HF and Dragon SF
also include their source-matched shared Stealthburner body, LED diffuser, mask
and carrier. Their hotend-specific mounts, hotends and purchased parts remain
listed as omissions.
Each part is
matched by asset identity and complete position/index buffer hashes. Only parts
actually present in the displayed configuration are included. An altered cover,
unregistered body, manufacturer component or web-mesh-only permission does not
inherit export rights from a printed parent. Other heads can currently have no
eligible parts; the dialog reports that state without substituting another head.

The ZIP includes `Selected_Surface_Reference.step`, `COPYING.txt`,
`configuration-and-sources.json`, `README.txt`, generator source, its MIT license,
a SHA-256 file ledger and editable source mesh buffers.
The JSON records each selected source identity, original revision, original CAD
link, exported placement/color and every omission. Original author CAD is linked
at its exact revision. Buffers and the public generator permit reproducing the
faceted derivative. Run `node --max-old-space-size=384 step-surface-rebuild.mjs`
with Node.js 22 or later after extracting all files together. The runner verifies
the ledger and source data before rebuilding; only the STEP creation timestamp
changes. There is no project-wide relicensing of the geometry.

An omitted component's original source or STEP permission may be unresolved.
Such rows say so explicitly. Their assembly reference links are lookup aids;
they are not verified individual manufacturer CAD downloads or grants. When a
single unadmitted CAD part has separate display meshes, such as a motor body
and endcaps, each visible mesh is listed separately with its original CAD part
identity. This does not make it eligible for export.

Export is capped at 150,000 triangles and 80 MiB of STEP. It can be canceled
during checking, writing and packaging. Exactly zero-area source triangles are
excluded using integer arithmetic on the original Float32 coordinates, without
an epsilon or vertex welding; their original triangle numbers are recorded.
Non-finite geometry and other collapsed surfaces fail the export. Native STEP repair and additional
source permissions are separate work; this surface mode does not mark those
parts or complete machines as physically verified.

For maintenance, update `step-surface-sources.json` only with exact body/source
provenance and per-file terms. Run the source regressions and
`audit_step_surface_assets.mjs` against the normal assembled site. The normal
build invokes that audit; visibility or source-name matching alone is not enough.
