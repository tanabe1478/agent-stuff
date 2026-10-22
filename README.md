# Agent Stuff

自分用の Pi Coding Agent パッケージ。
[mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) を参考に、ディレクトリ構成だけを用意しています。

## 構成

```text
.
├── package.json   # Pi パッケージの定義
├── extensions/    # TypeScript 拡張
├── skills/        # スキルと補助ファイル
├── commands/      # プロンプトテンプレート
└── themes/        # テーマ
```

各ディレクトリは現在空です。Git で保持するための `.gitkeep` のみ配置しています。
スキル・拡張・プロンプト・テーマの実装や依存パッケージはまだ追加していません。

読み込み先は `package.json` の `pi` フィールドで定義しています。
`private: true` は npm への誤公開を防ぐための設定です。
