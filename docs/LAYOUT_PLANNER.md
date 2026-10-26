# Layout planner

[Open the planner](https://psych0h3ad.github.io/3d-print-rig/layout/) to arrange
printers, desks and shelves in a room.

Use a computer with a mouse or trackpad. Narrow desktop windows are supported.
Phones and touch-only devices show a popup explaining that the planner supports
computers only and has not been tested on phones. Closing it leaves the notice
and a link to the printer viewer. The planner catalog, 3D engine and printer
models are not loaded on that path. The existing printer viewers retain their
mobile controls.

The planner is an alpha. Full-model PNG rendering uses registered defaults.
Placement uses the registered static printer envelopes.

Placement shows simplified printer silhouettes: frames, beds, toolheads and
major body panels. Geometry is shared between copies of the same printer, and
small hardware and wiring are omitted. These shapes help identify machines;
the registered outside dimensions still control placement. Full printer CAD
is loaded separately for the final render.

## Arrange the room

1. Choose a rectangular, L-shaped or custom room. Enter width, depth and wall
   height in **millimetres**. For an L shape, set the cut width and depth; for a
   custom outline, enter one `X, Z` corner per line. Press **Update room** to
   apply a shape change. Invalid or crossing outlines leave the current room
   unchanged. Custom width and depth show its bounds without changing its shape.
2. Choose a desk or shelf, move the preview to the desired position and click to
   place it. Set its width, depth and height. Desks have a 30 mm
   top. Shelves have an adjustable board thickness and individual board heights.
3. Choose a printer and point at the floor, a desk top or a shelf board to place
   it there. A green preview can be placed; a red preview cannot. Enable
   **Keep placing** to place several copies, or hold **Shift** when clicking.
   The preview explains room, support and overlap conflicts.
   **R / Shift+R** rotate the preview;
   **Esc** or **Cancel** leave the plan unchanged.
4. Drag an object to move it. In 3D, drag empty space to look around, or use the
   right mouse button to orbit and the middle mouse button to pan. Scroll to
   zoom. No move/view mode switch is needed.
   Use **2D plan**, **3D**, **Front** and the fit control to inspect the layout.

A printer on furniture moves and rotates with that furniture. Its X, Z and
rotation fields are local to the selected support surface. Changing its support
centres it on the new surface. Resizing furniture preserves the printer's local
position. Movement stays within the room and the selected support surface.
Drag along a wall to slide against it; pulling away responds immediately.
Changes that would put an object beyond those boundaries are not accepted.
When turning beside a wall, the object moves inward as needed, turns and returns
toward its starting position. This also works for groups and supported printers;
other objects and the edges of the support surface still limit the movement.

For a printer on a desk or shelf, typing an angle, using a rotation button or
pressing **R / Shift+R** picks it up, reorients it and places it at the nearest
valid final position on the same support. Intermediate diagonal clearance is
not required for these discrete edits. The authored feet/support footprint must
fit on that surface; the complete printer envelope must remain inside the room
and clear of other envelopes. Valid bed/body overhang remains allowed when its
feet are supported. If the requested final angle cannot be placed, the plan is
unchanged. Continuous scene-handle drags, floor printers and furniture/group
turns retain their swept-motion rules. Each completed edit is one undo step.

Furniture and printer envelopes also block one another when their footprints
and heights overlap. Dragging stops at contact and can slide along the other
object. Touching edges are allowed. A printer may sit on its own desk or shelf;
printers on different shelf boards remain separate when their heights allow it.
These are outside-dimension planning envelopes, so allow extra working space.
Older plans with overlaps still open and show the affected objects; move them
apart before rotating or arranging them further.

The settings panel keeps the object list visible above four tabs: **Selected**,
**Add**, **Room** and **Output**. Select an object to open its position and
rotation controls. Filter the list to printers, furniture or units, or search
by name or unit letter. Press **/** outside a text field to focus the search.
Tab changes preserve unfinished form entries; selecting another object opens
**Selected**.

## Windows and doors

Open **Room → Windows and doors** and choose **Window** or **Door**. The planner
opens the 2D plan. Point near a wall to see a green preview and click to place;
a red preview means that no free span fits. Corners and existing openings clamp
the preview to an available span. Press **Esc** to cancel without changing the plan.

Click an opening in the plan to select it and reveal its editor. Drag it along
its wall to preview a new position, then release to apply one undoable edit.
Dragging stops at corners and neighbouring openings; it cannot pass through
another opening with overlapping height. **Esc** cancels the drag. In 3D, click
or drag the visible frame, pane or door leaf to select or move that opening.
The preview does not change the saved wall cutout until release.

The numbered-wall **Add window** and **Add door** controls remain available for
precise form-based placement. Set the width, height and distance from the start
of the wall in the selected opening's editor. Windows
also have a sill height. Choose a hinged or sliding door. Hinged doors have
left/right hinges and an opening angle; single-panel sliding doors move along
the wall with a chosen direction and opening percentage.
The selected wall's length is shown in millimetres. Openings cut through the
wall in 3D and have symbols in the 2D plan and exported images.

An opening must fit within its wall and cannot overlap another opening.
Changes that would remove its wall or make it too small are rejected; move or
remove the opening first. Room resizing retains the wall attachment, and
reversing or reordering the same outline preserves its physical location.
Openings are included in layout JSON, undo and redo. Existing plans continue
to work without them.

A warning highlights furniture or printer envelopes in a door's swing area,
and door swings that reach another wall. These warnings do not block placing
or copying furniture and printers.
This is a conservative planning envelope, not a construction or physical
clearance assessment. Room containment remains the boundary for placement.

## Printer farms and reusable sets

Hold **Shift** and click objects in the scene to select several at once. In
**2D plan**, hold **Shift** and drag a box around complete footprints to add them
to the selection. Selected objects have teal outlines; furniture includes its
printers, and existing groups are selected together. **Alt+Shift-click** selects
a single furniture or floor-printer member of a group. Selection does not move
objects or change the saved plan. **Esc** cancels a box gesture; outside a gesture
it clears the checked selection.

The selection bar shows the count and provides **Group**, **Duplicate** and
**Clear selection** without opening Unit tools. **F** frames all checked items.
Group items before moving or rotating them together. A plain click returns to
editing one object. Selection outlines are omitted from exported images.

Use the checkboxes in **Items** to choose desks, shelves or floor printers,
then open **Unit tools** and select **Create group**. The name is optional and can be
changed later. Leaving the name field applies a valid name once; the unit
keeps its letter code. **Select all** and **Clear selection** speed up larger plans.
Printers on a chosen desk or shelf are included automatically. Selected roots
can be regrouped directly: they move out of their previous groups, while the
unselected members of those groups stay together in place.

Click a grouped object in 2D or 3D to select the whole set. Drag to move it,
use the rotation handle or **R** to turn it, and press **F** to frame all its
members. The printers keep their positions on their original shelf boards or
desk tops. **Alt-click** or a member button in the group editor selects an
individual object. **Ungroup** keeps every object in place; deleting a selected
group removes its furniture and printers together. Both actions support undo.

**Duplicate** starts a preview of the complete set. **Save set** adds it to
**Saved units** under **Add** in this browser; choose **Place** to reuse it in another plan.
Click to place, enable **Keep placing** or hold **Shift** for more copies, and
press **R** to rotate the preview. Red previews reject room, support, height or
envelope conflicts without adding part of the set. Each copy gets its own object IDs and support
references. Units also receive a letter code: **A**, **B**, **C**, through **Z**,
then **AA**, **AB** and so on. The code appears in the list, beside the unit in
the scene and in exported 2D plans. It stays separate from the name and survives
renaming, save/load and undo/redo. Deleting another unit does not renumber the
remaining ones. A newly placed copy receives a new code in the destination
plan. Placement stays lightweight; full printer CAD is loaded only for
the final render.

Groups are included in the normal layout JSON and survive save/load and
undo/redo. Saved sets are stored separately in the current browser, with up to
24 sets. **Copy** and **Paste** work on an object, a group or the checked roots.
Furniture copies include their printers, board attachments and saved machine
configuration IDs. Copying only a supported printer copies that printer alone.
Use **Ctrl/Cmd+C** and **Ctrl/Cmd+V** to transfer a set between Layout tabs or
browsers. The toolbar Copy and Paste use the system clipboard, including copies
from another tab. Your browser may request clipboard permission. If access is
unavailable, use the keyboard shortcut; an older in-tab copy is not substituted.
Pasting starts a preview: click to place, use **Keep placing** or Shift for more
copies, or press Esc to cancel. The source objects stay unchanged.
Existing layout files without
groups still open. Planning envelopes do not include moving-part or service
clearances; leave access space around each row of printers.

With the scene focused, **Ctrl/Cmd+A** checks all roots, **Ctrl/Cmd+G** groups
the selection, and **Shift+Ctrl/Cmd+G** ungroups the current group. Text fields
retain their normal selection and clipboard shortcuts.

Press **F** with the scene focused, or use the focus button beside the selected
object's rotation controls, to frame the selected object. A selected desk or
shelf includes its attached printers. This adjusts the camera without changing
the plan. The room-fit button still frames the whole room.

**2D plan** shows flat furniture and printer footprints without perspective or
height projection. Drag empty space to pan and scroll to zoom; the plan does
not rotate. Switching back to 3D restores the three-dimensional scene.

**Dimensions** adds room-edge measurements and a scale bar to the flat plan.
Selecting a rectangular object also shows its two footprint dimensions. These
annotations stay readable as you zoom and are included in the plan PNG; turn
off **Dimensions** for an image without them. Measurements use the saved room
outline and static placement envelopes. They do not include moving-part or
maintenance clearances. The selected-object controls show its name and width ×
depth × height in both 2D and 3D.

Select an object to show its rotation controls. Drag the angle handle left or
right to rotate in 15° steps. Hold **Shift** for 1° steps, or use the arrow
buttons for 90° turns. **Esc** cancels a drag. Printers on a desk or shelf rotate with it.

With the scene focused and an object selected, arrow keys move it by 10 mm
or 100 mm with Shift along the room's X/Z axes, including on rotated furniture.
**R** turns it by 90°; **Shift+R** turns it by −90°.
Numeric fields apply on Enter or when leaving the field. Clicking an object
finishes the numeric edit and returns arrow-key control to the scene. Invalid
or conflicting edits keep the previous position. Room dimensions remain a
draft until **Update room** is pressed. Objects can be duplicated or
deleted. **Ctrl/Cmd+D** starts a duplicate preview and **Delete** removes the
selection. New objects and duplicates enter history only after placement;
cancelled previews do not affect undo or saved plans. Nearby edges and centres
align within 14 mm when a valid position exists; hold **Alt** to disable grid
and alignment snapping. Before deleting occupied furniture, explicitly choose to move its printers to the floor. Move printers
off a shelf board before removing that board.

## Room appearance

Under **Room → Appearance**, choose painted plaster, linen wallpaper or fine
vertical stripe wallpaper for the walls, and oak planks, light concrete or
neutral tile for the floor. Each choice applies immediately and supports undo
and redo. Changing the outline, importing SVG or updating room dimensions keeps
the chosen finishes. Appearance changes also keep an unfinished outline draft.

Finish choices are included in browser saves and exported layout JSON. Older
plans without appearance settings open with painted plaster and oak planks.
Reset restores those defaults along with the empty room.

The version-1 JSON contract is `room.appearance: {wall, floor}`. Wall values are
`paint`, `linen` and `stripe`; floor values are `oak`, `concrete` and `tile`.
Loading or saving a plan with no appearance object adds `{wall: "paint", floor:
"oak"}`. When present, the object requires both fields and accepts no extra
fields. Unknown finish values are rejected without replacing the current plan.
A shape-only `SET_ROOM` retains the existing appearance; an explicit appearance
object replaces it. The enum contract is defined in
[`layout-finishes.mjs`](../site/layout/layout-finishes.mjs).

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

An older plan with objects outside the room or their support opens with a
repair notice. Move those objects inside. Editing, JSON saving and flat-plan
images remain available; detailed 3D image export stays disabled until the
boundary problems are fixed. Existing placements are not silently relocated.

Undo and redo apply to edits in the current session.
**Ctrl+Z** (or **Cmd+Z**) undoes an edit; **Ctrl+Shift+Z** /
**Cmd+Shift+Z** or **Ctrl+Y** redoes it. In text and number fields, the browser's
own text undo is retained. These shortcuts pause during image rendering and
room-outline editing.
Reset clears the room's objects. Export a JSON copy before clearing browser data or moving to another
device; a PNG does not contain an editable plan.

## Preview and PNG

Arranging the room uses lightweight proxies and does **not** download full
printer models. Simple bed, base and foot shapes help show contact with the
floor or furniture. The shown printer dimensions are static outer envelopes from
the registered source models, **not build volumes** or complete motion/service
envelopes.

Press **Create image** when ready. The browser loads, draws and releases
one printer model in its registered default configuration at a time, then
offers a PNG from the **current camera angle**, with a **1920 px long edge**
subject to the browser's GPU limit.
In **2D plan**, **Create plan image** exports the flat plan without loading full
printer models. In 3D, the full models are used for the image; the editable scene
stays lightweight. Walls and floors use the selected finishes. The 3D grid is
off by default and is omitted from detailed images. Room lighting stays the
same when switching the site theme. Furniture casts soft shadows; the soft
contact beneath a printer follows its planning envelope, not its individual
CAD feet.
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
