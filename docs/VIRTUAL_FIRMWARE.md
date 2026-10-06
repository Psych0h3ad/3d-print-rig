# Offline virtual printer preview

The existing G-code panel now compiles a bounded logical printer program and
replays it against the viewer's XYZ adapter. It has no machine transport, MCU,
network command, filesystem command, JavaScript evaluation or firmware process.
The renderer receives only XYZ. Heater, fan and tool state remains virtual.

This is an independently implemented subset, not Klipper firmware. See the
[Klipper command template reference](https://www.klipper3d.org/Command_Templates.html)
and [G-code reference](https://www.klipper3d.org/G-Codes.html) for the complete
firmware behavior. Unsupported commands, configuration fields and syntax stop
visibly. An incomplete program cannot play. Earlier valid events remain in the
diagnostic result; a rejected command does not mutate its preceding state.

## Capabilities and evidence

| Behavior | Preview scope |
| --- | --- |
| Existing coordinate commands | G0/G1, G21, G90/G91, G92, M82/M83, G4 P, M220/M221, SET_GCODE_OFFSET, SAVE_GCODE_STATE and RESTORE_GCODE_STATE retain the original coordinate implementation. |
| G28 | Selected X/Y/Z axes become homed at explicitly configured contact positions. An absent axis contact fails. This is a discontinuous contact event with no approach, retract or timing model. |
| PROBE | Requires homed XYZ and configured contact Z, probe XY offset, contact region and evidence. Records one planar contact and jumps to that Z. It does not generate a probing path, samples, bed mesh or calibration. |
| Heater state | M104/M109, M140/M190, SET_HEATER_TEMPERATURE, TEMPERATURE_WAIT and TURN_OFF_HEATERS require named virtual heaters and temperature limits. M109/M190 logically settle to a nonzero target. TEMPERATURE_WAIT settles to a target inside its window. No thermal time or dynamics is computed. |
| Extrusion | Default mode retains the original E counter. `temperature_guard` rejects extrusion/retraction below the configured tool heater threshold. Per-tool counters track commanded E deltas, not actual filament or flow. |
| Tool activation | ACTIVATE_EXTRUDER records activation/exchange events for explicitly configured virtual names. It does not install, move or park geometry. T0/T1/etc. exist only as user-defined macros. |
| Fan / synchronization | M106 S (0–255), M107 and M400 update logical fan state or record synchronization. No physical fan rendering or MCU queue is modeled. |
| Clearance | XYZ limits constrain coordinates. This does not establish collisions, native mating fit or continuous swept clearance. |

The result exposes `capabilities`, `physical_machine_connected: false`, and
`time_excludes_thermal_waits`. Feed times exclude acceleration and all contact
and exchange events. Waits that change virtual temperature have unknown thermal
duration, so the displayed duration cannot be treated as a print-time estimate.
Authored moves inside macros are ordinary coordinate paths, not verified dock
trajectories. Their source macro and line are retained on each event.

## Settings from the current adapter

`virtualSettingsFromAdapter({profile, initial, limits})` copies the current
display XYZ and limits. It never derives endstops from range endpoints, a bed
surface or a nozzle datum. Default homing/probe/heater configuration is absent;
the sole default tool name `extruder` is a virtual counter, not an installed
tool declaration. Default `require_homing: false` preserves existing coordinate
preview behavior and does not assert that the machine has actually been homed.

The panel displays these settings as editable JSON. Custom limits may narrow
the adapter's measured display range but cannot extend it. Initial XYZ must be
inside those limits. After manual edits, use the measured-settings button to
return to adapter defaults. Untouched settings follow the current pose whenever
the program is compiled.

Adapter owners may supply `profile.virtual_firmware`, or pass a dynamic
`getFirmwareSettings` callback to `setupGcodePanel`. Contact entries require a
nonempty `evidence` string and in-range finite values. The emulator validates
the structure; it cannot authenticate a user's evidence label. Only the adapter
owner's review of pinned native CAD can establish measured contacts. No current
profile is upgraded to a contact certificate by this implementation.

The following is an **illustrative test scenario**, not a measured machine:

```json
{
  "initial": [10, 20, 30],
  "limits": {"X": [0, 200], "Y": [0, 200], "Z": [0, 200]},
  "homing": {
    "X": {"position_mm": 0, "evidence": "illustrative fixture"},
    "Y": {"position_mm": 0, "evidence": "illustrative fixture"},
    "Z": {"position_mm": 100, "evidence": "illustrative fixture"}
  },
  "probe": {
    "contact_nozzle_z_mm": 1.5,
    "offset_xy_mm": [5, -2],
    "xy_limits_mm": [[0, 200], [0, 200]],
    "evidence": "illustrative planar fixture"
  },
  "initial_homed_axes": [],
  "require_homing": true,
  "extrusion_mode": "temperature_guard",
  "heaters": {
    "extruder": {"temperature_c": 20, "min_c": 0, "max_c": 300, "min_extrude_c": 170},
    "extruder1": {"temperature_c": 20, "min_c": 0, "max_c": 300, "min_extrude_c": 170},
    "heater_bed": {"temperature_c": 20, "min_c": 0, "max_c": 120}
  },
  "tools": ["extruder", "extruder1"],
  "active_tool": "extruder"
}
```

Heater `target_c` defaults to zero. Optional `evidence` on the top-level settings
contains text labels. Heater names and tool names are bounded identifiers.

## Supported macro subset

Paste `[gcode_macro NAME]` sections into the macro field. Each section supports
`description:`, scalar `variable_lowercase:` values and an indented `gcode:`
body. Includes, other sections, command overrides, `rename_existing`, delayed
G-code, disk variables and template actions are rejected. Macro names follow
Klipper's convention of letters/underscores followed by optional trailing digits.

Configuration lines accept trailing `#` comments, including section headers,
scalar variables and the `gcode:` field. Hashes inside single or double quoted
strings are retained, including escaped quotes and backslashes. Blank and
comment-only body lines preserve physical macro/configuration line numbers.
Unsupported `rename_existing` produces a specific option diagnostic.

```ini
[gcode_macro RAISE]
variable_count: 2
gcode:
  {% set lift = params.Z|default(5)|float %}
  SAVE_GCODE_STATE NAME=raise
  G91
  {% for i in range(printer["gcode_macro RAISE"].count) %}
    {% if lift > 0 %}
      G1 Z{lift} F300
    {% endif %}
  {% endfor %}
  RESTORE_GCODE_STATE NAME=raise

[gcode_macro T1]
gcode:
  ACTIVATE_EXTRUDER EXTRUDER=extruder1
```

Supported syntax: `{expression}`, `{% set name = expression %}`, if/elif/else,
for/endfor over lists or `range(start, stop, step)`, decimal numbers, scalar
strings/booleans/None, lists, parentheses, own-property/index access, arithmetic
`+ - * / %`, scalar comparisons, `in` for strings/lists, `and/or/not`,
`is [not] defined`, and filters `default`, `float`, `int`.
Conversions must succeed; no Jinja fallback conversion or filter arguments are
silently assumed. Arithmetic requires finite numbers. Object equality and mixed
boolean/numeric equality are rejected. Exponent notation, chained comparisons,
tuple/dict literals, slicing, whitespace-control delimiters, Jinja comments,
arbitrary calls, other filters and directives are unsupported. Numeric macro
parameters stay strings until explicitly converted.

`printer` exposes only toolhead position/homed axes/ranges/extruder, gcode_move
coordinate state, named heater temperature/target/can_extrude, fan speed, last
probe Z and declared macro variables. Unavailable properties are undefined and
must be checked or given a default. Prototype/private properties are rejected.
`rawparams`, configfile, remote calls and arbitrary printer modules are absent.
Unselected conditional branches are parsed too, so unsafe syntax in them fails.
Template output cannot inject newlines or braces.

The entire macro renders against one state snapshot before executing any of
its commands. A nested macro sees state at its own invocation. SET_GCODE_VARIABLE
can update only a previously declared scalar variable; its change is visible
to subsequent macro invocations. Quoted macro parameters and scalar string
variables are supported; semicolon comments retain the coordinate parser's
line-comment behavior.

Hard budgets: 2 MB G-code, 30,000 input/expanded commands (macro calls count),
128,000 configuration characters, 128 macros, eight call levels, 16 template
block levels, 32 expression levels, 512 expression tokens, 4,096 nodes per
template, 256 iterations per range/list, 100,000 shared evaluation operations,
2 million rendered characters, 128,000 output characters per macro invocation,
32 million serialized state characters and one year of feed/dwell time. The
existing coordinate engine bounds named coordinate saves at 64. Heaters and
tools are limited to 16 each. Limits cannot be increased by imported input.

## Playback, reset and saved state

`createVirtualPlayback(program)` supports ordered event stepping, arbitrary
time seeking, monotonic-clock play/advance, pause, reset and JSON cursor saves.
Stepping preserves zero-duration event order. Time seeking consumes events at
or before the requested time; reset explicitly returns to the initial state
before any zero-time command. Counters interpolate during movement. A saved
cursor includes the event index as well as time, so two states at time zero do
not collapse into one. Rejected/inconsistent cursors leave the prior cursor
unchanged. The program fingerprint is a consistency check, not authentication.

SAVE_GCODE_STATE/RESTORE_GCODE_STATE affect coordinate parsing state only,
matching the original preview. Full replay saves include program text, macro
configuration, settings and the cursor. Reload recompiles the program, checks
the cursor and current machine/frame/adapter-settings identity, and stays
paused. Replay files are limited to 3 MB. Invalid files do not replace the
current program. In-flight imports are discarded after edits or disposal.

The panel pauses when hidden or closed. Configuration/limit changes, native
reset and source edits invalidate the program. Start position resets the preview's
initial pose and all virtual state; the machine's separate native-reset button
continues to restore its CAD assembly. No replay claims to restore unmodeled
thermal physics or mechanical tool installation.

## Validation and integration boundaries

Run the original G-code regressions plus:

```sh
node scripts/test_klipper_macro_subset.mjs
node scripts/test_virtual_printer_emulator.mjs
node scripts/test_virtual_printer_replay.mjs
node scripts/test_virtual_printer_adapter.mjs
node scripts/test_gcode_machine_bindings.mjs
node scripts/test_virtual_printer_klack.mjs
```

These tests cover command semantics and replay with explicit synthetic contacts.
Native mating solids and physical clearance require separate CAD review. The
shared panel is available on printer pages, including V0, Annex, FYSETC,
Remorph, Crossant, Rat Rig and Positron. Positron supports logical state only.

Community, Annex and FYSETC use native displacement XYZ, not nozzle or firmware
coordinates. Rat Rig maps X to the primary X0 in its current independent/copy/
mirror mode. Its native trace remains separate (`ratrigTraceText` and
`ratrigTraceStatus` avoid duplicate shared-panel IDs). Logical tool activation
does not select a physical carriage. Remorph and Crossant use their adapter
display XYZ and current ranges. Newly connected pages do not draw nozzle paths
without a registered nozzle frame. All existing native adapter constraints
still apply during model replay; a rectangular coordinate range is not a
clearance certificate.

Positron has a folding adapter without printer XYZ. `motion_enabled:false`
exposes `rigid_xyz:false`, rejects XYZ/contact commands and allows logical
macro/heater/extrusion/tool state only. Its internal [0,0,0] origin and zero
ranges are placeholders for logical state, never physical dimensions. Virtual
settings cannot enable an absent renderer XYZ binding. Initial datums within
1e-7 mm of a range boundary are snapped to that boundary for DOM serialization
roundoff; larger discrepancies reject and ranges never expand.

`sourceMetadata` accepts repository, revision, coordinate_mapping, purpose and
up to 32 `{path,sha256}` file records (8 KB total). It is passive provenance,
not executable configuration or a measured registration. Results, parser
exceptions and saved replay files preserve it; program identity includes it.
`gcodeMetadata` edits the same object. Unsupported configuration leaves the
input/metadata visible; an incomplete program cannot play or save a replay.

The pinned KlackEnder regression uses revision
`5e6db594cd14b856a31f86e7d1cfcc709bb6a030` and both supplied firmware-file
SHA-256 values. The valid inline comment on the BED_MESH_CALIBRATE section header
is accepted. Full KlackEnder.cfg stops at unsupported `rename_existing` on
configuration line 26; AddToPrinter.cfg stops at its unsupported include section.
The unmodified PROBE_OUT excerpt stops at X245
against the native Ender displacement range [-100,100], preserving the macro
line, call stack, provenance and last accepted state. No firmware-to-viewer
origin transform, probe calibration, dock attachment or exchange trajectory
is inferred. Run the optional actual-file check with the reference repository
directory as the first argument and a JSON report path as the second.

All six additional page families (Crossant, Rat Rig, Annex, FYSETC kit reference,
Remorph and Positron) bind saved replay context to the successfully loaded
models, effective profile, manifest and route files. FYSETC checks its model
against the loader hash; observed JSON hashes detect differences without
certifying upstream authenticity. SHA-256 matching detects changed inputs
and does not establish mechanical clearance or authenticate replay files.

The standard Trident R2 / SB / Revo / CW2 baseline includes its measured nozzle
datum and source hash in saved state. Reset restores the original CAD bed
placement, and movement remains within the intersection of the corrected
display coordinates and the original CAD translation range. Physical homing
switch calibration remains separate.
