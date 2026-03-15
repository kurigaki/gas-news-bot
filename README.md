# gas-news-bot

Google Apps Script で動作する Discord 向け技術ニュース要約 Bot。
RSS フィードから記事を収集し、AI で要約して毎朝 Discord のフォーラムチャンネルに投稿します。

---

## 機能

- RSS / Atom フィードから記事を収集（XML パース失敗時は regex フォールバック）
- キーワードフィルタ・ブロックキーワードによる記事の絞り込み
- コンテンツ不足記事（100文字未満）の自動スキップ
- AI（OpenRouter / gpt-4o-mini）によるバッチ要約（要点・要約・コメント）
- トレンドスコアによるランキング
- Discord フォーラムチャンネルへのスレッド投稿（embed 形式）
  - 高関連度記事（キーワード 2 件以上）は 🔥 アイコンで強調
  - 推定読了時間・公開日を表示
- API 失敗時の指数バックオフ付きリトライ（最大 3 回）
- Discord レート制限（429）に対する `retry_after` 対応
- エラー発生時の Discord アラート通知（`ALERT_WEBHOOK` 設定時）
- Google スプレッドシートによるログ・記事アーカイブ・ダッシュボード記録
- 毎週月曜に `posted` / `logs` シートの 30 日以上前のデータを自動削除

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `config.js` | 認証情報・設定定数（gitignore 対象） |
| `main.js` | メイン処理・トリガー設定 |
| `rss.js` | RSS / Atom フィード収集・パース |
| `filter.js` | キーワードフィルタ・コンテンツ不足スキップ |
| `ranking.js` | トレンドスコアによるランキング |
| `ai.js` | OpenRouter API による AI バッチ要約 |
| `discord.js` | Discord Webhook 投稿 |
| `db.js` | スプレッドシート読み書き・設定管理・クリーンアップ |
| `logs.js` | ログ記録・Discord エラー通知 |
| `utils.js` | 共通ユーティリティ（リトライ付き fetch） |

---

## セットアップ

### 1. 必要なもの

- Google アカウント（Google Apps Script）
- Discord サーバー（フォーラムチャンネル + Webhook URL）
- OpenRouter API キー

### 2. config.js の設定

```js
const CONFIG = {
  WEBHOOK:       "https://discord.com/api/webhooks/...",  // フォーラムチャンネルの Webhook URL
  ALERT_WEBHOOK: "https://discord.com/api/webhooks/...",  // エラー通知用 Webhook URL（任意）
  OPENROUTER:    "sk-or-v1-...",                          // OpenRouter API キー
  MAX_ARTICLES:  10,
  RSS_FEEDS:      [],   // config シートで管理（setupConfigSheet() 実行後は不要）
  KEYWORDS:       [],
  KEYWORDS_BLOCK: [],
};
```

### 3. 初回セットアップ（GAS エディタで順に実行）

| 関数 | 実行タイミング | 説明 |
|---|---|---|
| `setupConfigSheet()` | 初回のみ | config シートを現在の CONFIG 値で初期化 |
| `setupDailyTrigger()` | 初回のみ | 毎日 08:00 (Asia/Tokyo) の自動実行トリガーを登録 |
| `setupCleanupTrigger()` | 初回のみ | 毎週月曜 03:00 のクリーンアップトリガーを登録 |

### 4. RSS フィード・キーワードの管理

`setupConfigSheet()` 実行後はスプレッドシートの **config シート** で管理します。
詳細は [`spreadsheet-schema.md`](./spreadsheet-schema.md) を参照。

---

## スプレッドシート構成

詳細は [`spreadsheet-schema.md`](./spreadsheet-schema.md) を参照。

| シート | 用途 |
|---|---|
| articles | 投稿済み記事アーカイブ |
| posted | 重複チェック用 URL 一覧（30日で自動削除） |
| logs | 実行ログ（30日で自動削除） |
| dashboard | 日次サマリー |
| config | RSS フィード・キーワード設定 |
