# スプレッドシート スキーマ定義

## シート一覧

| シート名 | 用途 |
|---|---|
| articles | 投稿済み記事の詳細記録 |
| posted | 重複チェック用の投稿済み URL 一覧 |
| logs | 実行ログ（INFO / WARN / ERROR） |
| dashboard | 日次実行サマリー |
| config | RSS フィード・キーワードなどの動的設定 |

---

## articles シート

| # | カラム名 | 型 | 説明 |
|---|---|---|---|
| 1 | id | String | UUID（`Utilities.getUuid()`） |
| 2 | created_at | DateTime | 保存日時 |
| 3 | title | String | 記事タイトル |
| 4 | url | String | 記事 URL |
| 5 | source | String | 取得元 RSS フィード URL |
| 6 | summary | String | AI 要約（100 文字程度） |
| 7 | summary_points | String | AI 要点（改行区切りテキスト） |
| 8 | comment | String | AI コメント（エンジニア視点の一言） |
| 9 | keywords | String | ヒットしたキーワード（カンマ区切り） |
| 10 | score | Integer | ランキングスコア（0〜100） |
| 11 | is_high_relevance | Boolean | 高関連度フラグ（キーワード 2 件以上ヒット） |

---

## posted シート

重複投稿防止のために投稿済み URL を記録するシート。`removeDuplicates()` で参照される。
30 日以上前の行は `cleanupOldData()` によって自動削除される。

| # | カラム名 | 型 | 説明 |
|---|---|---|---|
| 1 | url | String | 投稿済み記事 URL（重複チェックのキー） |
| 2 | title | String | 記事タイトル |
| 3 | posted_at | DateTime | 投稿日時 |

---

## logs シート

`logError()` / `logInfo()` / `logWarn()` によるログ記録シート。
30 日以上前の行は `cleanupOldData()` によって自動削除される。

| # | カラム名 | 型 | 説明 |
|---|---|---|---|
| 1 | time | DateTime | 記録日時 |
| 2 | level | String | ログレベル（`INFO` / `WARN` / `ERROR`） |
| 3 | message | String | ログ概要 |
| 4 | detail | String | 詳細情報（エラーの場合はスタックトレース等） |

### ログレベルの使い分け

| レベル | 用途例 |
|---|---|
| INFO | 正常系の記録（実行開始・終了、投稿件数、フィード取得件数など） |
| WARN | 処理は継続できるが注意が必要な事象（RSS フィード取得失敗、AI 要約スキップ、コンテンツ不足スキップ、API リトライなど） |
| ERROR | 処理が中断・失敗した事象（Discord 投稿失敗、スレッド作成失敗など）。`ALERT_WEBHOOK` が設定されている場合は Discord にも通知 |

---

## dashboard シート

1日1行で実行結果のサマリーを記録するシート。

| # | カラム名 | 型 | 説明 |
|---|---|---|---|
| 1 | date | String | 実行日（`yyyy/MM/dd`） |
| 2 | articles_collected | Integer | RSS から収集した総記事数 |
| 3 | articles_posted | Integer | Discord に投稿した記事数 |
| 4 | high_relevance | Integer | 高関連度記事数（キーワード 2 件以上） |
| 5 | regular | Integer | 通常記事数 |
| 6 | errors | Integer | エラー発生件数 |

---

## config シート

RSS フィード・キーワードなどをコードを触らずに管理するシート。
`setupConfigSheet()` で初期化し、`loadSheetConfig()` が起動時に読み込む。

| # | カラム名 | 型 | 説明 |
|---|---|---|---|
| 1 | key | String | 設定キー（下表参照） |
| 2 | value | String | 設定値 |
| 3 | description | String | 説明（任意） |

### 設定キー一覧

| key | 値の形式 | 説明 |
|---|---|---|
| `RSS_FEED` | URL | 収集対象フィード（1行1フィード、複数行可） |
| `KEYWORD` | 文字列 | フィルタキーワード（1行1件、複数行可） |
| `KEYWORD_BLOCK` | 文字列 | ブロックキーワード（1行1件、複数行可） |
| `MAX_ARTICLES` | 整数 | 1回あたりの最大投稿件数 |
