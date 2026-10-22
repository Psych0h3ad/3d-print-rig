// Bind published assembly archives to their reviewed assembly identities.
// Changing an archive or identity requires the corresponding source and release review.
const baselines = [
  {
    "id": "siboor_trident_300",
    "configuration": "CNC AWD / SB / CW2 / Rapido 2 UHF",
    "revision": "JUNE",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v1/siboor-trident-june-300.step.zip",
    "path": null,
    "filename": null,
    "bytes": null,
    "sha256": null,
    "upstream": null,
    "license": null,
    "partCount": null,
    "customReference": false
  },
  {
    "id": "siboor_trident_350",
    "configuration": "CNC AWD / SB / CW2 / Rapido 2 UHF",
    "revision": "JUNE",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v10/siboor-trident-june-350.step.zip",
    "path": null,
    "filename": null,
    "bytes": null,
    "sha256": null,
    "upstream": null,
    "license": null,
    "partCount": null,
    "customReference": false
  },
  {
    "id": "voron_v24_250_printed",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_V2.4_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 55889378,
    "sha256": "03802878ca1351084ac063b24fd42449fb4bbc86f29971be18c4791d1bc38ddb",
    "upstream": "https://github.com/VoronDesign/Voron-2/tree/a192410e27ea345644ae5c4b29b4c9c40cbe1a73",
    "license": "GPL-3.0",
    "partCount": 1308,
    "customReference": false
  },
  {
    "id": "voron_v24_300_printed",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_V2.4_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 56323844,
    "sha256": "ec83e684f436536d3126ba9447e85c1b4fee0d72ad7cdba0e65d26b35c0cc1b5",
    "upstream": "https://github.com/VoronDesign/Voron-2/tree/a192410e27ea345644ae5c4b29b4c9c40cbe1a73",
    "license": "GPL-3.0",
    "partCount": 1322,
    "customReference": false
  },
  {
    "id": "voron_v24_350_printed",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-stock-v24-92/VORON_V2.4_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_V2.4_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 56612805,
    "sha256": "60a2fb8115296bb8ebe3b3e8d33cad9ba3d2cf30e8443dc37f9b7c9c358f4d36",
    "upstream": "https://github.com/VoronDesign/Voron-2/tree/a192410e27ea345644ae5c4b29b4c9c40cbe1a73",
    "license": "GPL-3.0",
    "partCount": 1336,
    "customReference": false
  },
  {
    "id": "voron_trident_250",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v42/VORON_Trident_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v42/VORON_Trident_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_Trident_R2_250_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 74535716,
    "sha256": "aa83f1861f2a2a16fd2e61cd9ed8d2cc9a6bbe0ecc977b03fceed8e2d5087518",
    "upstream": "https://github.com/VoronDesign/Voron-Trident/tree/a8628f48546948ce1fc15511b7765b7f31f80722",
    "license": "GPL-3.0 (VORON); retained CW2 component terms not declared",
    "partCount": 1330,
    "customReference": false
  },
  {
    "id": "voron_trident_300",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_Trident_R2_300_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 74991443,
    "sha256": "b08e188b53f40366c9fba6be0f23ffc0a94f42e358ee95a07287d45491a92994",
    "upstream": "https://github.com/VoronDesign/Voron-Trident/tree/a8628f48546948ce1fc15511b7765b7f31f80722",
    "license": "GPL-3.0 (VORON); retained CW2 component terms not declared",
    "partCount": 1340,
    "customReference": false
  },
  {
    "id": "voron_trident_350",
    "configuration": "R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "R2",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_Trident_R2_350_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 75699964,
    "sha256": "ba76fc2aa1084f618a072b1cbbb00a9022804c68ee1b1122978cb97df47502b1",
    "upstream": "https://github.com/VoronDesign/Voron-Trident/tree/a8628f48546948ce1fc15511b7765b7f31f80722",
    "license": "GPL-3.0 (VORON); retained CW2 component terms not declared",
    "partCount": 1348,
    "customReference": false
  },
  {
    "id": "micron_r1_120",
    "configuration": "R1 / AntHead WWG2 / Revo Voron",
    "revision": "120 R1 v4 body + RC8 head",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v23/Micron_R1_120_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v23/Micron_R1_120_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "filename": "Micron_R1_120_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "bytes": 42522888,
    "sha256": "9c4de8edcdfbce0a8eac354249c8fa9c82d5b631b97aea4c8b55736eca7cbb70",
    "upstream": "https://github.com/PrintersForAnts/Micron/tree/f76aa28767211ddfee2e30290aadcea3c45f8513",
    "license": "GPL-3.0",
    "partCount": 1074,
    "customReference": false
  },
  {
    "id": "micron_plus_r1_180",
    "configuration": "R1 / AntHead WWG2 / Revo Voron",
    "revision": "180 R1 RC8, source root v98",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v23/Micron_Plus_R1_180_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-v23/Micron_Plus_R1_180_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "filename": "Micron_Plus_R1_180_AntHead_WWG2_RevoVoron_Assy_STEP.zip",
    "bytes": 62798046,
    "sha256": "99e67b3030e2cf1c6c7bb91600340db30fbbf8c3ece5fbbf2d6c7b7492290e05",
    "upstream": "https://github.com/PrintersForAnts/Micron/tree/f76aa28767211ddfee2e30290aadcea3c45f8513",
    "license": "GPL-3.0",
    "partCount": 1512,
    "customReference": false
  },
  {
    "id": "voron_v24_500_custom",
    "configuration": "Printed R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "Custom 500 / R2 reference",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/voron500-assy-v105/VORON_V2_4_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/voron500-assy-v105/VORON_V2_4_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_V2_4_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 138539923,
    "sha256": "8ef203d877d83dbf285a28accf83133ed5e91eb13c26f3c6e73e9eefa749d6a3",
    "upstream": "https://github.com/VoronDesign/Voron-2/tree/a192410e27ea345644ae5c4b29b4c9c40cbe1a73",
    "license": "GPL-3.0",
    "partCount": 1390,
    "customReference": true
  },
  {
    "id": "voron_trident_500_custom",
    "configuration": "Printed R2 / Stealthburner / Clockwork 2 / Revo Voron",
    "revision": "Custom 500 / R2 reference",
    "url": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "path": "https://github.com/Psych0h3ad/3d-print-rig/releases/download/viewer-trident-deck-103/VORON_Trident_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "filename": "VORON_Trident_500_Custom_SB_CW2_RevoVoron_Assy_STEP.zip",
    "bytes": 169596521,
    "sha256": "2df47a15c94f9bc908dbd608040f192f9baba60589691c104f950759f75b9519",
    "upstream": "https://github.com/VoronDesign/Voron-Trident/tree/a8628f48546948ce1fc15511b7765b7f31f80722",
    "license": "GPL-3.0 (VORON); retained CW2 component terms not declared",
    "partCount": 1374,
    "customReference": true
  }
];
for (const entry of baselines) Object.freeze(entry);
export const publishedStepBaselines = Object.freeze(baselines);
const byId = new Map(baselines.map(entry => [entry.id, JSON.stringify(entry)]));
const identity = item => {
 const zip = item.step_zip || {};
 return {id:item.machine_id || item.id,configuration:item.configuration ?? null,
 revision:item.revision ?? null,url:item.url ?? null,path:zip.path ?? null,
 filename:zip.filename ?? null,bytes:zip.bytes ?? null,sha256:zip.sha256 ?? null,
 upstream:item.upstream_url ?? null,license:item.license ?? null,
 partCount:item.part_count ?? null,customReference:item.custom_reference === true};
};
export function publishedStepBaseline(item) {
 if (!item || typeof item !== 'object' || item.release_verified !== true) return false;
 if (item.id && item.machine_id && item.id !== item.machine_id) return false;
 const bound = identity(item);
 return byId.has(bound.id) && byId.get(bound.id) === JSON.stringify(bound);
}
