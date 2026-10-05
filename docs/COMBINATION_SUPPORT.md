# Combination support / 組み合わせ対応状況

[現在の対応表 / Live support index](https://psych0h3ad.github.io/3d-print-rig/support/?lang=ja)

公開ビュワーのカタログと同じ登録情報・合成関数から、公開のたびに対応表を生成します。
機種、サイズ、ガントリー、ヘッド、押出機、ホットエンド、取付方式、キャリッジ、
プローブ、基板、冷却を絞り込めます。各構成から、その正確な構成のビュワーを開けます。
V0はURLによるMod復元に未対応のため、機体を開いて表示されたModを選択します。

## Status definitions

| 表示 | 意味 |
| --- | --- |
| 組み合わせ対応済み | 機体側の組み合わせ登録あり。条件に一致する登録構成を一覧表示。 |
| 標準構成のみ | 元CADの機体は表示可能。共通ヘッド／ガントリーとの交換は未対応。 |
| CAD未登録 | 選択肢の仕様はあるが、その仕様の組立CADが未登録。 |
| 単体での組み合わせ | ツールヘッドまたはMonolith単体で選べる構成。機体への組込とは別。 |
| この機体への組込は未対応 | 単体ヘッドCADがあっても、選んだ機体への装着登録がない。 |
| 条件の組み合わせは未登録 | 全条件の積集合が空。別部品へ自動置換せず、そのまま未登録と表示。 |

「未登録」「未対応」はビュワーの実装状況であり、実機での非互換を意味しません。
「対応済み」も実機互換性、全移動経路、配線、ファームウェア、自動交換を保証しません。
原本の取付条件・確認範囲を各構成に併記します。

## Included coverage

- 機体選択にある全仕様（未登録仕様を含む）。Trident、V2.4はサイズ・ベンダー別。
- 共通ヘッドカタログと機体側取付登録の合成。原本内蔵基板の表示有無も反映。
- Monolithはサイズ・構造・ベルト幅・駆動方式と、その専用ヘッドの組み合わせ。
- V0.2 / V0.2r1は7種類のMod選択を実際の取付条件で検証。依存条件を満たさない組み合わせを除外。
- V0 Modライブラリの各項目に対し、装着登録された種類・必要条件と単体表示のみの状態を記載。
- 追加Modとドック対応は別欄。Monolith用ドック、TridentのStealthChangerドック、MadMax機体側ドックなどを、ヘッド装着対応と混同しない。
- Micron、Rat Rig、Annex、Crossant、Remorph、Positron、community機体等は、現行コントローラーが提供する元CADの構成を記載。標準構成表示を部品交換対応とは数えない。

構成数には独立した追加Mod、ドック内のヘッド配列、色、姿勢を含めません。
V0の件数は取付ルールを満たすModの選択状態です。ほかの機体の件数とは別の粒度です。

## Data and maintenance

- `scripts/build_support_catalog.mjs` runs after verified model extraction in `build_site.py`.
- It calls the production `expandedPrinterCatalog`, `v24HeadCatalog`, `withMonolithMachines`,
  `monolithHeadCatalog`, embedded-board expansion and `validateV0Mods` functions.
- `support/data/index.json` records every machine status, asset bundle SHA-256 and source JSON hashes.
- `support/data/<target>.json` contains every registered row, option labels, source notes and extra support.
- A row stores `[configuration ID token indices, dimension option indices…, notes index]`.
  Join its `idParts` tokens with `__` to reconstruct the exact configuration ID.
- Data are generated into the build, not copied from a manually maintained count. Missing files fail the build.
- Run `node --experimental-loader ./scripts/three-test-loader.mjs scripts/test_support_catalog.mjs <assembled-site> <support-data>`
  to compare every generated row against current production composition logic.
- Default regressions verify strict intersections, V0 dependency exclusions and exact configuration links.

Native-solid, motion and browser evidence remain separate: see [MACHINE_REVIEW.md](MACHINE_REVIEW.md).
