/**
 * 毎朝 8:00 に runNewsBot を自動実行するトリガーを登録する。
 * GAS エディタから一度だけ手動で実行すること。
 * 既存の同名トリガーは重複防止のため事前に削除する。
 */
function setupDailyTrigger() {
  // 既存トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runNewsBot")
    .forEach(t => ScriptApp.deleteTrigger(t));

  // 毎日 8:00〜9:00 の間に実行（GAS の時間帯トリガーは1時間幅で指定）
  ScriptApp.newTrigger("runNewsBot")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone("Asia/Tokyo")
    .create();

  Logger.log("トリガーを設定しました: 毎日 08:00 (Asia/Tokyo)");
}

/**
 * 登録済みトリガーを確認する（デバッグ用）
 */
function listTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    Logger.log(`関数: ${t.getHandlerFunction()} / 種別: ${t.getEventType()} / ID: ${t.getUniqueId()}`);
  });
}

// GAS の実行時間上限は 6 分。5 分を超えたら新規処理を打ち切る
const MAX_EXEC_MS = 5 * 60 * 1000;

function runNewsBot() {
  const startTime = new Date();
  Logger.log("START");

  // ── 1. 収集・絞り込み ──────────────────────────────────
  const articles = collectArticles();
  const articlesCollected = articles.length;

  const filtered = filterArticles(articles);
  const ranked = rankArticles(filtered);
  const newArticles = removeDuplicates(ranked);

  if (newArticles.length === 0) {
    Logger.log("新しい記事なし");
    updateDashboard(articlesCollected, 0, 0, 0, 0);
    logInfo("実行完了", `収集: ${articlesCollected} 件 / 投稿対象なし`);
    return;
  }

  // ── 2. AI 要約・記事分類 ───────────────────────────────
  const priorityArticles = [];
  const regularArticles  = [];

  newArticles.slice(0, CONFIG.MAX_ARTICLES).forEach(article => {
    // 実行時間が上限に近づいたら打ち切り
    if (new Date() - startTime > MAX_EXEC_MS) {
      logWarn("実行時間上限のため AI 要約を中断", `未処理記事あり`);
      return;
    }

    const summaryData = aiSummary(article);
    article.summary        = summaryData.summary;
    article.summary_points = summaryData.points;
    article.comment        = summaryData.comment;
    article.trend_score    = summaryData.trend;

    const text = (article.title + " " + article.content).toLowerCase();
    article.keywords = CONFIG.KEYWORDS.filter(k => text.includes(k));
    article.ai_score = article.score || 0;
    article.source   = article.source || "RSS";

    // キーワードが複数ヒット → 高関連度
    article.isHighRelevance = article.keywords.length >= 2;

    if (article.isHighRelevance) {
      priorityArticles.push(article);
    } else {
      regularArticles.push(article);
    }

    Utilities.sleep(800);
  });

  const allArticles = [...priorityArticles, ...regularArticles];

  // ── 3. Discord スレッド作成（1本だけ）──────────────────
  const today      = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");
  const threadName = `📡 ${today} 技術ニュース`;
  const headerText =
    `📢 **${today} の技術記事まとめ**\n\n` +
    `本日の注目記事をお届けします（${allArticles.length} 件）`;

  const threadId = createDiscordThread(threadName, headerText);

  if (!threadId) {
    logError("スレッド作成失敗", "threadId が取得できませんでした");
    Logger.log("スレッド作成失敗のため処理を中断");
    return;
  }

  // ── 4. 記事を順番に投稿 ───────────────────────────────
  let postedCount = 0;

  allArticles.forEach(article => {
    postArticleToThread(article, threadId);
    saveArticle(article);
    markAsPosted(article);
    postedCount++;
    Utilities.sleep(1200);
  });

  // ── 5. レポート投稿 ───────────────────────────────────
  const executionTime = ((new Date() - startTime) / 1000).toFixed(1);
  postReportToThread({
    collected:     articlesCollected,
    filtered:      newArticles.length,
    posted:        postedCount,
    highRelevance: priorityArticles.length,
    executionTime: executionTime,
  }, threadId);

  updateDashboard(articlesCollected, postedCount, priorityArticles.length, regularArticles.length, 0);
  logInfo("実行完了", `収集: ${articlesCollected} 件 / 投稿: ${postedCount} 件 / ${executionTime} 秒`);
  Logger.log(`END: ${postedCount} 件投稿 / ${executionTime} 秒`);
}
