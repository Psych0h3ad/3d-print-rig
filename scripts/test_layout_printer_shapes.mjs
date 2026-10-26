// Catalog/static-source regression only. No model loader, native CAD or GPU QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {machineChoices} from '../site/viewer/machines.js';
import {elegooAssetIndex} from '../site/viewer/elegoo-catalog.mjs';
import {printerSilhouetteParts, printerSilhouetteSourceRoles} from '../site/layout/layout-printer-shapes.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const catalog = read('../site/layout/layout-catalog.json');
const provenance = read('../site/layout/layout-provenance.json');
const source = fs.readFileSync(new URL('../site/layout/layout-printer-shapes.mjs', import.meta.url), 'utf8');
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// BEGIN SOURCE EXPECTATIONS
const expectedProfiles = new Map([
  [
    "doomcube2_350_reference",
    {
      "count": 19,
      "metadataPins": [
        "08072ed2c19bc2717f8bb79262ddac8fbcdad863da889379e608d3d19efa24bc",
        "b04011b2b8e30e809d7525a648d5ba2bc028f49fef6f81fdf34fc9c390402118"
      ]
    }
  ],
  [
    "tictac_21_120",
    {
      "count": 6,
      "metadataPins": [
        "42b70bdb95b82c6f1a672e72fc00bd3465639ba2a226d1b87e8b714d70ea8728",
        "89da83ea8ee5509911787943371d2b5ac19a34b87bcabc7b4cdf25a2e73d410b"
      ]
    }
  ],
  [
    "rook_mk2_120",
    {
      "count": 7,
      "metadataPins": [
        "c77aac373926533e051d7f73a088570c955f303c1f0979ea5156fd871cf680a8",
        "b5092cbb977d4393936762dd8b0f27d1fb49f16acb02e9acf41f3512d54e4285"
      ]
    }
  ],
  [
    "satsuma180_v10",
    {
      "count": 10,
      "metadataPins": [
        "eed5ca4e5c1296e73485b2f38c12ede765b807f8925e736d68c4ff2db3b76e31",
        "01a7d515672dfb4d2de5b80db133af9569e8c3b394d7382f3f32716c90f73d35"
      ]
    }
  ],
  [
    "sovol_sv08_350",
    {
      "count": 7,
      "metadataPins": [
        "04e6fbd0d100a2591af35addcf4840f83c598b6055903b6a0aa741e126767779",
        "a3cfbbaffea070b1be0496ddce9af1709e40839301ba79668a54a2029a73337c"
      ]
    }
  ],
  [
    "lh_stinger_200",
    {
      "count": 5,
      "metadataPins": [
        "db700b832ec91d5c7a8cc1431c49292fa6b70282970783a53b991885a7e75a8c",
        "2d14191afaad6655b277e2f98292742bbfc1531a5adc10b83713a4f157a6eb37"
      ]
    }
  ],
  [
    "antithesis_aether_mk11",
    {
      "count": 4,
      "metadataPins": [
        "aeaa609e8734e0c5775369d09f0d90265a85d2a05959da08bce8779310d77ce6",
        "597d91abbd4b51c8f1d047eb1e1712c0fecb1cf1c8a1fda14ed041bb9e79ae05"
      ]
    }
  ],
  [
    "ratrig_vminion_180",
    {
      "count": 9,
      "metadataPins": [
        "11e2f61fdcf9620abe3978741643f23e632a9b3fa4014fb19b0378e76727d45e",
        "e57ab95a3cd6f67ce78bc735b44cad19a34d50e26a8fd101375e936a18536a2c"
      ]
    }
  ],
  [
    "snakeoil_xy_180",
    {
      "count": 10,
      "metadataPins": [
        "2b935ba30f24fc72d0429b1f291d2cd6fac329751ea543a096159c31f9527334",
        "0f6f169a75184bbf6192ab060861725b2554941ac8f9368b9aec3eea818c2ecf"
      ]
    }
  ],
  [
    "snakeoil_xy_idex",
    {
      "count": 10,
      "metadataPins": [
        "dd783a68fb36c58d6bc1ef7ebceba6dd3efdea150ede647a2061782628e79e6f",
        "1d0780969959aef9d9deff75123c9b792880b8e60f98b1b959487d236d3b021a"
      ]
    }
  ],
  [
    "snakeoil_3s_kp3s_180",
    {
      "count": 1,
      "metadataPins": [
        "dae4005386e415d45933cd561466af48465e2393b5c1892805325b46990b4409",
        "02da6808d34ba7b9fad880aac99cbb43ceebdc0a0cce6053744b6cc319403e87"
      ]
    }
  ],
  [
    "snakeoil_proosaxy",
    {
      "count": 4,
      "metadataPins": [
        "22d90dc33f09499d90499df9d4ccf533135f6cb2dc768277364bf03aae73998f",
        "73ed7309c243868d66469a1a25da058de906b1bc9887ab8e69bbd713f2bbd4d7"
      ]
    }
  ],
  [
    "mercury_one1_235",
    {
      "count": 7,
      "metadataPins": [
        "bcdcf5d4f8b1a22f73e088d1b8e892930fd02d938f067314167ffaf1052fefdf",
        "b8cf9b30f8a22f39e59e8d95b53ee5671a5a457853fac553d71113fa17df1ff3"
      ]
    }
  ],
  [
    "mercury_one1_370",
    {
      "count": 6,
      "metadataPins": [
        "fbc36ad7d011c0e56228b953db4a3c5f06807ce28e74715501c9540dc68f8a31",
        "ebfea1d468618f75b04d972d96b8687b0b46935e88f775099b2c331268d4fca4"
      ]
    }
  ],
  [
    "vzbot_330_printed",
    {
      "count": 13,
      "metadataPins": [
        "c287d2108da5ee2e7c99d906faf28be264e433f2d99b10bb3dd7dea4ea771cb5",
        "b8e1a57db4ad049bdbd35d90636247457eaeb6780224bfd87d3d5baf3a39b6b1"
      ]
    }
  ],
  [
    "ender3_stock_220",
    {
      "count": 7,
      "metadataPins": [
        "e4c230fb2d228af5c7670b62bffddc675840766445269bfec9b6790db835646f",
        "c10ef0e862cbc2cc065e79153a1ec9da8ec60b0adeef4d5f24290156787f4c03"
      ]
    }
  ],
  [
    "siboor_sboom_220",
    {
      "count": 5,
      "metadataPins": [
        "5f843b0c61495ad1aa8f771c4409558967d7e9f54d9982c0ebc83aff99d96628",
        "42845d6413ba8c29e97d2415bc7043d5e6aa8c86f6a7789873560aabbd8a76d8"
      ]
    }
  ],
  [
    "annex_k1_assembly",
    {
      "count": 12,
      "metadataPins": [
        "5f03cae4efec2c39bff780553028c7fcdfe61ef043e61dedb7702cccaaeef7af",
        "cf5720e5a34784a40eb5c693ecbb3bc2f995bad0305db9b67a3b4aae0e5d0f1b"
      ]
    }
  ],
  [
    "annex_k2_assembly",
    {
      "count": 12,
      "metadataPins": [
        "c44ebc69b8e7c66878d2778ab6430d247c3fd052e31e93471745a38e5e92efe4",
        "c9ad3f40dba5c0b475893c9c9754d3bd00f269aa758bd5180d9d339e3760399c"
      ]
    }
  ],
  [
    "annex_k3_assembly",
    {
      "count": 11,
      "metadataPins": [
        "a53b1ed063fd42d965a5ed6ff31cf7c1983d3feb7bfaf7f5462c32569191e930",
        "c467952db5930bde4553e19c6e98061cb122e87a19a7795fbc17c77de7160c7a"
      ]
    }
  ],
  [
    "remorph_beta1_307",
    {
      "count": 13,
      "metadataPins": [
        "9044189b483881ed719e2b44455e38e0c5f53ecef46c70cdb3dc957289839735",
        "997cb8ea35695ee1b56d77eec3b42011c5902d621e8fd9ed35411891ba2626c4"
      ]
    }
  ],
  [
    "siboor_trident_300",
    {
      "count": 9,
      "metadataPins": [
        "519def1433c254b8685af09d18b013723164deb5a32704e1f9e2fcb8e7027afb"
      ]
    }
  ],
  [
    "siboor_trident_350",
    {
      "count": 9,
      "metadataPins": [
        "4fe7fed76a8c003aa652bed57608026dad7b1953ac7b4b589a990d47ff74dadf"
      ]
    }
  ],
  [
    "voron_trident_250",
    {
      "count": 16,
      "metadataPins": [
        "64a681faee6c50a1c80707f71a5a45e42176a9c14595bd630a00aede4a2626ca",
        "b21051cbb36cb6ef05874f8eb9cbd59d0f13efba28d9805d4f1d4218c21e478b"
      ]
    }
  ],
  [
    "voron_trident_300",
    {
      "count": 16,
      "metadataPins": [
        "504593577292b209f9cf32c26a16cc735a42c0d1705570ccfab7df341c57f438",
        "c28b590d64bf242514f9f25dcfa89d8ee64e56878480966087ec347936b818a0"
      ]
    }
  ],
  [
    "voron_trident_350",
    {
      "count": 16,
      "metadataPins": [
        "c30875c2cdae7b7ee59618a76cb2e3fd3285e439a666e0f5f6c441bec7b9b173",
        "ce0edf0434c215f7422e6522ca7e68db95fc4429598bfeeab988876aed6a2b70"
      ]
    }
  ],
  [
    "siboor_v24_350",
    {
      "count": 24,
      "metadataPins": [
        "25be4131a6198d7ec2f42bffc367fd136dc465f51e9ca814f821a282b02b67aa",
        "ddc328b4a53fa53f4cee85fd533ac47eb8441b92b08873c261ad7212f5b9f4ae"
      ]
    }
  ],
  [
    "voron_v24_250_printed",
    {
      "count": 24,
      "metadataPins": [
        "b6c591e56f2c637e86ad0fd54e7a6e2235119a13156e7ae69144b26b84104279",
        "16c3a36dea81bae86155d3ec9520e0d3e8cbf5792a85961e838195bb2c044ee5"
      ]
    }
  ],
  [
    "voron_v24_250_ldo_cnc",
    {
      "count": 24,
      "metadataPins": [
        "c3554b251bb2b6dd9f8eb11c1d2398d0eda55687bf1d5c47259d89a47c2cd229",
        "e26d865bc6f5862f33dd8c938bd40abe397f6e000dc8403b6991667882a9af8c"
      ]
    }
  ],
  [
    "voron_v24_300_printed",
    {
      "count": 24,
      "metadataPins": [
        "269cb96ccb68d2a15dd8406509afcd4ce43d19b2cbdf2907ac73ed17ce4e2d69",
        "fcfc04264da6ad47d4d95cf5ac3af91c527a63e7eda37d16260a4e50dcff6241"
      ]
    }
  ],
  [
    "voron_v24_300_ldo_cnc",
    {
      "count": 24,
      "metadataPins": [
        "b0d72b1f8d8a180a8fe0007194fd12340099d4f678022d204f7a2ff7f80a0eb2",
        "d52229f602d906f52fe9109bdb6c31a0d23bb9f86970869dcf77d65b59545b3d"
      ]
    }
  ],
  [
    "voron_v24_350_printed",
    {
      "count": 24,
      "metadataPins": [
        "dfff39a5b4b6c32a3f06be08ecc19830fd7b1a31ee73fd006c0a9465f1037716",
        "41f5a89c9528683497020ebaa3f007d86bdb8a337df552b1d333c3c62916d755"
      ]
    }
  ],
  [
    "voron_v24_350_ldo_cnc",
    {
      "count": 24,
      "metadataPins": [
        "95ee1b913749edc996b6707fbdbfae47dafa716f3aed2402bf03703e9cf2c170",
        "5724e420cd995003f50bc74a416560b5cf880e8a678436f9c1809ed45c5f369a"
      ]
    }
  ],
  [
    "voron_v02r1_120",
    {
      "count": 17,
      "metadataPins": [
        "3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea",
        "0ebce269e0deecadd899143e52111643400ebb0e3e10cb218ef3179b63e1abbc"
      ]
    }
  ],
  [
    "voron_v02_120",
    {
      "count": 17,
      "metadataPins": [
        "16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c",
        "174c70c1011da7b6d28e2f465d406a1ae5a30e10300b61c50aade95310dd513d"
      ]
    }
  ],
  [
    "micron_r1_120",
    {
      "count": 17,
      "metadataPins": [
        "0fd62cc618db12a608123368ee063fe72a556138d8761f88beeaa02789a7d577",
        "dc8c15db4d7e07bba6b8f8b79db10340a1817c0f4e3d72f54d0d274e5a091901"
      ]
    }
  ],
  [
    "micron_plus_r1_180",
    {
      "count": 15,
      "metadataPins": [
        "d135e8c7d7f3b0f1f7d69b863e9836905e21cdc2193e0eaa9cde15798cb08a64",
        "ef201188dd6c2bfd9be2156a104a85fd0d679be60ac472839b22608ca02ddcd7"
      ]
    }
  ],
  [
    "fysetc_v24_250_pro",
    {
      "count": 13,
      "metadataPins": [
        "a7789b3ff5c999da085610156379efa3c18f3a087a9f18e74a2aa9ad0bbff782",
        "839883aa01513e02b1caedfc72e7ee3c1f1c85c77520e614004b8464afdd3cf1"
      ]
    }
  ],
  [
    "ratrig_vcore_40_300_corexy",
    {
      "count": 12,
      "metadataPins": [
        "5de530a097557e4a89eae7828250b48140f62792f3176ff0a9a464d64bb55d9c",
        "e359c0baf07b1fb01cd2f629224dee9a3a42c7dc03f5b65c3262f4a1a1052e7c"
      ]
    }
  ],
  [
    "ratrig_vcore_40_300_hybrid",
    {
      "count": 12,
      "metadataPins": [
        "28bb926243e042d18027d0319578fcd618287286d96b5fbb15af58d72ab85162",
        "7282c0fce83623d6926abb71315fe88970299a98e472d30da97ff79166ee579f"
      ]
    }
  ],
  [
    "ratrig_vcore_40_300_idex",
    {
      "count": 13,
      "metadataPins": [
        "b13702d299873da775a7b83bede0df2dd1505d6c7de02571b4f582a69bf97434",
        "46e7d4daebd391883a31de74e4ee099da799ea36ea1811550cfb0efc80f9dcd8"
      ]
    }
  ],
  [
    "ratrig_vcore_40_400_corexy",
    {
      "count": 12,
      "metadataPins": [
        "a6faec25171947cca022d50edf69a370a66526d41c366fea364efe86deca6f9e",
        "2af7b9fbce03ba5c668e79ca6b629b8072426aea730a6f53f65d52ed16229aa1"
      ]
    }
  ],
  [
    "ratrig_vcore_40_400_hybrid",
    {
      "count": 12,
      "metadataPins": [
        "75f77fcf7d2308301044e356ceb2f58de666282c3e5d8e37177b5df50b8f5083",
        "894b2be93dd459805a827cf6f7342d6cd33bbcffcb349e64bbca437e0e4433e1"
      ]
    }
  ],
  [
    "ratrig_vcore_40_400_idex",
    {
      "count": 13,
      "metadataPins": [
        "c215260e3f81fe9c3684c143687124de52e8df4f63b7393e8f57ed17e328c08f",
        "e0e9a39c70bcfd3ba2bbf9e5a7b48611b48e4f7e6a70dfd5cfc37bd7577bee21"
      ]
    }
  ],
  [
    "ratrig_vcore_40_500_corexy",
    {
      "count": 12,
      "metadataPins": [
        "5cdb8df68e548b350abef6ee8dd33fd1bb1cfd57b01544ca96ffb9c27b1da8af",
        "71fb1fb5b6ae34519e6b2480949341a9758282ce1319f043f071b4eb34b07052"
      ]
    }
  ],
  [
    "ratrig_vcore_40_500_hybrid",
    {
      "count": 12,
      "metadataPins": [
        "601dd31329464f39d3e70acba0d0084d586471fc31411f245848f4c1391917a7",
        "b53d3d130e88ba3bddc5bb36b534f3af8f3ffd428eea8174b5aca980ae309f11"
      ]
    }
  ],
  [
    "ratrig_vcore_40_500_idex",
    {
      "count": 13,
      "metadataPins": [
        "e33129fa302509c117dd55cf0c7638adc2b077f674a659b97bdeddd15864804c",
        "59c441594dcc936bc80d99bcb81324320d8daea5e6dad1760253ba2d5e0bbc06"
      ]
    }
  ],
  [
    "ratrig_vcore_41_300_corexy",
    {
      "count": 11,
      "metadataPins": [
        "387a5b4d1304ff1fef1be327f8ec7250722efae874fb315a30116b036ed138f6",
        "1e154c8bde709ecd5688580717efd322e77b30d108d91d5ee6aee94f390c3f18"
      ]
    }
  ],
  [
    "ratrig_vcore_41_300_hybrid",
    {
      "count": 11,
      "metadataPins": [
        "fe38f77829ebd83f3c9e528e74c1d37829e5b41cb8c598f58b4de8652fb7ef6b",
        "a6395004a23229130e3fd53870433286a9a420e174a45ae43fe78eee64c97c03"
      ]
    }
  ],
  [
    "ratrig_vcore_41_300_idex",
    {
      "count": 13,
      "metadataPins": [
        "8f3ebd8a3f95a4efb13533859d85e05127d9330cc2e7c1cb827c3a6cd4ba9678",
        "2538eea85a3d3fdd9adf9051a9d40d8d427f91cf850eb7083b6eeac03bddb568"
      ]
    }
  ],
  [
    "ratrig_vcore_41_400_corexy",
    {
      "count": 11,
      "metadataPins": [
        "c449d8cf4d7cf64807cb92a39d2dbec0bb4c30874aee6e205b7fb4109aecdde8",
        "acc9c1470cdc666243d0b045c4d2f6939684e4c4143205856379afbaede85e5a"
      ]
    }
  ],
  [
    "ratrig_vcore_41_400_hybrid",
    {
      "count": 11,
      "metadataPins": [
        "c05daa3c16c37de847b3678768f8a440d04337681f1269a4a3956c9be8f1321e",
        "3de8bd6fa40f2395c26dea878894025a389045fbdac3a439f66616dda4513a3a"
      ]
    }
  ],
  [
    "ratrig_vcore_41_400_idex",
    {
      "count": 13,
      "metadataPins": [
        "08ad21ac70787c878a5ce4d50f414602a29ac7bc57f1db386c1d56b26c952e9f",
        "254a51b0d608eb54cd27b831aadc6a7b0dc376e0e700f14db81a618572152660"
      ]
    }
  ],
  [
    "ratrig_vcore_41_500_corexy",
    {
      "count": 11,
      "metadataPins": [
        "042cdd96663e0a3a58fd445970e9af1f63bd9c08c99c6d9ca4bdb71d9a8258f8",
        "1aa782d896649e824f9115137136a10f58921eb938645bef5ec2add77842c57c"
      ]
    }
  ],
  [
    "ratrig_vcore_41_500_hybrid",
    {
      "count": 11,
      "metadataPins": [
        "2f4d7bdb02a659c8c964ad6b4dcdba5faf4bc3272c9408932648177707cffd56",
        "3cf5752a9bd3d3d668cb4a87571b3c9e57c2126976fa3a1f05e80c0cf36d59f6"
      ]
    }
  ],
  [
    "ratrig_vcore_41_500_idex",
    {
      "count": 13,
      "metadataPins": [
        "75610fa0e4a933a0d3cc77ba7999efbf5829ac8f8110db4649f0e9bb7672a84d",
        "8dc0e721b2d2a69bf555899acb721cb1b381ff627136c5bef15c042f72b40325"
      ]
    }
  ],
  [
    "247zero_beta2_120",
    {
      "count": 12,
      "metadataPins": [
        "e067cb4ee63d00f0826442d76db48ee004255a51a3bed2e889d0125aed7da0b0",
        "5ee3d6ec812b31a68e7d6491aff5657bb2e5ebf671f6989a0ad3661dc871a1e7"
      ]
    }
  ],
  [
    "ratrig_vcore31_300",
    {
      "count": 6,
      "metadataPins": [
        "c189b953685eb811c9fa9a2fe0d0aafbda169dcaf24c3ceee3294e186f7ab185",
        "6ca2464c60b71f1911de34b57747f2cb4ead800b053beb2c2a04ee252564ec33"
      ]
    }
  ],
  [
    "voron_switchwire_250",
    {
      "count": 13,
      "metadataPins": [
        "703f4a92ee026b6e1c4ef5603691e394aa8919b0755330d07a94775b09ca0dfc",
        "4045df6338cb419a7bba1eb5b28c34e9ccdb88ae19fa5aa9c0b55be65b20b074"
      ]
    }
  ],
  [
    "elegoo_neptune3_reference",
    {
      "count": 5,
      "metadataPins": [
        "583f2a9f16062871989b2933c8148048a2c4fd3996eae2c1246d5aadb3cc86d7",
        "9f91ab5a3b9a555ea24005ea571b6cde2efd93db3ea36e06e899aeabdce8a804"
      ],
      "annotations": {
        "201": "spool",
        "211": "display",
        "217": "display",
        "219": "display",
        "231": "base",
        "329": "base",
        "330": "base",
        "331": "base",
        "333": "base",
        "358": "base",
        "394": "base",
        "397": "base"
      }
    }
  ],
  [
    "elegoo_neptune3pro_reference",
    {
      "count": 6,
      "metadataPins": [
        "a90fb280a1f4f737bc1a2aa7ca5976f7dc86804cc9f224b37126c729a52c2680",
        "152e3ab016dc83e0d2a4c1b1d456e15165b9de3bd895da27fb4395ac35ac2c68"
      ],
      "annotations": {
        "104": "head",
        "216": "display",
        "217": "display",
        "232": "display",
        "301": "spool",
        "321": "base",
        "322": "base",
        "323": "base",
        "368": "base",
        "388": "base",
        "405": "base",
        "408": "base",
        "418": "bed"
      }
    }
  ],
  [
    "elegoo_neptune3plus_reference",
    {
      "count": 6,
      "metadataPins": [
        "cd38dfb11cea1d47f4e32405c500ed1312baa939fc873dc6eebda96ca68f79a8",
        "bcc1ae859360ac42cd86dc6fa22e93580c0a5d0715cf35b1aa9221a1ac80a385"
      ],
      "annotations": {
        "5": "spool",
        "30": "base",
        "31": "base",
        "35": "base",
        "83": "base",
        "128": "base",
        "208": "base",
        "250": "base",
        "262": "base",
        "357": "display",
        "359": "display",
        "361": "display",
        "508": "head"
      }
    }
  ]
]);
const fallbackIds = [
  "the100_v11_165",
  "positron_v322",
  "voron_trident_500_custom",
  "voron_trident_1000_custom",
  "voron_trident_350_half_z",
  "voron_v24_500_custom",
  "voron_v24_1000_custom",
  "voron_v24_350_half_z",
  "crossant_235_v06_leadscrew",
  "rh3d_virtu_may_230"
];
const sourceWitnesses = [
  {
    "id": "ender3_stock_220",
    "key": "00125",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -34.387938556601654,
        156.88893164416118,
        50.19999999999794
      ],
      [
        22.61206154339835,
        211.58893174416116,
        95.20000009999795
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#25292c"
  },
  {
    "id": "ender3_stock_220",
    "key": "00236",
    "proxyRole": "bed",
    "nativeBoundsMm": [
      [
        -117.49999999999979,
        100.96373853886155,
        -53.78679214171703
      ],
      [
        117.5000000000002,
        101.46373853886155,
        181.213207858283
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#b9bec4"
  },
  {
    "id": "voron_v24_350_printed",
    "key": "v24_00184",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -32.56949677293549,
        -75.70021145413823,
        87.47074197516896
      ],
      [
        32.56866158084903,
        -43.90021335294008,
        214.27328434700547
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#d10b13"
  },
  {
    "id": "voron_v24_350_printed",
    "key": "v24_01261",
    "proxyRole": "panel",
    "nativeBoundsMm": [
      [
        -261.0000000000133,
        -241.4999996548952,
        13.499999702088076
      ],
      [
        -257.9999999999942,
        241.50000034520048,
        516.4999997020896
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#a1c7d4",
    "opacity": 0.14
  },
  {
    "id": "voron_v24_350_printed",
    "key": "v24_00859",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        -209.99950057385655,
        -254.9999238370458,
        -66.00011385408034
      ],
      [
        -59.499919449810996,
        -234.9999238370253,
        1.0000000001059517
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#0f1113"
  },
  {
    "id": "siboor_trident_300",
    "key": "1271",
    "proxyRole": "panel",
    "nativeBoundsMm": [
      [
        -236.00000010002165,
        -216.50000010003347,
        13.499999899982319
      ],
      [
        -232.99999989997335,
        216.50000010007366,
        486.5000001000144
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#c4e3f2",
    "opacity": 0.12
  },
  {
    "id": "ratrig_vcore_40_300_idex",
    "key": "rr_01146",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -233.99777725394543,
        -48.226399459424464,
        474.6399045105945
      ],
      [
        -185.60222139018256,
        -5.426356889231997,
        500.14000010006265
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0.1999993220661267,
      0,
      0
    ],
    "color": "#22a744"
  },
  {
    "id": "ratrig_vcore_40_300_idex",
    "key": "rr_01923",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        185.60222206810366,
        -48.22639945942326,
        474.6399045105945
      ],
      [
        233.99777793186652,
        -5.426356889230798,
        500.14000010006265
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      -0.19999999998299245,
      0,
      0
    ],
    "color": "#22a744"
  },
  {
    "id": "mercury_one1_235",
    "key": "00258",
    "proxyRole": "spool",
    "nativeBoundsMm": [
      [
        237.29507583344864,
        94.99999990000308,
        143.49999990000398
      ],
      [
        305.295075833449,
        295.0000001000031,
        343.500000100004
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#24272c",
    "shape": "cylinder",
    "axis": "x"
  },
  {
    "id": "ratrig_vminion_180",
    "key": "260",
    "proxyRole": "bed",
    "nativeBoundsMm": [
      [
        -19.500002515185912,
        -182.99999973623886,
        115.49999786019286
      ],
      [
        164.49999749971522,
        11.000000263761194,
        116.00000334382061
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      -70,
      0,
      0
    ],
    "color": "#b9bec4"
  },
  {
    "id": "lh_stinger_200",
    "key": "2",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -16.411313909789808,
        208.40896824922888,
        65.04536891452437
      ],
      [
        67.59989716582625,
        266.1045038911316,
        168.18966588130954
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      -25.6015627891716,
      97.3065782729323,
      263.16013762433
    ],
    "color": "#24272c"
  },
  {
    "id": "antithesis_aether_mk11",
    "key": "156",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -59.00000000000105,
        -524.0999999999998,
        108.9999999
      ],
      [
        13.500000099999278,
        -475.89999999999975,
        129.70000010000018
      ]
    ],
    "M": [
      [
        0,
        -1,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        -1,
        0,
        0
      ]
    ],
    "T": [
      -500,
      67,
      -44
    ],
    "color": "#24272c"
  },
  {
    "id": "rook_mk2_120",
    "key": "185",
    "proxyRole": "panel",
    "nativeBoundsMm": [
      [
        -131.40024483389155,
        -195.29073661032933,
        13.700002980231869
      ],
      [
        -129.4002446338905,
        2.3092633896713757,
        211.30000298023202
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      2.3714643759831233e-7,
      38.000000100000065,
      -82.95020569290399
    ],
    "color": "#b4c5ce",
    "opacity": 0.18
  },
  {
    "id": "remorph_beta1_307",
    "key": "remorph_02577",
    "proxyRole": "panel",
    "nativeBoundsMm": [
      [
        -199,
        -280.00000393899995,
        46.000002779
      ],
      [
        199,
        -275.99999999997345,
        684.000002779
      ]
    ],
    "M": [
      [
        1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        -1,
        0
      ]
    ],
    "T": [
      0,
      0,
      0
    ],
    "color": "#8ca8b5",
    "opacity": 0.22
  },
  {
    "id": "doomcube2_350_reference",
    "key": "132",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        -275.1100759287128,
        -236.5955687811767,
        270.00000052153956
      ],
      [
        -234.99931192217178,
        -72.98074882630051,
        333.0783689983782
      ]
    ],
    "M": [
      [
        -1,
        0,
        0
      ],
      [
        0,
        0,
        1
      ],
      [
        0,
        1,
        0
      ]
    ],
    "T": [
      0,
      351.9997846119152,
      0
    ],
    "color": "#24272c"
  },
  {
    "id": "elegoo_neptune3_reference",
    "key": "235",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        -147.603035,
        -36.175629000000235,
        403.661476
      ],
      [
        -107.603035,
        393.824371,
        423.661476
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#868686"
  },
  {
    "id": "elegoo_neptune3_reference",
    "key": "233",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        -147.60303500000003,
        393.824374,
        403.661478
      ],
      [
        182.396965,
        413.824374,
        423.661478
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#868686"
  },
  {
    "id": "elegoo_neptune3_reference",
    "key": "24",
    "proxyRole": "head",
    "nativeBoundsMm": [
      [
        -14.183206999999996,
        40.72375000000001,
        456.361496
      ],
      [
        55.433193,
        108.37755000000001,
        510.505246
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#868686"
  },
  {
    "id": "elegoo_neptune3_reference",
    "key": "313",
    "proxyRole": "bed",
    "nativeBoundsMm": [
      [
        -99.90301799999999,
        22.674388,
        358.040543
      ],
      [
        135.09698200000003,
        22.924388000000096,
        605.0405430000001
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#4f4f4f"
  },
  {
    "id": "elegoo_neptune3pro_reference",
    "key": "245",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        547.7955059999999,
        -207.310587,
        31.02084400000001
      ],
      [
        977.7955059999999,
        -187.310587,
        71.02084400000001
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#2d384b"
  },
  {
    "id": "elegoo_neptune3pro_reference",
    "key": "241",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        972.495502,
        -209.765788,
        -265.979176
      ],
      [
        1002.7955019999999,
        -184.855288,
        71.020824
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#2e364b"
  },
  {
    "id": "elegoo_neptune3pro_reference",
    "key": "420",
    "proxyRole": "bed",
    "nativeBoundsMm": [
      [
        592.095498,
        -468.274811,
        -214.63877000000008
      ],
      [
        592.595498,
        -223.274811,
        20.361229999999935
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#ff8c00"
  },
  {
    "id": "elegoo_neptune3plus_reference",
    "key": "221",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        14.752349999999979,
        7.732848999999987,
        168.5
      ],
      [
        34.75234999999998,
        565.732849,
        208.5
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#2e2e2e"
  },
  {
    "id": "elegoo_neptune3plus_reference",
    "key": "239",
    "proxyRole": "base",
    "nativeBoundsMm": [
      [
        14.752349999999979,
        565.732822,
        168.5
      ],
      [
        34.75234999999998,
        585.732822,
        608.5
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#2e2e2e"
  },
  {
    "id": "elegoo_neptune3plus_reference",
    "key": "346",
    "proxyRole": "bed",
    "nativeBoundsMm": [
      [
        -63.51139699999999,
        56.582840000000004,
        223.500044
      ],
      [
        281.488203,
        56.98284,
        553.500144
      ]
    ],
    "M": [
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
    "T": [
      0,
      0,
      0
    ],
    "color": "#ffd76f"
  }
];
// END SOURCE EXPECTATIONS

const registered = machineChoices.filter(r => r.available !== false).map(r => r.id).sort();
assert.equal(registered.length, 72, 'Register a silhouette or explicit fallback for every available machine');
assert.deepEqual(catalog.machines.map(r => r.id).sort(), registered);
assert.deepEqual([...expectedProfiles.keys(), ...fallbackIds].sort(), registered);
assert(Buffer.byteLength(source) <= 150 * 1024, 'Bounded preview module budget');
assert.doesNotMatch(source, /\b(?:import|require|fetch|XMLHttpRequest|WebSocket|Worker|THREE|process|localStorage|indexedDB)\b/);
assert.doesNotMatch(source, /\b[A-Z]:[\\/]|file:\/\/|private|handoff|chat context/i);
assert.deepEqual(Object.keys(await import('../site/layout/layout-printer-shapes.mjs')), ['printerSilhouetteParts', 'printerSilhouetteSourceRoles']);

// Running the same module in an isolated realm makes accidental runtime I/O fail.
let externalAttempts = 0;
const sandbox = {};
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'window', 'document',
  'navigator', 'process', 'require', 'localStorage', 'indexedDB']) {
  Object.defineProperty(sandbox, name, {get() { externalAttempts++; throw Error('Unexpected external access: ' + name); }});
}
const isolated = vm.runInNewContext(source.replace(/^export function /gm, 'function ') +
  '\n({parts: printerSilhouetteParts, roles: printerSilhouetteSourceRoles});', sandbox, {timeout: 1000});
const before = JSON.stringify(catalog);
freeze(catalog);
const byId = new Map(catalog.machines.map(r => [r.id, r]));
const coverage = [];
let descriptorCount = 0, glazingCount = 0;
const roles = new Set(['bed', 'base', 'head', 'panel', 'display', 'spool', 'motor']);
const allowed = new Set(['sizeM', 'centerM', 'color', 'proxyRole', 'sourcePartKey', 'shape', 'axis', 'previewCue', 'opacity']);
function currentMetadata(row) {
  const pr = provenance.machines.find(p => p.id === row.id);
  if (pr) return pr.sourceEvidence.metadata;
  const entry = elegooAssetIndex.machines.find(e => e.id === row.id);
  return Object.entries(entry?.files || {}).filter(([name]) => name.endsWith('.json')).map(([, pin]) =>
    ({sha256: pin.sha256, publicURL: elegooAssetIndex.base_url + pin.path}));
}
for (const row of catalog.machines) {
  const parts = printerSilhouetteParts(row), expected = expectedProfiles.get(row.id);
  const semanticRoles = printerSilhouetteSourceRoles(row);
  assert.equal(Object.getPrototypeOf(semanticRoles), Object.prototype);
  assert(Object.values(semanticRoles).every(r => roles.has(r)));
  assert.deepEqual(JSON.parse(JSON.stringify(isolated.roles(row))), semanticRoles);
  assert.equal(parts.length, expected?.count ?? 0, row.id + ': unexpected source coverage');
  assert(parts.length <= 24 && parts.length <= 32, row.id + ': bounded descriptor count');
  assert.deepEqual(JSON.parse(JSON.stringify(isolated.parts(row))), parts, row.id + ': isolated evaluation');
  const identities = new Set(), vectors = new Set(), geometry = new Set();
  const size = [row.dimensionsMm.width, row.dimensionsMm.height, row.dimensionsMm.depth].map(v => v / 1000);
  const lo = [-size[0] / 2, 0, -size[2] / 2], hi = [size[0] / 2, size[1], size[2] / 2];
  for (const part of parts) {
    assert.equal(Object.getPrototypeOf(part), Object.prototype);
    assert(Object.keys(part).every(k => allowed.has(k)));
    assert.equal(part.previewCue, true);
    assert(roles.has(part.proxyRole));
    assert.equal(semanticRoles[part.sourcePartKey], part.proxyRole);
    assert.match(part.color, /^#[0-9a-f]{6}$/i);
    assert.equal(typeof part.sourcePartKey, 'string');
    assert(part.sourcePartKey && !identities.has(part.sourcePartKey));
    identities.add(part.sourcePartKey);
    assert(!row.proxy.parts.some(p => !p.wireframe && p.sourcePartKey === part.sourcePartKey));
    for (const [name, positive] of [['sizeM', true], ['centerM', false]]) {
      assert(Array.isArray(part[name]) && part[name].length === 3);
      assert(!vectors.has(part[name])); vectors.add(part[name]);
      assert(part[name].every(v => typeof v === 'number' && Number.isFinite(v) && (!positive || v > 0)));
    }
    for (let i = 0; i < 3; i++) {
      // No tolerance: visual AABBs must fit the authoritative static placement envelope.
      assert(part.centerM[i] - part.sizeM[i] / 2 >= lo[i], row.id + '/' + part.sourcePartKey + ': lower envelope');
      assert(part.centerM[i] + part.sizeM[i] / 2 <= hi[i], row.id + '/' + part.sourcePartKey + ': upper envelope');
    }
    const signature = JSON.stringify([part.sizeM, part.centerM]);
    assert(!geometry.has(signature), row.id + ': duplicate full bounds'); geometry.add(signature);
    if ('opacity' in part) {
      assert.equal(part.proxyRole, 'panel');
      assert(Number.isFinite(part.opacity) && part.opacity > 0 && part.opacity < 1);
      glazingCount++;
    }
    if ('shape' in part) {
      assert(['box', 'cylinder'].includes(part.shape));
      if (part.shape === 'cylinder') { assert.equal(part.proxyRole, 'spool'); assert(['x', 'y', 'z'].includes(part.axis)); }
    } else assert(!('axis' in part));
  }
  if (expected) {
    const metadata = currentMetadata(row);
    for (const hash of expected.metadataPins) assert(metadata.some(m =>
      m.sha256 === hash && /^https:\/\//.test(m.publicURL)), row.id + ': current public metadata pin');
    for (const [key, role] of Object.entries(expected.annotations || {})) assert.equal(semanticRoles[key], role);
    const freshRoles = printerSilhouetteSourceRoles(row);
    freshRoles[Object.keys(freshRoles)[0]] = 'changed';
    assert.deepEqual(printerSilhouetteSourceRoles(row), semanticRoles, row.id + ': fresh semantic role record');
    const original = structuredClone(parts);
    if (parts.length) {
      parts[0].sizeM[0] += 9; parts[0].centerM[0] = 99; parts[0].color = '#000000';
      parts[0].sourcePartKey = 'changed'; parts[0].opacity = 0.99; parts.pop();
      assert.deepEqual(printerSilhouetteParts(row), original, row.id + ': fresh descriptors and vectors');
      const nextRow = catalog.machines[(catalog.machines.indexOf(row) + 1) % catalog.machines.length];
      printerSilhouetteParts(nextRow);
      assert.deepEqual(printerSilhouetteParts(row), original, row.id + ': A-to-B-to-A');
      assert.deepEqual(printerSilhouetteParts(JSON.parse(JSON.stringify(row))), original, row.id + ': serialized catalog');
      const duplicate = structuredClone(row);
      duplicate.proxy.parts.push({...original[0]});
      assert.deepEqual(printerSilhouetteParts(duplicate), original.slice(1), row.id + ': existing source leaf not duplicated');
      const retained = structuredClone(row);
      retained.proxy.parts.push(...structuredClone(original));
      assert.deepEqual(printerSilhouetteParts(retained), [], row.id + ': all source leaves retained already');
      assert.deepEqual(printerSilhouetteSourceRoles(retained), semanticRoles, row.id + ': roles survive without extra geometry');
      const enriched = structuredClone(row); enriched.sourceEvidence.metadata = structuredClone(metadata);
      assert.deepEqual(printerSilhouetteParts(enriched), original);
      enriched.sourceEvidence.metadata = [];
      assert.deepEqual(printerSilhouetteParts(enriched), [], row.id + ': changed supplied metadata pins');
    }
    for (const alter of [
      r => { r.dimensionsMm.width += .001; }, r => { r.dimensionsMm.height -= .001; },
      r => { r.dimensionsMm.depth = NaN; }, r => { r.fullScene.translationM[0] += .000001; },
      r => { (r.fullScene.providerDefaultPose ??= {}).recipeSha256 = '0'.repeat(64); },
      r => { (r.fullScene.providerDefaultPose ??= {}).actualStateSha256 = '0'.repeat(64); },
      r => { delete r.fullScene; }, r => { r.proxy.appendGenericPrinterCues = false; }
    ]) {
      const changed = structuredClone(row); alter(changed);
      assert.deepEqual(printerSilhouetteParts(changed), [], row.id + ': reject stale/default/disabled profile');
      assert.deepEqual(printerSilhouetteSourceRoles(changed), {}, row.id + ': reject stale semantic roles');
    }
  }
  coverage.push({id: row.id, parts: expected?.count ?? 0, status: expected ? 'source-bounds' : 'explicit-fallback'});
  descriptorCount += expected?.count ?? 0;
}

// Public metadata witnesses keep identities, transformed placement, material and
// grazing-boundary regressions distinct from descriptor-schema/count assertions.
for (const witness of sourceWitnesses) {
  const row = byId.get(witness.id), part = printerSilhouetteParts(row).find(p => p.sourcePartKey === witness.key);
  assert(part, witness.id + ': source identity ' + witness.key);
  assert.equal(part.proxyRole, witness.proxyRole);
  assert.equal(part.color, witness.color);
  if (witness.opacity === undefined) assert(!Object.hasOwn(part, 'opacity'));
  else assert.equal(part.opacity, witness.opacity);
  if (witness.shape) { assert.equal(part.shape, witness.shape); assert.equal(part.axis, witness.axis); }
  const points = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) {
    const v = [witness.nativeBoundsMm[x][0], witness.nativeBoundsMm[y][1], witness.nativeBoundsMm[z][2]];
    points.push(witness.M.map((r, i) => (r.reduce((sum, n, k) => sum + n * v[k], 0) + witness.T[i]) / 1000 + row.fullScene.translationM[i]));
  }
  for (let i = 0; i < 3; i++) {
    const sourceLo = Math.min(...points.map(v => v[i])), sourceHi = Math.max(...points.map(v => v[i]));
    const actualLo = part.centerM[i] - part.sizeM[i] / 2, actualHi = part.centerM[i] + part.sizeM[i] / 2;
    assert(Math.abs(actualLo - sourceLo) <= .000010000001, witness.key + ': source lower witness / bounded visual intersection');
    assert(Math.abs(actualHi - sourceHi) <= .000010000001, witness.key + ': source upper witness / bounded visual intersection');
  }
}
const ender = byId.get('ender3_stock_220');
const enderHead = printerSilhouetteParts(ender).find(p => p.proxyRole === 'head');
assert(enderHead.centerM[1] < ender.dimensionsMm.height / 1000 * .5, 'Ender head uses source pose below generic 70%-height cue');
const portals = [
  ['elegoo_neptune3_reference', ['235', '231'], '233', '63', '24', '313'],
  ['elegoo_neptune3pro_reference', ['245', '277'], '241', '3', '104', '418'],
  ['elegoo_neptune3plus_reference', ['208', '221'], '239', '464', '508', '346']
];
for (const [id, uprightKeys, topKey, beamKey, headKey, bedKey] of portals) {
  const row = byId.get(id), semantic = printerSilhouetteSourceRoles(row), extras = printerSilhouetteParts(row);
  const combined = [...row.proxy.parts, ...extras], part = key => combined.find(p => p.sourcePartKey === key);
  assert.equal(semantic[headKey], 'head', id + ': exact source head suppresses floating generic head');
  assert.equal(semantic[bedKey], 'bed', id + ': actual source bed role');
  for (const key of uprightKeys) {
    assert.equal(semantic[key], 'base');
    assert(part(key)?.sizeM[1] > .4, id + ': source portal upright');
  }
  assert(part(topKey)?.centerM[1] > part(headKey).centerM[1] + .15, id + ': source top portal');
  assert(part(beamKey)?.sizeM[0] > .3, id + ': source X beam');
  assert(part(headKey).centerM[1] < row.dimensionsMm.height / 1000 * .5, id + ': source head datum');
  const changed = structuredClone(row); changed.sourceEvidence.sources[0].revision = 'changed-source';
  assert.deepEqual(printerSilhouetteParts(changed), [], id + ': same bounds with different source rejected');
  assert.deepEqual(printerSilhouetteSourceRoles(changed), {});
}
for (const row of catalog.machines.filter(r => r.id.endsWith('_idex') && r.family === 'vcore4')) {
  const heads = printerSilhouetteParts(row).filter(p => p.proxyRole === 'head');
  assert(heads.some(p => p.centerM[0] < 0) && heads.some(p => p.centerM[0] > 0), row.id + ': both registered IDEX heads');
}
for (const value of [undefined, null, {}, {id: '__proto__'}, {id: 'constructor'}, {id: 'toString'},
  {id: 'unregistered-printer'}, {id: 'snapmaker_u1_layout_reference', proxy: {appendGenericPrinterCues: false}}]) {
  assert.deepEqual(printerSilhouetteParts(value), []);
  assert.deepEqual(printerSilhouetteSourceRoles(value), {});
}
assert.equal(JSON.stringify(catalog), before, 'Never mutate caller catalog');
assert.equal(externalAttempts, 0, 'No runtime external access');
assert(glazingCount > 0 && descriptorCount > 0);
console.log(JSON.stringify({passed: true, machines: coverage.length, sourceProfiles: expectedProfiles.size,
  explicitFallbacks: fallbackIds.length, descriptors: descriptorCount, glazing: glazingCount,
  sourceWitnesses: sourceWitnesses.length, moduleBytes: Buffer.byteLength(source), coverage,
  scope: 'All registered catalog rows, finite bounded silhouettes, source metadata witnesses, fresh returns and inert runtime. Full-model/GPU/native-solid verification is separate.'}));
