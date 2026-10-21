// Pinned public source identities; product sizes are not firmware travel.
const freeze = value => { if(value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const elegooAssetIndex = freeze({
  "schema": "elegoo-static-reference-assets-v1",
  "base_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-assets/",
  "local_directory": "elegoo-assets",
  "machines": [
    {
      "id": "elegoo_neptune3_reference",
      "slug": "neptune3",
      "title": "ELEGOO Neptune 3",
      "nominal_build_size_mm": [
        220,
        220,
        280
      ],
      "nominal_size_url": "https://download.elegoo.com/06%20FDM%20Printer/02%20ELEGOO%20Neptune%20Series%20Files/Neptune%203/4.%20User%27s%20Guide/1.User%20Manual/NEPTUNE%203%20User%20Guide-EN.pdf",
      "nominal_size_receipt_status": "primary-manual-confirmed",
      "nominal_size_document_sha256": "0a92bf540be8c3f2c8d1e45b4db49f5a4828f74d9721ad98fb8bfaefd28a364e",
      "size_kind": "nominal-product-specification",
      "source": {
        "repository": "https://github.com/elegooofficial/Neptune3",
        "revision": "eb98eee6a65d593a61109f51261ead01116d2cb5",
        "url": "https://github.com/elegooofficial/Neptune3/blob/eb98eee6a65d593a61109f51261ead01116d2cb5/3D/Neptune%203.3DXML",
        "sha256": "13df2d1e535c8e1bde689511d96693f2ae3229b6d295a7b27b18df0891cba58a",
        "format": "3DXML",
        "license": "GPL-3.0",
        "license_url": "https://github.com/elegooofficial/Neptune3/blob/eb98eee6a65d593a61109f51261ead01116d2cb5/LICENSE",
        "license_sha256": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
      },
      "parts": 411,
      "basis": [
        [
          1,
          0,
          0
        ],
        [
          0,
          1,
          0
        ],
        [
          0,
          0,
          1
        ]
      ],
      "files": {
        "assembly_manifest.json": {
          "path": "neptune3/assembly_manifest.json",
          "bytes": 876355,
          "sha256": "583f2a9f16062871989b2933c8148048a2c4fd3996eae2c1246d5aadb3cc86d7"
        },
        "machine_profile.json": {
          "path": "neptune3/machine_profile.json",
          "bytes": 2786,
          "sha256": "9f91ab5a3b9a555ea24005ea571b6cde2efd93db3ea36e06e899aeabdce8a804"
        },
        "model.glb": {
          "path": "neptune3/model.glb.gz",
          "bytes": 16193308,
          "sha256": "ce65142a933aecc7a7c64563bad006713d36a8b0fc15b00e518982fa8230f806",
          "encoding": "gzip",
          "decoded_bytes": 61272220,
          "decoded_sha256": "c831f5158a7671e7567f2785b1cb2325745eacae5d422c255d88ff78300eac6e"
        }
      },
      "static_reference": true,
      "motionVerified": false,
      "printedPalette": false,
      "appearance": "source-vertex-colors-opaque",
      "textures": false,
      "cadTransparency": false,
      "source_package_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/README.md",
      "license_text_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/neptune3/LICENSE"
    },
    {
      "id": "elegoo_neptune3pro_reference",
      "slug": "neptune3pro",
      "title": "ELEGOO Neptune 3 Pro",
      "nominal_build_size_mm": [
        225,
        225,
        280
      ],
      "nominal_size_url": "https://download.elegoo.com/06%20FDM%20Printer/02%20ELEGOO%20Neptune%20Series%20Files/Neptune%203%20Pro/4.%20User%27s%20Guide/1.%20User%20Manual/NEPTUNE%203%20PRO%20User%20Manual-V1.4.pdf",
      "nominal_size_receipt_status": "primary-manual-confirmed",
      "nominal_size_document_sha256": "71f9cbb2766c2730c8779068c28c59243673be3555c23b846ff120668433217d",
      "size_kind": "nominal-product-specification",
      "source": {
        "repository": "https://github.com/elegooofficial/neptune3pro",
        "revision": "fc671ca3b85bf8169609a75ed0e1e3e2695b82d4",
        "url": "https://github.com/elegooofficial/neptune3pro/blob/fc671ca3b85bf8169609a75ed0e1e3e2695b82d4/3D/Neptune%203%20Pro.3DXML",
        "sha256": "5293a146f9059b03a9e2d9837fc8bd75c534646752e90592bbd414e334e0f8c8",
        "format": "3DXML",
        "license": "GPL-3.0",
        "license_url": "https://github.com/elegooofficial/neptune3pro/blob/fc671ca3b85bf8169609a75ed0e1e3e2695b82d4/LICENSE",
        "license_sha256": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
      },
      "parts": 455,
      "basis": [
        [
          0,
          0,
          -1
        ],
        [
          1,
          0,
          0
        ],
        [
          0,
          -1,
          0
        ]
      ],
      "files": {
        "assembly_manifest.json": {
          "path": "neptune3pro/assembly_manifest.json",
          "bytes": 958643,
          "sha256": "27dda1bc4f5fff4c13f157ccd1786ee18090e4d5f3b09bc978161247dd1be61b"
        },
        "machine_profile.json": {
          "path": "neptune3pro/machine_profile.json",
          "bytes": 2813,
          "sha256": "eee6dfbb13cc3a58dbcaf577723f698adf5e24ab41ccf3826099e633481d77a6"
        },
        "model.glb": {
          "path": "neptune3pro/model.glb.gz",
          "bytes": 17085779,
          "sha256": "9fe1333b7ab51150a4b0af07e42941a22b66d64d14083944e97d55d191b47c7c",
          "encoding": "gzip",
          "decoded_bytes": 63154048,
          "decoded_sha256": "25d01ba76a518eede9a9888c2fbb5b045b4438e29ed2aeba9c20ecc71cf406ff"
        }
      },
      "static_reference": true,
      "motionVerified": false,
      "printedPalette": false,
      "appearance": "source-vertex-colors-opaque",
      "textures": false,
      "cadTransparency": false,
      "source_package_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/README.md",
      "license_text_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/neptune3pro/LICENSE"
    },
    {
      "id": "elegoo_neptune3plus_reference",
      "slug": "neptune3plus",
      "title": "ELEGOO Neptune 3 Plus",
      "nominal_build_size_mm": [
        320,
        320,
        400
      ],
      "nominal_size_url": "https://www.elegoo.com.cn/uploads/20230106/c391cffe037e638226187ce0598aa9d2.pdf",
      "nominal_size_receipt_status": "primary-manual-confirmed",
      "nominal_size_document_sha256": "4c383b012780694973d2b0d25411b8e1c707a9e0de189cbfea9a1b6480bb40f1",
      "size_kind": "nominal-product-specification",
      "source": {
        "repository": "https://github.com/elegooofficial/neptune3plus",
        "revision": "1ec2c2d9e62a54743b0eda5639b273b30d6a595b",
        "url": "https://github.com/elegooofficial/neptune3plus/blob/1ec2c2d9e62a54743b0eda5639b273b30d6a595b/3D/Neptune%203%20Plus.3DXML",
        "sha256": "a83902f5354349e717a153bfc05bc884bb84f1664608e655546c1c2d5b6a5b94",
        "format": "3DXML",
        "license": "GPL-3.0",
        "license_url": "https://github.com/elegooofficial/neptune3plus/blob/1ec2c2d9e62a54743b0eda5639b273b30d6a595b/LICENSE",
        "license_sha256": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
      },
      "parts": 536,
      "basis": [
        [
          0,
          0,
          -1
        ],
        [
          0,
          1,
          0
        ],
        [
          1,
          0,
          0
        ]
      ],
      "files": {
        "assembly_manifest.json": {
          "path": "neptune3plus/assembly_manifest.json",
          "bytes": 1132420,
          "sha256": "9c46cc042718efb9009e8a79fad215709671a6fc9c28a9c0164af01b2b6ef6ba"
        },
        "machine_profile.json": {
          "path": "neptune3plus/machine_profile.json",
          "bytes": 2825,
          "sha256": "26748cc9a37941505123310676e48f0774090058477c6d6b99cf31af6c02a4a0"
        },
        "model.glb": {
          "path": "neptune3plus/model.glb.gz",
          "bytes": 16189493,
          "sha256": "0822031956294a8049e777cbbae4e01e57982822e191025593a8060ec4f34a11",
          "encoding": "gzip",
          "decoded_bytes": 60209680,
          "decoded_sha256": "05c603b2900fd9a949c8a362154fc41ec929210477fa87565b4bad92b714b572"
        }
      },
      "static_reference": true,
      "motionVerified": false,
      "printedPalette": false,
      "appearance": "source-vertex-colors-opaque",
      "textures": false,
      "cadTransparency": false,
      "source_package_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/README.md",
      "license_text_url": "https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-sources/neptune3plus/LICENSE"
    }
  ]
});
export const elegooMachines = elegooAssetIndex.machines.map(row => ({id:row.id, label:row.title, page:"./community.html", family:"elegoo_neptune3", vendor:"elegoo", size:row.nominal_build_size_mm[0], build_size_mm:row.nominal_build_size_mm, static_reference:true, source:row.source}));
export const isElegooMachine = id => elegooAssetIndex.machines.some(row => row.id === id);
