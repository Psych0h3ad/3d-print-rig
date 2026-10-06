# Trinity

The toolhead builder includes complete standard Trinity assemblies with Sherpa Mini R2 standard/short, Dragon ACE Volcano, two 3628 blowers, a 2510 hotend fan, nozzle and the source Beacon RevD. Select MGN12 v1.54 with 6 mm or 9–10 mm belts, or archived MGN9 v1.41 with 6 mm or 9 mm belts.

[Open the MGN12 assembly](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?configuration=trinity88__n19&lang=en).

The component viewer also includes 21 reference packages: Klicky mounts, 2020 pretensioners, Xol/SHT36 V2 board mounts, eight Apex belt clips, Heatcore parts, Chube bodies and Magneto variants. Incomplete user CAD remains a component reference. It does not register a complete toolhead or machine installation.

Sources: [WV-design/Trinity-toolhead](https://github.com/WV-design/Trinity-toolhead/tree/d17a5c9fad6f21fd4a3a9869d498656b4b03d1dc), commit `d17a5c9fad6f21fd4a3a9869d498656b4b03d1dc`; author modifications by Prooda, HVFDesigns, Zerodegree79 and cpp0xc0ffeeee. Source file/archive/member hashes are recorded per package. Corresponding editable BREP, omitted original alternatives and repaired originals are preserved in the linked native source archives.

Trinity printed geometry retains GPL-3.0. Embedded Annex Sherpa geometry retains its separate EULA, A4T WW-BMG retains CC BY-NC-SA 4.0, and purchased hardware retains its original component terms. See [the source notice](../site/licenses/trinity/NOTICE.md).

Construction negatives and overlapping alternative parts are omitted and recorded. Five invalid native trim cases were repaired without changing solid count or assembly bounds; absolute volume changes remain below 1 mm³. MGN9 mounting screws use the original M3×12 length; MGN12 uses M3×16.

[The current review](TRINITY_STANDARD_QA.json) separates mesh/material/selection tests, browser inspection and native-solid mating checks. Printer installation, complete probe clearance and cutter motion remain unverified.
