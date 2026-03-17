// ═══════════════════════════════════════════════════════════
//  多 Bot 対応: Bot 別エントリーポイント
//  各関数をトリガーに登録することで Bot ごとに独立して実行される
// ═══════════════════════════════════════════════════════════

/** 各 Bot のエントリーポイント（GAS トリガーに登録する） */
function runAiNews()    { runBot("AI_NEWS");   }
function runItNews()    { runBot("IT_NEWS");   }
function runParenting() { runBot("PARENTING"); }
function runPolitics()  { runBot("POLITICS");  }
function runNews()      { runBot("NEWS");      }

/**
 * 指定 Bot の設定を読み込んでから runNewsBot() を実行する。
 * runNewsBot() 本体は変更せず、CONFIG の切り替えだけで多 Bot 対応を実現。
 */
function runBot(botId) {
  Logger.log(`[${botId}] Bot 起動`);
  loadBotConfig(botId); // CURRENT_BOT_ID と CONFIG.WEBHOOK を切り替え
  runNewsBot();         // 既存のメイン処理をそのまま実行
}

/**
 * 全 Bot のトリガーをまとめて登録する。
 * 既存トリガーはすべて削除してから再登録するため、一度だけ実行すればよい。
 */
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Bot 別の実行スケジュール（同時刻でも GAS は並列実行するため問題なし）
  const botTriggers = [
    { fn: "runAiNews",    hour: 7 },
    { fn: "runItNews",    hour: 7 },
    { fn: "runParenting", hour: 7 },
    { fn: "runPolitics",  hour: 7 },
    { fn: "runNews",      hour: 7 },
  ];
  botTriggers.forEach(({ fn, hour }) => {
    ScriptApp.newTrigger(fn)
      .timeBased()
      .atHour(hour)
      .everyDays(1)
      .inTimezone("Asia/Tokyo")
      .create();
    Logger.log(`トリガー登録: ${fn} @ ${hour}:00 (Asia/Tokyo)`);
  });

  // クリーンアップ（全 Bot 対象）: 毎週月曜 03:00
  ScriptApp.newTrigger("cleanupAllBots")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(3)
    .create();
  Logger.log("トリガー登録: cleanupAllBots @ 月曜 03:00");
}

/**
 * 全 Bot の posted・logs シートの古いデータをクリーンアップする。
 * setupAllTriggers() で毎週月曜 03:00 に自動実行するよう登録される。
 */
function cleanupAllBots(retentionDays = 30) {
  Object.keys(BOTS).forEach(botId => {
    CURRENT_BOT_ID = botId;
    cleanupOldData(retentionDays); // 既存関数を Bot ごとに再利用
  });
}

/**
 * config シートのヘッダーを4カラム構成（bot_id | key | value | description）に更新する。
 * 初回セットアップ時に一度だけ手動で実行すること。既存データ行は保持される。
 */
function setupAllConfigSheets() {
  setupConfigSheet(); // db.js の関数を呼び出す
  Logger.log("完了。config シートに各 Bot の設定を入力してください。");
  Logger.log("フォーマット: bot_id 列に AI_NEWS / IT_NEWS / PARENTING / POLITICS / NEWS を指定");
}

// ═══════════════════════════════════════════════════════════
//  以下は既存コード（変更なし）
// ═══════════════════════════════════════════════════════════

/**
 * 毎朝 7:00 に runNewsBot を自動実行するトリガーを登録する。
 * ※ 多 Bot 対応後は setupAllTriggers() を使うこと。後方互換のため残す。
 */
function setupDailyTrigger() {
  // 既存トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runNewsBot")
    .forEach(t => ScriptApp.deleteTrigger(t));

  // 毎日 7:00〜8:00 の間に実行（GAS の時間帯トリガーは1時間幅で指定）
  ScriptApp.newTrigger("runNewsBot")
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone("Asia/Tokyo")
    .create();

  Logger.log("トリガーを設定しました: 毎日 07:00 (Asia/Tokyo)");
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

  // config シートの設定を CONFIG に上書き（⑤）
  loadSheetConfig();

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

  const targets = newArticles.slice(0, CONFIG.MAX_ARTICLES);

  // バッチ要約（A）: 1回の API 呼び出しで全記事を要約
  if (new Date() - startTime > MAX_EXEC_MS) {
    logWarn("実行時間上限のため AI 要約をスキップ", "記事なし投稿");
    updateDashboard(articlesCollected, 0, 0, 0, 0);
    return;
  }
  const summaries = aiBatchSummary(targets);

  targets.forEach((article, i) => {
    const summaryData      = summaries[i] || { points: [], summary: "", comment: "", trend: 0 };
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
  });

  const allArticles = [...priorityArticles, ...regularArticles];

  // ── 3. Discord スレッド作成（1本だけ）──────────────────
  const today      = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");
  const threadName = `${today} ${CONFIG.BOT_THREAD_LABEL}`;
  const headerText =
    `📢 **${today} の${CONFIG.BOT_HEADER_LABEL}**\n\n` +
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
