# VORON source part map

The machine collection links to a read-only source map for official Trident
250/300/350 and V2.4 printed/LDO CNC 250/300/350. It reuses the existing default
assembly providers, including Trident's separately loaded gantry and complete
default head modules. It adds no geometry or installation registration.

Search accepts native part names, source keys and classifications. Visible 3D
parts can be selected and focused. One original part may own multiple material
primitives; these retain one source identity. Hidden default alternatives remain
listed as not displayed. Inspecting a classification never hides or recolors
parts, moves hardware, or changes the default native pose.

Classifications come from the received source metadata. They are not assembly
steps or an insertion order. Related chapter links use the pinned official
V2.4r2 2023-07-04 and Trident 2026-06-24 manuals. CNC variants and source-specific
companions still require their original instructions. The map links to each
original component's public source metadata and retains its existing notices
and licenses; it does not relabel model content as the application's MIT code.

The review checklist is personal navigation state, not mechanical validation.
It supports local resume, JSON export/load, clear and undo. Identity includes the
actual received metadata/model receipt vector, source state, classifications
and manual revision. Other machines or revisions are rejected atomically.
The regular configurators and their saved configuration formats are unchanged.

`createSourcePartsMap` binds received component roots and all rendered source
owners, checks finite world matrices, and rejects missing or unregistered model
leaves. Live commands reject retired or detached assemblies and changed source
matrices, geometry references, materials, visibility or metadata. The actual
asset gate separately hashes complete exported attributes/index and materials
before and after inspection; reference checks alone are not a byte comparison.

`scripts/check_source_parts_map_release.py` is required in the normal site build.
It runs each of all nine admitted machines in a fresh process with a 96 MiB Node
heap, small semi-space and a 120-second timeout. Missing models or receipt
failures stop the release. Its summary records each machine and identity. The
existing 73-machine coverage report and all other mandatory asset gates remain.
Independent software fixtures exercise progress and invalid/stale graph cases.
Local actual-model reviews also use external 512 MiB/120-second process limits.

Browser review covers selected search, picking, focus, progress restore,
language/theme, responsive desktop and PNG workflows. It does not establish
native-solid mating, new fastener/route clearances, whole-model GPU normals,
continuous motion, every configuration, real mobile or multiple browsers.
