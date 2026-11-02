# Mast

YouTube の視聴を、あらかじめ決めた「予約枠」の中だけに制限する Chrome 拡張機能。
仕様は [docs/spec.md](docs/spec.md) を参照。

## セットアップ

Node.js 24 以上が必要（バージョンは [.nvmrc](.nvmrc) で固定）。

```bash
npm install
npx playwright install chromium
npm run check
```

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発モード。Chrome が起動し、保存するたびに拡張機能が再読み込みされる |
| `npm run build` | `.output/chrome-mv3/` にビルドする |
| `npm run zip` | ビルドして Chrome Web Store 提出用の zip を作る |
| `npm test` | ユニットテスト（Vitest） |
| `npm run test:watch` | ユニットテストを監視モードで実行 |
| `npm run e2e` | ビルドしてから E2E テスト（Playwright） |
| `npm run typecheck` | 型チェック |
| `npm run lint` | lint とフォーマットのチェック（Biome） |
| `npm run lint:fix` | lint とフォーマットを自動修正 |
| `npm run check` | 型チェック・lint・ユニットテストをまとめて実行 |

## ビルドしたものを Chrome で試す

1. `npm run build`
2. `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」で `.output/chrome-mv3` を選ぶ

## ディレクトリ構成

```
src/
  core/         予約枠の判定・TOTP・日付計算などの純粋なロジック
  storage/      chrome.storage の読み書き
  entrypoints/  拡張機能の入口（Service Worker、コンテンツスクリプト、設定画面など）。画面は React で描く
e2e/            E2E テスト（Playwright）
docs/           仕様書
```

## テストの方針

- **ユニットテスト**はテスト対象のファイルの隣に `*.test.ts` として置く
- `src/core/` は `chrome.*` も `Date.now()` も直接呼ばず、現在時刻は引数で受け取る。日付や曜日の境界をテストで自由に再現できるようにするため
- `chrome.*` を使うコードは、WXT の `fakeBrowser`（メモリ上の偽物）でテストする
- ユニットテストのタイムゾーンは `Asia/Tokyo` に固定している（[vitest.config.ts](vitest.config.ts)）
- **E2E テスト**は本物の YouTube に接続しない。外部への通信を遮断し、偽の YouTube ページを返す（[e2e/fixtures.ts](e2e/fixtures.ts)）

## CI

PR と main への push で GitHub Actions が動く（[.github/workflows/ci.yml](.github/workflows/ci.yml)）。
型チェック・lint・ユニットテスト・ビルド・E2E テストを実行し、拡張機能の zip を成果物として保存する。
