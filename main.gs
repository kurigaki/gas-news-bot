function runNewsBot() {
  Logger.log("START");

  const articles = collectArticles();
  const articlesCollected = articles.length;

  const filtered = filterArticles(articles);
  const ranked = rankArticles(filtered);
  const newArticles = removeDuplicates(ranked);

  if (newArticles.length === 0) {
    Logger.log("new article none");
    updateDashboard(articlesCollected, 0, 0, 0, 0);
    return;
  }

  const threadName = `📡 ${Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd")} 技術ニュース`;

  let postedCount = 0;
  let threadId = null; // 最初の投稿でスレッドを作成し、ID を使い回す

  newArticles.slice(0, CONFIG.MAX_ARTICLES).forEach(article => {
    // AI 要約
    const summaryData = aiSummary(article);
    article.summary = summaryData.summary;
    article.summary_points = summaryData.points; // 配列
    article.comment = summaryData.comment;
    article.trend_score = summaryData.trend;

    // キーワード抽出
    const text = (article.title + " " + article.content).toLowerCase();
    article.keywords = CONFIG.KEYWORDS.filter(k => text.includes(k));

    article.ai_score = article.score || 0;
    article.source = article.source || "RSS";

    // Discord 投稿（threadId が null なら新規スレッド作成、以降は既存スレッドに追記）
    threadId = postDiscord(article, threadName, threadId);

    saveArticle(article);
    markAsPosted(article);
    postedCount++;

    Utilities.sleep(1200);
  });

  updateDashboard(articlesCollected, postedCount);
  Logger.log("END");
}
