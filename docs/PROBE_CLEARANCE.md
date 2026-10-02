# Probe selection and clearance

Head/hotend/extruder/carriage changes avoid automatically retaining a probe with
known height, body, bed, coordinate or metal-keepout conflicts when a matching
alternative exists. Explicit probe choices and saved configurations may still
show conflict previews with warnings. Missing measurements never imply a pass.
Body, height, bed and metal findings are displayed together.

When placing a source head on another printer, the coil datum and metal-keepout
bounds receive the same rigid translation as the nozzle and CAD modules.
Head-local checks are retained. Matching Sphinx/Xol placements on seven V2.4
stock assemblies additionally show [scoped continuous rigid probe travel
checks](PROBE_TRAVEL.md). Other machine placements remain unverified. Moving
belts, cables and complete-head travel are outside that check. A clear head-body result cannot suppress a
probe warning. This applies to the standalone head page, Builder, printer
selectors and V2.4 stock probe options.

Requirements are sensor-specific. [Cartographer Touch installation](https://docs.cartographer3d.com/cartographer-cnc-mount/installation)
may require extenders for different hotends; its Touch height range is
[2.6–3.0 mm above the nozzle](https://docs.cartographer3d.com/cartographer-probe/installation-and-setup/probe-installation).
[Beacon Quick Start](https://docs.beacon3d.com/quickstart/) specifies a nominal
2.6 mm mounting offset and warns about upper-side metal keepout;
[Beacon Contact](https://docs.beacon3d.com/contact/) describes mounting around
3 mm above the nozzle. No universal Cartographer range is assigned to Beacon.

Source tests cover invalid/missing data, simultaneous conflicts, explicit
preview preservation, automatic fallback and translated datums. Native source
geometry and existing collision reports are unchanged; these checks do not
simulate sensing, calibration or thermal behavior. Continuous external rigid
probe checks have the separate scope described above.
