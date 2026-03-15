// アクティブな Bot ID（getSheet のシート名プレフィックスと loadBotConfig で参照）
let CURRENT_BOT_ID = "AI_NEWS";

function saveArticle(article) {
  const sheet = getSheet("articles");
  const keywords = article.keywords ? article.keywords.join(",") : "";
  const summaryPoints = Array.isArray(article.summary_points)
    ? article.summary_points.join("\n")
    : (article.summary_points || "");

  sheet.appendRow([
    Utilities.getUuid(),
    new Date(),
    article.title,
    article.url,
    article.source || "",
    article.summary || "",
    summaryPoints,
    article.comment || "",
    keywords,
    article.score || 0,
    article.isHighRelevance ? true : false,
  ]);
}

function removeDuplicates(list) {
  const sheet = getSheet("posted");
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return list;
  const urls = sheet.getRange(1, 1, lastRow, 1).getValues().flat();
  return list.filter(a => !urls.includes(a.url));
}

function markAsPosted(article) {
  const sheet = getSheet("posted");
  sheet.appendRow([article.url, article.title, new Date()]);
}

/**
 * posted・logs シートの古い行を削除する定期メンテナンス関数。
 * cleanupAllBots() から Bot ごとに呼び出される。
 *
 * @param {number} retentionDays 保持日数（デフォルト 30 日）
 */
function cleanupOldData(retentionDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  [
    { name: "posted", dateCol: 3 }, // posted_at
    { name: "logs",   dateCol: 1 }, // time
  ].forEach(({ name, dateCol }) => {
    const sheet = getSheet(name);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return; // ヘッダーのみ

    const dates = sheet.getRange(2, dateCol, lastRow - 1, 1).getValues();
    // 末尾から削除することで行ずれを防ぐ
    for (let i = dates.length - 1; i >= 0; i--) {
      const cellDate = new Date(dates[i][0]);
      if (cellDate < cutoff) {
        sheet.deleteRow(i + 2); // +2 = ヘッダー行 + 0-index 補正
      }
    }
    logInfo(`クリーンアップ完了: ${CURRENT_BOT_ID}/${name}`, `${retentionDays} 日以前のデータを削除`);
  });
}

/**
 * CURRENT_BOT_ID の Bot 設定を config シートから読み込み CONFIG に上書きする。
 * runNewsBot() の先頭から呼び出される loadSheetConfig() がこの関数に委譲する。
 *
 * config シートのフォーマット（4カラム）:
 *   bot_id | key | value | description
 *
 * 対応キー:
 *   RSS_FEED / KEYWORD / KEYWORD_BLOCK / MAX_ARTICLES
 */
function loadBotConfig(botId) {
  CURRENT_BOT_ID = botId;

  // BOTS から Webhook を CONFIG に設定
  const botDef = BOTS[botId];
  if (!botDef) throw new Error(`未定義の Bot ID: ${botId}`);
  CONFIG.WEBHOOK       = botDef.WEBHOOK;
  CONFIG.ALERT_WEBHOOK = botDef.ALERT_WEBHOOK;
  CONFIG.MAX_ARTICLES  = 10; // 毎回デフォルトにリセットしてからシート値で上書き

  // config シートは共有シートのため直接取得（getSheet はプレフィックスを付けるため使わない）
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("config");
  if (!sheet || sheet.getLastRow() <= 1) return;

  // 4カラム: bot_id | key | value | description
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  const feeds = [], keywords = [], keywordsBlock = [];

  rows.forEach(([rowBotId, key, value]) => {
    if (String(rowBotId).trim() !== botId) return; // 他 Bot の設定をスキップ
    if (!key || value === "") return;
    const k = String(key).trim().toUpperCase();
    const v = String(value).trim();
    switch (k) {
      case "RSS_FEED":      feeds.push(v);                                               break;
      case "KEYWORD":       keywords.push(v.toLowerCase());                              break;
      case "KEYWORD_BLOCK": keywordsBlock.push(v.toLowerCase());                         break;
      case "MAX_ARTICLES":  CONFIG.MAX_ARTICLES = parseInt(v, 10) || CONFIG.MAX_ARTICLES; break;
    }
  });

  if (feeds.length > 0)         CONFIG.RSS_FEEDS      = feeds;
  if (keywords.length > 0)      CONFIG.KEYWORDS       = keywords;
  if (keywordsBlock.length > 0) CONFIG.KEYWORDS_BLOCK = keywordsBlock;

  Logger.log(`loadBotConfig: ${botId} / feeds=${feeds.length} / keywords=${keywords.length}`);
}

/**
 * runNewsBot() から呼ばれる既存の関数。loadBotConfig() に委譲することで
 * runNewsBot() 本体を変更せずに多 Bot 対応を実現する。
 */
function loadSheetConfig() {
  loadBotConfig(CURRENT_BOT_ID);
}

/**
 * config シートのヘッダーを4カラム構成に更新する。
 * setupAllConfigSheets() から呼び出される。既存データは保持する。
 */
function setupConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("config");
  if (!sheet) {
    sheet = ss.insertSheet("config");
  }
  // ヘッダーを4カラム構成に更新（既存データ行はそのまま）
  sheet.getRange(1, 1, 1, 4).setValues([["bot_id", "key", "value", "description"]]);
  Logger.log("config シートのヘッダーを4カラム構成に更新しました");
}

function getSheet(name) {
  // config は全 Bot 共有シートのためプレフィックスなし
  const sharedSheets = ["config"];
  const sheetName = sharedSheets.includes(name) ? name : `${CURRENT_BOT_ID}_${name}`;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    switch (name) {
      case "articles":
        sheet.appendRow(["id", "created_at", "title", "url", "source", "summary", "summary_points", "comment", "keywords", "score", "is_high_relevance"]);
        break;
      case "posted":
        sheet.appendRow(["url", "title", "posted_at"]);
        break;
      case "logs":
        sheet.appendRow(["time", "level", "message", "detail"]);
        break;
      case "dashboard":
        sheet.appendRow(["date", "articles_collected", "articles_posted", "high_relevance", "regular", "errors"]);
        break;
    }
  }
  return sheet;
}
