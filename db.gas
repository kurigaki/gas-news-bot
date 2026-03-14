function saveArticle(article){
  const sheet = getSheet("articles");
  const id = Utilities.getUuid();
  const keywords = article.keywords ? article.keywords.join(",") : "";

  sheet.appendRow([
    id,
    new Date(),
    article.title,
    article.url,
    article.source || "",
    article.summary || "",
    article.summary_points || "",
    article.comment || "",
    keywords,
    article.score || 0,
    article.ai_score || 0,
    article.trend_score || 0,
    article.duplicate ? true:false,
    article.posted ? true:false,
    new Date()
  ]);
}

function removeDuplicates(list){
  const sheet = getSheet("posted");
  const lastRow = sheet.getLastRow();
  if(lastRow===0) return list;
  const urls = sheet.getRange(1,1,lastRow,1).getValues().flat();
  return list.filter(a=>!urls.includes(a.url));
}

function markAsPosted(article){
  const sheet = getSheet("posted");
  sheet.appendRow([article.url, article.title, new Date()]);
}

function getSheet(name){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if(!sheet){
    sheet = ss.insertSheet(name);
    switch(name){
      case "articles": sheet.appendRow(["id","date","title","url","source","summary","summary_points","comment","keywords","score","ai_score","trend_score","duplicate","posted","created_at"]); break;
      case "posted": sheet.appendRow(["url","title","date"]); break;
      case "logs": sheet.appendRow(["time","level","message","detail"]); break;
      case "dashboard": sheet.appendRow(["date","articles_collected","articles_posted","ai_articles","dev_articles","errors"]); break;
      case "config": sheet.appendRow(["key","value","description"]); break;
    }
  }
  return sheet;
}