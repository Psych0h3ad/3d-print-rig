# Layout planner

[Open the planner](https://psych0h3ad.github.io/3d-print-rig/layout/) to arrange
printers, desks and shelves in a room.

Use a computer with a mouse or trackpad. Narrow desktop windows are supported.
Touch-only devices show a desktop-use notice and a link to the printer viewer;
they do not load the planner catalog or printer models. The existing printer
viewers retain their mobile controls.

The planner is an alpha. Full-model PNG rendering uses registered defaults.
Placement uses the registered static printer envelopes.

## Arrange the room

1. Choose a rectangular, L-shaped or custom room. Enter width, depth and wall
   height in **millimetres**. For an L shape, set the cut width and depth; for a
   custom outline, enter one `X, Z` corner per line. Press **Update room** to
   apply a shape change. Invalid or crossing outlines leave the current room
   unchanged. Custom width and depth show its bounds without changing its shape.
2. Add a desk or shelf and set its width, depth and height. Desks have a 30 mm
   top. Shelves have an adjustable board thickness and individual board heights.
3. Add a printer, select it and choose **Floor**, a desk top or a shelf board.
4. Choose **Move** to drag an object, or enter its X, Z and rotation values.
   Use **Orbit**, **Top**, **Front** and the fit control to inspect the layout.

A printer on furniture moves and rotates with that furniture. Its X, Z and
rotation fields are local to the selected support surface. Changing its support
centres it on the new surface. Resizing furniture preserves the printer's local
position; it can leave an overhang, which appears as a placement note.

With the scene focused and an object selected, arrow keys move it by 10 mm
or 100 mm with Shift; **R** rotates it by 90°. Numeric fields also support precise
placement. Objects can be duplicated or deleted. Before deleting occupied
furniture, explicitly choose to move its printers to the floor. Move printers
off a shelf board before removing that board.

## Draw or import an outline

Use **Edit outline** to draw room corners, drag them, or add and remove points.
**Import SVG** opens an outline preview. Choose the outline and enter its
intended width in millimetres before applying it: SVG units are not assumed to
be millimetres. Both paths replace the room only when you press **Apply**.
Cancelling keeps the current room.

SVG processing stays in your browser; the file is not uploaded. A drawn or
imported outline is a planning boundary, not a measured survey.

## Save and restore

Edits are saved in this browser when browser storage is available. **Export
layout JSON** downloads a portable plan; **Import** restores a saved plan with
its object IDs, placements and furniture attachments. Invalid files or unknown
printer IDs are rejected without replacing the current plan.

Undo and redo apply to edits in the current session. Reset clears the room's
objects. Export a JSON copy before clearing browser data or moving to another
device; a PNG does not contain an editable plan.

## Preview and PNG

Arranging the room uses lightweight proxies and does **not** download full
printer models. The shown printer dimensions are static outer envelopes from
the registered source models, **not build volumes** or complete motion/service
envelopes.

Press **Render full models** when ready. The browser loads, draws and releases
one printer model in its registered default configuration at a time, then
offers a PNG from the **current camera angle**, with a **1920 px long edge**
subject to the browser's GPU limit.
The full models are used for this image; the editable scene stays lightweight.
**Cancel** stops the operation and retains the plan.

Transparent model geometry and textures may need to remain until the last
rendering pass. Their retained data has a **24 MiB cap**; exceeding it stops the
render with an error. This is not a limit on total browser memory. Reduce the
number of detailed printers and retry if necessary. A failed or cancelled
render does not produce a completed PNG.

## Planning limits

Placement notes compare room, furniture and printer envelopes. They do not
establish native-solid collision clearance, furniture load ratings or safe
operation. Allow additional space for moving beds, doors, spool holders,
cables, ventilation and maintenance. Select a printer and use **Open printer / sources** to reach its existing
viewer and References for the exact source versions, licenses, configuration
and model limitations.
