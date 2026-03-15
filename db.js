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
