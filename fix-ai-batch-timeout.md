# 修正: AIニュースBot バッチ要約失敗 & GASタイムアウト

## 発生日時
2026/03/22

## 症状
- AIニュースBotのみDiscordへの投稿が0件だった
- スプレッドシートのログが「AI バッチ要約失敗、個別要約にフォールバック」で途切れていた
- 「実行完了」ログが残っていなかった

## 原因

### 原因1: バッチAPIレスポンスのJSON途中切れ（`ai.js`）
5つのBotが同時刻（7:00）に起動し、OpenRouterへのAPIリクエストが競合した結果、
`aiBatchSummary` のレスポンスJSONが途中で切れ `Unexpected end of JSON input` エラーが発生した。

### 原因2: 個別フォールバックがGAS 6分制限を超過（`ai.js` / `main.js`）
バッチ失敗後のフォールバックが10記事を直列で個別要約（1記事あたり最大30秒）したため、
合計実行時間がGASの6分制限を超過。プロセスが強制終了し、Discordへの投稿も行われなかった。

## 修正内容

### Fix A: `ai.js` — バッチAPIに `max_tokens` を追加
```js
payload: JSON.stringify({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 2048,  // 追加: 出力上限を明示してJSONの途中切れを防止
}),
```
モデルへの出力トークン上限を明示することで、レスポンスが規定サイズ内に収まるよう制御する。

### Fix B: `ai.js` — フォールバックに残り時間チェックを追加
フォールバックのループを `map` から `for...of` に変更し、各記事の処理前に `deadline`（開始から4分後）を確認する。
期限を超えた場合は残り記事を空の要約で埋めてループを中断し、後続のDiscord投稿処理が必ず実行されるようにした。

```js
for (const a of articles) {
  if (deadline && new Date() >= deadline) {
    logWarn("フォールバック中断：実行時間上限", `処理済み ${results.length}/${articles.length} 件`);
    // 残りを空要約で埋めてbreak
    break;
  }
  results.push(aiSummary(a));
  Utilities.sleep(500);
}
```

### Fix B: `main.js` — `deadline` を計算して渡す
```js
const deadline = new Date(startTime.getTime() + MAX_EXEC_MS - 60 * 1000);
const summaries = aiBatchSummary(targets, deadline);
```
`MAX_EXEC_MS`（5分）から60秒を引いた時点を期限とし、Discord投稿処理の実行時間を確保する。
