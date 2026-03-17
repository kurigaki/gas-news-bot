/**
 * URL を正規化して重複判定に使いやすい形に変換する。
 * - フラグメント（#以降）を除去
 * - UTM パラメータ等のトラッキング用クエリを除去
 * - 末尾スラッシュを除去
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const TRACKING_PARAMS = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "from", "via", "source", "fbclid", "gclid", "yclid",
    ]);
    // フラグメントを除去
    let u = String(url).split("#")[0];
    const [base, query] = u.split("?");
    if (query) {
      const kept = query.split("&").filter(p => {
        const key = p.split("=")[0].toLowerCase();
        return !TRACKING_PARAMS.has(key) && !key.startsWith("utm_");
      });
      u = kept.length > 0 ? base + "?" + kept.join("&") : base;
    }
    return u.replace(/\/$/, "").toLowerCase();
  } catch (_) {
    return String(url).toLowerCase();
  }
}

/**
 * 指数バックオフ付きリトライで HTTP リクエストを実行する。
 *
 * - 429 (Rate Limit) の場合は Discord/OpenRouter が返す retry_after を優先して待機
 * - 5xx サーバーエラーの場合は指数バックオフ（initialDelayMs × 2^試行回数）で再試行
 * - 4xx（429 以外）はリトライしない（リクエスト自体が不正なため）
 *
 * @param {string}   url        リクエスト先 URL
 * @param {Object}   options    UrlFetchApp.fetch に渡すオプション
 * @param {number}   maxRetries 最大リトライ回数（デフォルト 3）
 * @param {number}   initialDelayMs 初回待機ミリ秒（デフォルト 1000）
 * @returns {HTTPResponse}
 */
function fetchWithRetry(url, options, maxRetries = 3, initialDelayMs = 1000) {
  let lastRes;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, options));
    const code = lastRes.getResponseCode();

    if (code < 400) return lastRes; // 成功

    // 4xx（429 以外）はリトライ不要
    if (code >= 400 && code < 500 && code !== 429) {
      logWarn(`HTTP ${code} - リトライ不可`, url);
      return lastRes;
    }

    if (attempt === maxRetries) break; // リトライ上限

    // 待機時間を決定
    let waitMs = initialDelayMs * Math.pow(2, attempt);
    if (code === 429) {
      try {
        const body = JSON.parse(lastRes.getContentText());
        const retryAfter = body.retry_after || body["X-RateLimit-Reset-After"];
        if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000) + 200;
      } catch (_) {}
    }

    logWarn(`HTTP ${code} - ${waitMs}ms 後にリトライ (${attempt + 1}/${maxRetries})`, url);
    Utilities.sleep(waitMs);
  }
  return lastRes;
}
