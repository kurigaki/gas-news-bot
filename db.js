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
