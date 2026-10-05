# Rear panels and exhaust interfaces

Trident 300/350 and V2.4 300/350 retain the original central exhaust opening
when their panel edges are extended. The straight opening is 147 mm wide;
its two rounded returns make the upper mouth 151 mm wide. V2.4 panels retain
the original 3 mm thickness, including the 250 mm reference.

[Native source CAD and reproduction scripts](https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v77/REAR_ENCLOSURE_SOURCE.zip)
include original source versions and licenses. Corrected standard assemblies
are linked by the viewer's STEP download controls.

`site/REAR_ENCLOSURE_QA.json` pins the native solids and exported models. It
records central-interface equality, panel/gasket contact, added material
against nearby native bodies, and preservation of unchanged mounting witnesses.
V2.4's native foam/extrusion contact penetrates approximately 0.000076 mm;
that retained soft-seal face contact is recorded separately from rigid-body
interference. Probe bodies and declared metal keepouts remain separated from
the changed rear sheets over the complete Cartesian travel interval.

Run `node scripts/audit_rear_enclosures.mjs BUILD_DIRECTORY REPORT.json` on
the actual built assets. Source regression coverage includes the native proof
pins and exhaust-interface requirements. These checks do not certify complete
printer clearance, docking, manufacturing fit, or every browser/device.
