---
# GitHub Pages では https://furiel05.github.io/Mast/privacy/ で公開する（docs/_config.yml）
title: Mast プライバシーポリシー
permalink: /privacy/
---

# Mast プライバシーポリシー

最終更新：2026年11月3日

Mast（以下「本拡張機能」）は、YouTube を見てよい時間を利用者自身が決めた「予約枠」の中だけに制限する Chrome 拡張機能です。本拡張機能が扱うデータと、その扱い方を説明します。

## 開発者に送られるデータはありません

本拡張機能は、開発者のサーバーや第三者のサービスに、どのようなデータも送りません。アクセス解析・広告・外部のプログラムの読み込みも行いません。

## 本拡張機能が保存するデータ

すべて Chrome の拡張機能用の保存領域（`chrome.storage`）に保存します。

| データ | 保存先 | 用途 |
| --- | --- | --- |
| 予約枠の設定、予約中の変更 | `chrome.storage.sync` | 今 YouTube を見てよいかの判定 |
| 承認コードの秘密鍵 | `chrome.storage.sync` | 予約枠を広げる変更のときに、認証アプリのコードを確かめる |
| 日ごとの視聴時間（端末ごと、直近8日分） | `chrome.storage.sync` | 1日の視聴時間の上限（予算）の判定 |
| 端末ID（ランダムに作った値） | `chrome.storage.local` | 視聴時間を端末ごとに分けて記録する |
| 今再生中のタブ | `chrome.storage.session` | 視聴時間を数える。Chrome を終了すると消えます |

`chrome.storage.sync` のデータは、Chrome の同期機能によって、同じ Google アカウントでログインしている利用者自身のほかのパソコンの Chrome に同期されます。この同期は Google が提供する Chrome の機能で、[Google のプライバシーポリシー](https://policies.google.com/privacy)に従って扱われます。

## YouTube のページで読み取るもの

YouTube のページ（他サイトに埋め込まれたものを含む）では、動画が再生中かどうかだけを読み取ります。動画のタイトル、URL、閲覧履歴、コメント、アカウントの情報は読み取らず、記録もしません。

見られない時間に YouTube を開くと、ブロック画面に切り替わります。このとき、見られる時間になったら元のページに戻れるよう、元のページの URL をブロック画面に渡します。この URL は保存しません。

## データの削除

- 本拡張機能を削除すると、そのパソコンに保存されたデータは削除されます
- 同期されたデータは、Chrome の設定の「同期と Google サービス」から同期データを削除すると消えます

## お問い合わせ

GitHub の Issues（<https://github.com/furiel05/Mast/issues>）からご連絡ください。

---

## Privacy Policy (English summary)

Mast does not send any data to the developer or to any third party, and it uses no analytics, ads or remotely hosted code. Settings, the authenticator secret and daily watch time are stored in `chrome.storage.sync` and are synced only through Chrome Sync to the user's own devices signed in to the same Google account. On YouTube pages, Mast only checks whether a video is playing; it does not read or record video titles, URLs or browsing history. Uninstalling the extension removes its data from the device. Contact: <https://github.com/furiel05/Mast/issues>
