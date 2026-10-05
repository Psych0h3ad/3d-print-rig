# Default review requirements

All printer families, vendor and size variants, gantries, toolheads and mods
must follow [docs/MACHINE_REVIEW.md](docs/MACHINE_REVIEW.md). These checks also
apply to future additions. Use [docs/MAINTENANCE.md](docs/MAINTENANCE.md) to locate
the authoritative catalogs and change-specific checks, and
[docs/README.md](docs/README.md) for feature documentation.

Run scripts/check_repository.py before publication; it runs the independent
regressions in parallel. Run the actual exported-model audits separately and
record a coverage row for every available machine. Missing tests, assets or
required evidence are failures. Keep native-solid clearance, automated motion
checks and browser visual review as distinct evidence. Fix findings before
publishing; never describe a catalog or visibility test as a fit validation.

Generate current combination support from the production composition rules.
Do not infer machine installation or dock support from a standalone catalog,
or describe an unregistered combination as physically incompatible. Preserve
configuration IDs and verify migrations because shared links and embeds update
live. Keep dated audit counts historical; link the generated support index for
current availability. Markdown-only changes retain existing model evidence and
still require link/claim review, source-inventory update and publication checks.
