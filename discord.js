/**
 * 記事を Discord のフォーラムチャンネルに投稿する。
 *
 * - threadId が null のとき → thread_name を付けて新規スレッドを作成し、
 *   レスポンスから thread_id を返す。
 * - threadId が渡されたとき → ?thread_id=... クエリで既存スレッドに追記する。
 *
 * @param {Object} article    投稿する記事オブジェクト
 * @param {string} threadName スレッド名（新規作成時のみ使用）
 * @param {string|null} threadId 既存スレッド ID（null なら新規作成）
 * @returns {string|null} 作成 / 使用したスレッド ID
 */
function postDiscord(article, threadName, threadId = null) {
  const webhook = CONFIG.WEBHOOK;

  // ポイントを配列 → 箇条書きに変換
  const pointsText = Array.isArray(article.summary_points)
    ? article.summary_points.map(p => `・${p}`).join("\n")
    : (article.summary_points || "要点なし");

  const embed = {
    title: article.title,
    url: article.url,
    description:
      `**【要点】**\n${pointsText}\n\n` +
      `**【要約】**\n${article.summary || ""}\n\n` +
      (article.comment ? `**【コメント】**\n${article.comment}` : ""),
    fields: [
      { name: "Score", value: String(article.score || 0), inline: true },
      { name: "Source", value: article.source || "RSS", inline: true },
    ],
    color: 0x5865f2, // Blurple
  };

  const payload = { embeds: [embed] };

  // 新規スレッド作成時は thread_name を付与
  if (!threadId) {
    payload.thread_name = threadName;
  }

  // 既存スレッドへの追記は ?thread_id= クエリを使う
  const url = threadId ? `${webhook}?thread_id=${threadId}` : webhook;

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const res = UrlFetchApp.fetch(url, options);
  const code = res.getResponseCode();

  if (code >= 400) {
    logError("Discord POST ERROR", res.getContentText());
    return threadId;
  }

  // 新規スレッド作成時はレスポンスから thread_id を取得して返す
  if (!threadId) {
    try {
      const json = JSON.parse(res.getContentText());
      return json.channel_id || json.id || null;
    } catch (e) {
      logError("Discord thread_id parse ERROR", e.message);
      return null;
    }
  }

  return threadId;
}
