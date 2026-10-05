# Default review requirements

All printer families, vendor and size variants, gantries, toolheads and mods
must follow docs/MACHINE_REVIEW.md. These checks also apply to future additions.

Run scripts/check_repository.py before publication; it runs the independent
regressions in parallel. Run the actual exported-model audits separately and
record a coverage row for every available machine. Missing tests, assets or
required evidence are failures. Keep native-solid clearance, automated motion
checks and browser visual review as distinct evidence. Fix findings before
publishing; never describe a catalog or visibility test as a fit validation.
