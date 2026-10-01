# 公開メモ

表示名の候補：**3D Print Rig**。リポジトリ名の候補：`3d-print-rig`。正式名は未確定です。

## 準備済み

- 開発ワークスペースから分離した約3MBのビューアーソース候補。
- Three.js 0.180.0のコードとMIT原文、各モデルの参考元・使用版。
- モデル、STEP、大型ZIP、作業ログを初期公開対象から除外。
- コードと公開候補ファイルを検査するCI。デプロイは自動実行しません。
- 既存の表示データを自分の環境へ導入するローカル専用スクリプト。
- ソースのみでも出典と対応範囲を閲覧できるトップページ、モデル未導入時の案内。

## GitHubの公開リポジトリ

公開名が決まったらGitHubにリポジトリを作成し、このディレクトリの検査済み初期コミットを送ります。公開直前に `python scripts/check_repository.py` で対象を確認します。ローカルのcommitにはGitHubの公開ユーザー名とnoreplyメールを使います。

初期公開はソースと出典情報の公開です。これだけで第三者が全モデルを読み込める状態にはなりません。モデルを配布できる条件と対応する編集可能なソースを揃え、公開用アセット構成を作成してからライブビューアーを配信します。

## 配信先が通常のXserverレンタルサーバーの場合

公開用サイト一式を、対象ドメインの専用サブディレクトリまたはサブドメインへ配置します。アップロード対象は完成した `site` 相当の静的ファイルだけです。開発用Pythonサーバー、Gitの管理領域、CAD変換処理を配置する必要はありません。

GLB・JSON・JavaScriptモジュールのHTTP応答とMIME型を確認します。HTML・JSONの更新反映、モデルのキャッシュ、SSL、ファイルの圧縮とサイズの最適化を確認してから一般公開します。モデル読み込み時のメモリ使用量は閲覧端末側の性能にも依存します。

通常のXserverレンタルサーバーは公式FAQで転送量課金なしと案内されています。ただし過大な負荷では制限される場合があります。VPSや他のXServerサービスは個別に確認します。

- [Xserverの転送量FAQ](https://www.xserver.ne.jp/support/faq/service_server_transfer_amount.php)
- [Xserverの仕様一覧](https://www.xserver.ne.jp/manual/man_server_spec.php)
- [Xserverのファイル管理](https://www.xserver.ne.jp/manual/man_tool_file.php)

## GitHub Pagesの場合

相対パスを維持してリポジトリ配下でも動く静的サイトとして配信します。公開モデルを含む成果物ができてからPages用ワークフローを追加します。現在のソースCIはPagesへ何も送信しません。

- [GitHub Pagesでカスタムワークフローを使う](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

STEPは標準構成だけを別管理し、準備・検証・公開条件が揃った対象から有効にします。任意のMod構成をSTEPへ変換する公開APIは含みません。
