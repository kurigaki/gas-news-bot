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
 * setupCleanupTrigger() で週1回（毎週月曜 3:00）自動実行するよう登録する。
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
    logInfo(`クリーンアップ完了: ${name}`, `${retentionDays} 日以前のデータを削除`);
  });
}

/**
 * config シートの設定を読み込んで CONFIG オブジェクトに上書きする。
 * runNewsBot() の先頭で呼び出す。
 *
 * シートのフォーマット（key 列 / value 列）:
 *   RSS_FEED      | https://...    （複数行で複数フィード）
 *   KEYWORD       | llm            （複数行で複数キーワード）
 *   KEYWORD_BLOCK | pr記事         （複数行でブロックキーワード）
 *   MAX_ARTICLES  | 10
 */
function loadSheetConfig() {
  const sheet = getSheet("config");
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return; // ヘッダーのみ、設定なし

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const feeds = [];
  const keywords = [];
  const keywordsBlock = [];

  rows.forEach(([key, value]) => {
    if (!key || value === "") return;
    const k = String(key).trim().toUpperCase();
    const v = String(value).trim();
    switch (k) {
      case "RSS_FEED":      feeds.push(v);                                           break;
      case "KEYWORD":       keywords.push(v.toLowerCase());                          break;
      case "KEYWORD_BLOCK": keywordsBlock.push(v.toLowerCase());                     break;
      case "MAX_ARTICLES":  CONFIG.MAX_ARTICLES = parseInt(v, 10) || CONFIG.MAX_ARTICLES; break;
    }
  });

  if (feeds.length > 0)         CONFIG.RSS_FEEDS       = feeds;
  if (keywords.length > 0)      CONFIG.KEYWORDS        = keywords;
  if (keywordsBlock.length > 0) CONFIG.KEYWORDS_BLOCK  = keywordsBlock;
}

/**
 * config シートを現在の CONFIG 値で初期化する。
 * 初回セットアップ時に一度だけ手動で実行すること。
 * 既存の設定行はすべて削除してから書き直す。
 */
function setupConfigSheet() {
  const sheet = getSheet("config");
  // ヘッダー行を残して既存データを削除
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }

  const rows = [];
  CONFIG.RSS_FEEDS.forEach(url  => rows.push(["RSS_FEED",      url,  "RSSフィードURL（1行1フィード）"]));
  CONFIG.KEYWORDS.forEach(kw    => rows.push(["KEYWORD",        kw,   "フィルタキーワード（1行1件）"]));
  (CONFIG.KEYWORDS_BLOCK || []).forEach(kw => rows.push(["KEYWORD_BLOCK", kw, "ブロックキーワード（1行1件）"]));
  rows.push(["MAX_ARTICLES", CONFIG.MAX_ARTICLES, "1回あたりの最大投稿件数"]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  Logger.log(`config シートを初期化しました（${rows.length} 行）`);
}

/**
 * cleanupOldData を毎週月曜 3:00 に実行するトリガーを登録する。
 * GAS エディタから一度だけ手動で実行すること。
 */
function setupCleanupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "cleanupOldData")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("cleanupOldData")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(3)
    .create();

  Logger.log("クリーンアップトリガーを設定しました: 毎週月曜 03:00");
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
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
      case "config":
        sheet.appendRow(["key", "value", "description"]);
        break;
    }
  }
  return sheet;
}
