# Agent Stuff

自分用の Pi Coding Agent パッケージ。
[mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) から、使いたい機能だけを取り込んでいます。

## 導入済みの機能

| コマンド | 内容 |
| --- | --- |
| `/discuss` | コードを確認してから短い質問を重ね、実装前の計画を整理するプロンプト。実装は行いません。 |
| `/btw`、`/btw 質問` | 本筋とは別のサイドチャット。既存スレッドの再開・リセットや、要約を本筋へ戻す操作に対応します。 |
| `/todos` | Todoの検索・閲覧・担当割り当て・状態変更を行う端末UI。AI向けの `todo` ツールも追加します。 |
| `/answer`、`Ctrl+.` | 直近のAI応答から質問を抽出し、対話式フォームで回答します。 |
| `/goal` | 長期目標の設定・表示・編集・一時停止・再開。AI向けの `get_goal`・`create_goal`・`update_goal` も追加します。 |
| `/review`、`/end-review` | 変更・ブランチ・コミット・PR・フォルダのレビュー。レビュー分岐からの復帰と、任意の自動修正ループに対応します。 |
| `/files`、`Ctrl+Shift+O` | Git状態と会話中の参照を使ったファイル一覧。開く・編集・差分表示・プロンプトへの参照追加などを行えます。 |

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
/answer
/goal テストが通るまで不具合を修正する
/goal pause
/goal resume
/goal clear
/review uncommitted
/review branch main
/review folder src docs
/end-review
/files
```

`/btw` は現在のモデルと会話の文脈を使います。サイドチャットにはファイルの読み取り・編集・書き込み・シェル実行のツールもあるため、読み取り専用ではありません。応答や要約には通常のモデル利用が発生します。

`/todos` のカスタム画面はPiの端末UI向けです。非対話・RPCモードではテキストの一覧を返します。

### answer

質問の抽出にもモデル利用が発生します。元実装に従い、認証済みの対応するCodexモデル、Haiku、現在のモデルの順に候補を選びます。`Tab` / `Shift+Tab` で質問を移動し、最後の質問で `Enter` を押すと送信確認になります。`Esc` で中止できます。送信するとAIの次のターンが始まります。

### goal

**目標を明示的に設定するまでは自動作業を開始しません。** 設定後は完了・停止条件に達するまで自動継続します。状態はセッションログに保存されます。

- `/goal`：現在の状態
- `/goal edit`：目標の編集
- `/goal pause`：以後の自動継続を一時停止（進行中の処理自体を即座に中断する操作ではありません）
- `/goal resume`：再開
- `/goal clear`：目標を削除

トークン予算は、明示的な依頼に基づいてAIが `create_goal` の `token_budget` へ設定できます。既定では予算なしです。予算はターン終了時の計測による自動継続の停止条件であり、API課金の厳密な上限ではありません。完了条件と変更可能な範囲を具体的にしてください。

### review

`/review` で対象を選ぶか、使用例のように対象を指定します。`--extra "確認事項"` で追加指示、`REVIEW_GUIDELINES.md` でプロジェクト固有の基準を渡せます。

- **Loop Fixingは既定でオフ**です。選択画面で有効にすると、レビューと修正を最大10回繰り返します。
- 既存の会話では `Empty branch` と `Current session` を選べます。`/end-review` で復帰できるのはレビュー分岐を作った場合です。
- `/end-review` では復帰のみ・復帰して修正・復帰して要約を選べます。
- `/review pr 123` は認証済みのGitHub CLI `gh` が必要で、**実際にPRをローカルへチェックアウト**します。会話の復帰はGitブランチの復帰とは別です。
- 通常のレビュー指示は実装をしないよう求めますが、ツール権限を制限する読み取り専用サンドボックスではありません。

### files

差分表示にはVS Codeの `code --diff`、編集には環境変数 `VISUAL` または `EDITOR` を使います。ファイルの編集は実ファイルへ保存されます。Linuxで開く・場所表示を使うには `xdg-open` とデスクトップ環境が必要です。Quick Lookと `Ctrl+Shift+R` はmacOS専用です。`/diff` という別名コマンドは追加していません。

`/answer`・`/review`・`/end-review`・`/files` はPiの端末UI専用です。RPC・非対話モードでは未対応の旨を通知し、カスタム画面は開きません。`/goal` の基本操作・AI向けツールは非対話モードでも使えます。

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
│   ├── answer.ts
│   ├── btw.ts
│   ├── files.ts
│   ├── goal.ts
│   ├── review.ts
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

Pi 1.2.0で確認しています。テストは一時ディレクトリとモック応答を使い、次を確認します。

- 全6拡張と `/discuss` の読み込み
- Todoの操作と自動削除設定、サイドチャットの文脈復元・画面の幅・終了処理
- answerの質問抽出・回答送信・キャンセル・狭い画面での描画
- goalの状態復元・一時停止・再開・予算計測・中断／エラー時の停止
- reviewのプロンプト生成・分岐／復帰・自動修正ループ（ナビゲーションと応答はモック）
- filesのGitリネーム表示・参照追加・外部エディタによる改行保持
- RPCで端末専用画面を開かないこと

実際のモデルAPI、GitHub PRチェックアウト、GUIアプリは呼び出しません。実端末での操作・モデルを使うレビュー／要約は別途確認が必要です。

## 元コードとライセンス

取り込み元のコミットと変更内容は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
取り込んだコード・プロンプトにはApache License 2.0が適用されます。
