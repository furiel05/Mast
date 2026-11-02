# CLAUDE.md

YouTube の視聴を予約枠の中だけに制限する Chrome 拡張機能（Manifest V3）。
仕様は `docs/spec.md` が正。仕様と食い違う実装をするときは、先に仕様を更新する。

## 技術構成

- WXT（Vite ベース）+ TypeScript。`srcDir` は `src`
- WXT の自動インポートは無効（`imports: false`）。`defineBackground` などは `wxt/utils/...` から、`browser` は `wxt/browser` から明示的に import する
- lint・フォーマットは Biome（シングルクォート、スペース2つ、100桁）
- ユニットテストは Vitest + `wxt/testing/fake-browser`、E2E は Playwright

## コマンド

- `npm run check` 型チェック・lint・ユニットテスト（変更後は必ず通す）
- `npm run e2e` ビルドして E2E テスト
- `npm run lint:fix` フォーマットの自動修正

## 守ること

- `src/core/` には `chrome.*`・`browser.*`・`Date.now()`・`new Date()`（引数なし）を書かない。現在時刻は引数で受け取る
- 1日の区切りは朝4時（曜日の判定・予算のリセットの基準）。0時ではない
- 時刻・曜日・日付の境界（4時の区切り、0時、週の切り替わり、月末、夏時間）はユニットテストで押さえる
- E2E テストは本物の YouTube に接続しない。偽のページは `e2e/fixtures.ts` の `FAKE_PAGES` に追加する
- 端末ごとに違う値（端末IDなど）は `storage.local`、端末間で共有する値は `storage.sync` に保存する
- `storage.sync` の上限（512件、1件8KB、書き込みは1分120回・1時間1,800回）を超えない設計にする
- manifest の `permissions` は、使う機能を実装するときに必要な分だけ追加する
