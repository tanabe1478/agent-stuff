# Agent Stuff

自分用の Pi Coding Agent パッケージ。
[mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) から、使いたい機能だけを取り込んでいます。

## 導入済みの機能

| コマンド | 内容 |
| --- | --- |
| `/discuss` | コードを確認してから短い質問を重ね、実装前の計画を整理するプロンプト。実装は行いません。 |
| `/btw`、`/btw 質問` | 本筋とは別のサイドチャット。既存スレッドの再開・リセットや、要約を本筋へ戻す操作に対応します。 |
| `/todos` | Todoの検索・閲覧・担当割り当て・状態変更を行う端末UI。AI向けの `todo` ツールも追加します。 |

スキルとテーマはまだ追加していません。標準の `edit` や `bash` を置き換える拡張も含みません。

## インストール

Piがインストールされた環境で、ローカルのこのリポジトリを登録します。

```sh
pi install /path/to/agent-stuff
```

GitHubから取得する場合は、次のコマンドでも導入できます。

```sh
pi install git:github.com/tanabe1478/agent-stuff
```

どちらか一方を使ってください。開いているPiでは `/reload`、または再起動して反映します。
ローカルパスで登録すると、このリポジトリへの変更を直接読み込めます。
Piが提供するモジュールは `peerDependencies` として宣言しており、実行時はPiから読み込まれます。

## 使用例

```text
/discuss
/btw この設計のトレードオフを教えて
/todos
```

`/btw` は現在のモデルと会話の文脈を使います。サイドチャットにはファイルの読み取り・編集・書き込み・シェル実行のツールもあるため、読み取り専用ではありません。応答や要約には通常のモデル利用が発生します。

`/todos` のカスタム画面はPiの端末UI向けです。非対話・RPCモードではテキストの一覧を返します。

## Todoの保存先

- 既定：Piを実行しているプロジェクトの `.pi/todos/`
- 変更：環境変数 `PI_TODO_PATH`（相対パスはそのプロジェクトを基準に解決）
- 形式：タスクごとのMarkdownファイル（JSONメタデータ＋本文）
- 元実装の既定動作として、起動時に**作成日時が7日より古い完了済みタスクを自動削除**します。

自動削除を無効にする場合は、Todo保存先の `settings.json` を次のように設定します。

```json
{
  "gc": false
}
```

このリポジトリ自身の `.pi/todos/` は、個人のタスクを誤って公開しないようGitの対象外にしています。

## 構成

```text
.
├── package.json
├── commands/
│   └── discuss.md
├── extensions/
│   ├── btw.ts
│   └── todos.ts
├── skills/                 # 未追加
├── themes/                 # 未追加
├── LICENSES/
│   └── agent-stuff-Apache-2.0.txt
└── THIRD_PARTY_NOTICES.md
```

読み込み先は `package.json` の `pi` フィールドで定義しています。
`private: true` はnpmへの誤公開を防ぐための設定で、GitHubの公開設定とは別です。

## 動作確認

Pi SDKを解決できる環境で `npm test` を実行できます。
Pi本体とは別のディレクトリから検証する場合は、`PI_SDK_MODULE` にインストール済みSDKのモジュールURLを指定します。

```sh
PI_SDK_MODULE=file:///path/to/pi-coding-agent/dist/index.js npm test
```

テストは一時ディレクトリとモック応答を使い、パッケージの読み込み、Todoの操作と自動削除設定、サイドチャットの文脈復元、画面の幅と終了処理を確認します。実際のモデルAPIは呼び出しません。

## 元コードとライセンス

取り込み元のコミットと変更内容は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
取り込んだコード・プロンプトにはApache License 2.0が適用されます。
