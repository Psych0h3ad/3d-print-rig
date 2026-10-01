# 3D Print Rig

**Working title / 仮称 — 3D printer assembly and configuration viewer.**

プリンターの構成、Mod、配色、内部の機構をブラウザーで確認する非公式コミュニティビューアーです。最初の対象はVORON / SIBOORで、今後ほかの機種を追加する想定です。

## 公開準備の状態

このリポジトリ候補にはビューアーのソース、Three.js、原作者と使用版の記録を含めています。CAD・GLB・STL・STEP・ローカルの大型パッケージは含みません。**モデルを含む公開サイトはまだ完成していません。**

ローカル開発版ではTridentの18構成を確認済みです。AWD 9mm / R2 XY 6mm、Stealthburner / Xol、対応ホットエンド・押出機、配色、Disco照明、可動プレビュー、PNG出力を扱います。V2.4はプリントR2の350mm基準モデルです。SIBOOR AUG CNCキットは未導入です。

動作は機構と経路の可視化です。実機の全域衝突、ケーブル張力、熱、押出、電気動作を検証するシミュレーターではありません。PNG出力はブラウザー描画です。

## ローカルで起動する

Python 3.10以降を使用します。公開配布条件を満たすモデルデータを自分で用意し、既存の開発出力から表示用ファイルを取り込みます。このスクリプトはローカル用で、外部へのアップロードは行いません。

```sh
python scripts/import_local_assets.py /path/to/existing/output
python -m http.server 8874 --bind 127.0.0.1 --directory site
```

ブラウザーで `http://127.0.0.1:8874/` を開くと、対応範囲と出典を確認できます。`/viewer/` が構成ビューアーです。データ未導入時は導入案内を表示します。取り込んだモデルと配置情報はGitの管理対象から除外されます。

## 出典とライセンス

新規ビューアーコードのライセンス案はMITです。Third-partyコードとモデルには、それぞれの原作者の条件が適用されます。MITでCADを一括再許諾するものではありません。

- [原作者・取得版・変更範囲](docs/THIRD_PARTY_NOTICES.md)
- [表示用の出典カタログ](site/PUBLIC_CATALOG.json)
- [モデル公開の未解決事項](docs/MODEL_PUBLICATION_STATUS.json)
- [公開候補ファイルのSHA256](docs/SOURCE_INVENTORY.json)

SIBOOR本体、Phaetus、Sherpa内蔵版などの公開条件は未解決です。GPLのモデルを追加配布する場合も、ライセンス原文、変更履歴、対応する編集可能なソースを別途揃える必要があります。出典の記載だけで配布条件の確認に代えることはしません。

## 公開先

ソースの公開先とビューアーの配信先は別々に選べます。GitHubでソースを公開し、通常のXserverレンタルサーバーで静的サイトを配信する構成も可能です。配信サーバー上でPythonやNode.jsを常駐させる必要はありません。

現時点ではリモートリポジトリを作成せず、Pages / Xserverへのアップロードも行っていません。公開名と配信先を決めた後の手順は[公開メモ](docs/PUBLISHING.md)を参照してください。
