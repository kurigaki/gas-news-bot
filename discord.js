/**
 * Discord フォーラムチャンネルにスレッドを新規作成し、スレッド ID を返す。
 * Google Chat の createNewThread() 相当。
 *
 * Discord フォーラム Webhook では最初の POST が「スレッドの作成 + 最初のメッセージ」を
 * 兼ねるため、ヘッダーメッセージをここで送信する。
 *
 * @param {string} threadName  フォーラムに表示されるスレッドタイトル
 * @param {string} headerText  スレッド内の最初のメッセージ本文
 * @returns {string|null}  作成されたスレッドの channel_id、失敗時は null
 */
function createDiscordThread(threadName, headerText) {
  const payload = {
    thread_name: threadName,
    content: headerText,
  };

  const res = UrlFetchApp.fetch(CONFIG.WEBHOOK, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() >= 400) {
    logError("Discord createThread ERROR", res.getContentText());
    return null;
  }

  try {
    const json = JSON.parse(res.getContentText());
    // Discord はメッセージレスポンスの channel_id にスレッド ID を返す
    const threadId = json.channel_id || null;
    Logger.log("Discord スレッド作成成功: " + threadId);
    return threadId;
  } catch (e) {
    logError("Discord thread_id parse ERROR", e.message);
    return null;
  }
}

/**
 * 既存スレッドに記事を embed で投稿する。
 * Google Chat の sendToChat() / sendHighRelevanceToChat() 相当。
 *
 * @param {Object} article   投稿する記事オブジェクト
 * @param {string} threadId  投稿先スレッドの channel_id
 */
function postArticleToThread(article, threadId) {
  const pointsText = Array.isArray(article.summary_points)
    ? article.summary_points.map(p => `・${p}`).join("\n")
    : (article.summary_points || "要点なし");

  const isHighRelevance = article.isHighRelevance || false;

  const embed = {
    title: (isHighRelevance ? "🔥 " : "📰 ") + article.title,
    url: article.url,
    description:
      `**【要点】**\n${pointsText}\n\n` +
      `**【要約】**\n${article.summary || ""}\n\n` +
      (article.comment ? `**【コメント】**\n${article.comment}` : ""),
    color: isHighRelevance ? 0xff4500 : 0x5865f2,
    fields: [
      { name: "Score", value: String(article.score || 0), inline: true },
      { name: "Source", value: article.source || "RSS", inline: true },
    ],
  };

  const res = UrlFetchApp.fetch(`${CONFIG.WEBHOOK}?thread_id=${threadId}`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ embeds: [embed] }),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() >= 400) {
    logError("Discord postArticle ERROR", res.getContentText());
  }
}

/**
 * 実行レポートをスレッドに投稿する。
 * Google Chat の sendReportToChat() 相当。
 *
 * @param {Object} stats    統計オブジェクト
 * @param {string} threadId 投稿先スレッドの channel_id
 */
function postReportToThread(stats, threadId) {
  const lines = [
    "📊 **実行レポート**",
    "",
    `🔍 収集: ${stats.collected} 件 → フィルタ後: ${stats.filtered} 件 → 投稿: ${stats.posted} 件`,
    `🔥 高関連度: ${stats.highRelevance} 件 / 通常: ${stats.posted - stats.highRelevance} 件`,
    `⏱️ 実行時間: ${stats.executionTime} 秒`,
  ];

  const res = UrlFetchApp.fetch(`${CONFIG.WEBHOOK}?thread_id=${threadId}`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content: lines.join("\n") }),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() >= 400) {
    logError("Discord postReport ERROR", res.getContentText());
  }
}
