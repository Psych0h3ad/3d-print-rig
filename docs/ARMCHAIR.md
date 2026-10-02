# Armchair Heavy Industries

[Head Builder](https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html)でArchetype系のヘッドを選び、押出機・ホットエンド・冷却部の長さ・MGN9/MGN12・Beaconの原本マウントを比較できます。印刷部品のベース色とアクセント色にも対応します。

| 原本 | 表示内容 |
| --- | --- |
| Archetype Public CAD v22 | BlackBird、Breakneck、Mjolnir、Zephyrダクト、Atrocity。対応する長さの部品だけを選択 |
| A4T | Xolキャリッジ用Dragon/RapidoカウリングとRapido冷却ダクト。WW-BMGアダプターと本体は部品単体で表示 |
| Escapement | Galileo 2用の印刷ハウジング4部品 |
| Sharketype | BMG用の印刷ハウジング・補助部品7点 |
| Trailhead XY Joints | 1515/2020、6/9 mm、Platedの原本印刷部品 |
| ADXL Mounts | Rapido用ADXL/KUSBAクランプとノズルねじマウント |

[部品単体ページ](https://psych0h3ad.github.io/3d-print-rig/viewer/components.html?component=ahi_reference_escapement)では、STLの印刷姿勢にある部品を一つずつ選択できます。STL部品から組立STEPを作ったものではありません。

Archetypeは公開CADのv22です。原作者の現行STLやWebコンフィグレーターと同一の版とは扱いません。LongのBlackBirdはCAD内のForbiddenを使用します。Sherpa系の二重になった前カバー、作図用カッター、未選択のLED部品、外部CPAPホース例を除外し、残る部品の寸法と原本座標を保持しています。

取付チェックには静止姿勢の本体交差と判定未確定の箇所を表示します。ベッド面との下端比較には表示用メッシュを使用し、曲面の大きなCAD外接枠から接触を判定しません。Beacon Rev Dのコイル基準面・設置高さ・金属除外領域と、プリンターへの登録・連続可動域は未確認です。Zephyrの部品冷却ファンと外部CPAP送風機は含みません。

本体の交差候補とメッシュで判定できなかったペアは、原本CADソリッドでも再検査します。表示近似による偽の交差は除外し、原本で残る交差と未確定の判定を表示します。

A4Tは印刷部品の比較です。押出機・ホットエンド・ファン・ねじなどのハードウェアは未装着です。原作者は標準Cartographer CNCマウントを非対応と案内し、Voron純正フロントアイドラーとの干渉条件も記載しています。EscapementとSharketypeもハードウェアを含む組立ではありません。SharketypeはBreakneck非対応です。

「サポート省略モデル」は、原本の印刷用サポートを取り除いた表示です。A4Tカウリングの独立サポート6個に加え、Archetype v22のMGN9左右固定部品、Goliath/Rapido/Dragon UHF/VolcMosq/TeaKettleマウント、BlackBird Medium右後部、Mjolnir Medium/Long左右の別ソリッドになったサポートを省略しています。本体の寸法・穴・原本座標は保持します。表示用モデルを原本の印刷用STLと同一とは扱いません。部品名がSupportではないソリッドも、接触形状と本体からの隙間を個別に確認しています。

Escapement Coreも、歯状接点を持つ独立サポートを省略しています。残る本体の原本三角形は変更しません。STLの分離した面には穴の内壁も含まれるため、単に分離した面や小さいソリッドという理由では除外していません。

取得元・commit・個別ライセンスは[Third-party notices](THIRD_PARTY_NOTICES.md#armchair-heavy-industries-native-references)とビューアーの「出典・ライセンス」にあります。Archetype/A4T/Sharketypeには非商用条件を含むCC BY-NC-SA 4.0、Escapement/Trailhead/ADXLにはGPL 3.0が適用されます。組み込まれたメーカー部品の利用条件も維持します。
