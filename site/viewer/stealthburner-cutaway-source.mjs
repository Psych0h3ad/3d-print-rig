// Public Stealthburner, Clockwork 2 and V6 source revisions used by the lesson.
export const cutawaySource = Object.freeze({
  id: 'stealthburner_cw2_v6',
  assets: [
    {id:'sb_v6', path:'modules/sb_v6', parts:30,
      compressed_bytes:1010451, compressed_sha256:'374cc32c736fdc89a679eae3dae5c0e166ee7a710fd365637785e884d051267e',
      decoded_bytes:2781232, decoded_sha256:'3dd047e5b1f1d04c8b0d154d15ae7423a1f5309be618fd467e9e78bf494f8b9b',
      metadata_sha256:'48d6557fab77ba5d5ec6a0d09501c0eae691949084ea3edc6f7a93d6ddaa33d4'},
    {id:'head_sb_cw2', path:'modules/head_sb_cw2', parts:53,
      compressed_bytes:1154461, compressed_sha256:'2da4a58bbd267a383bb504cf5cd53f7ea5944726e386369903595d621df8364f',
      decoded_bytes:3355124, decoded_sha256:'d7b613a9aa14146839b2651f093922dad6ffee103ebeac789992548a43280c71',
      metadata_sha256:'7c4d4358ff1c792806bb5b585ecdc54a03bd816e26852936251811daea4d0d74'},
  ],
  nozzle_mesh:{path:'./stealthburner-v6-nozzle.json',bytes:482509,
    sha256:'a3238197ff45621d546e4f412b6252bee376a5aaadb4774fd2868867918a1f3f',
    source_step_sha256:'00613b8e448d663dee0673cfb1a9c2b826e33fc4e6dfdb56ba88d2e28e664eb5',
    source_brep_sha256:'154b9462977f0f81cc4368c39e9c734d851fdd65582acf1f9a871bd168a6eb22',
    source_revision:'9ebb6bc38ac3a73d513c1d4beb0f88e9061c9073',license:'GPL-3.0',
    source_face_ids:[185104,185105,185106,185107,185108,185109,185110,185111,185112,185113,185114,185115,185116,185117,185118,185119,185120,185121,185122,185123,185124,185125]},
  // Native millimetres, Z up. All original exported placements are retained.
  nozzle_mm:[0,-28.76,312.1], inlet_mm:[0,-28.76,442], drive_mm:[0,-28.76,398.409],
  heatbreak_mm:[0,-28.76,330.7], sink_mm:[0,-28.76,350],
  hot_keys:['sb_v6_hot_83','sb_v6_hot_84','sb_v6_hot_85'],
  heatbreak_key:'sb_v6_hot_82', sink_key:'sb_v6_hot_86', ptfe_key:'sb_v6_hot_87',
  fan_key:'sb_v6_front_15', part_fan_keys:['sb_v6_front_13','sb_v6_front_14'],
  cap_keys:['sb_v6_hot_82','sb_v6_hot_83','sb_v6_hot_84','sb_v6_hot_85','sb_v6_hot_86','sb_v6_hot_87',
    'sb_v6_mount_0','sb_v6_mount_1','sb_v6_front_6','head_sb_cw2_19','head_sb_cw2_21','head_sb_cw2_64','head_sb_cw2_65','head_sb_cw2_69'],
  source_revisions:[
    {name:'Stealthburner / Clockwork 2', repository:'VoronDesign/Voron-Stealthburner', revision:'8bcb9c246fac19d8ac03931ef97fa07c5e5f0f2b', license:'GPL-3.0', license_path:'licenses/stealthburner/LICENSE'},
    {name:'E3D V6 · Afterburner CAD', repository:'VoronDesign/Voron-Afterburner', revision:'9ebb6bc38ac3a73d513c1d4beb0f88e9061c9073', license:'GPL-3.0', license_path:'licenses/afterburner/LICENSE'},
  ],
});
export const nativeToDisplay = ([x,y,z]) => [x*.001,z*.001,-y*.001];
