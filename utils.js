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
 * - 429 の場合は以下の優先順で待機時間を決定:
 *   1. レスポンスヘッダー Retry-After / X-RateLimit-Reset-After
 *   2. ボディ JSON の retry_after（Discord アプリケーションレート用）
 *   3. 指数バックオフ
 * - Cloudflare の "error code: 1015"（webhook 累積レート）は body が JSON ではなく
 *   待機要求も長め（数十秒〜数分）になるため、最低 30 秒の待機を強制する。
 * - 5xx サーバーエラーは指数バックオフで再試行。
 * - 4xx（429 以外）はリトライしない。
 *
 * @param {string}   url        リクエスト先 URL
 * @param {Object}   options    UrlFetchApp.fetch に渡すオプション
 * @param {number}   maxRetries 最大リトライ回数（デフォルト 3）
 * @param {number}   initialDelayMs 初回待機ミリ秒（デフォルト 1000）
 * @returns {HTTPResponse}
 */
function fetchWithRetry(url, options, maxRetries = 3, initialDelayMs = 1000) {
  // GAS の UrlFetchApp は 1 リクエストあたり最大 60 秒スリープが現実的な上限
  const MAX_WAIT_MS = 60 * 1000;
  const CLOUDFLARE_1015_MIN_WAIT_MS = 30 * 1000;

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

    // 待機時間を決定（指数バックオフをデフォルトに）
    let waitMs = initialDelayMs * Math.pow(2, attempt);
    let waitSource = "backoff";

    if (code === 429) {
      // ① レスポンスヘッダー Retry-After / X-RateLimit-Reset-After を最優先
      const headers = lastRes.getHeaders() || {};
      const headerRetry =
        headers["Retry-After"] || headers["retry-after"] ||
        headers["X-RateLimit-Reset-After"] || headers["x-ratelimit-reset-after"];
      if (headerRetry) {
        const sec = parseFloat(headerRetry);
        if (!isNaN(sec) && sec > 0) {
          waitMs = Math.ceil(sec * 1000) + 200;
          waitSource = "header";
        }
      }

      // ② ヘッダーで取れなければボディ JSON を見る（Discord application rate-limit）
      if (waitSource === "backoff") {
        const text = lastRes.getContentText() || "";
        try {
          const body = JSON.parse(text);
          const bodyRetry = body.retry_after;
          if (bodyRetry) {
            waitMs = Math.ceil(parseFloat(bodyRetry) * 1000) + 200;
            waitSource = "body";
          }
        } catch (_) {
          // Cloudflare 1015 など、body が JSON ではないケース
          if (text.indexOf("1015") !== -1 || /cloudflare/i.test(text)) {
            waitMs = Math.max(waitMs, CLOUDFLARE_1015_MIN_WAIT_MS);
            waitSource = "cloudflare-1015";
          }
        }
      }

      // ③ Cloudflare 1015 のときは最低 30 秒待機を強制
      const text = lastRes.getContentText() || "";
      if (text.indexOf("1015") !== -1) {
        waitMs = Math.max(waitMs, CLOUDFLARE_1015_MIN_WAIT_MS);
        if (waitSource === "backoff") waitSource = "cloudflare-1015";
      }
    }

    // GAS の制約と CF 過剰待機回避のため上限でクリップ
    if (waitMs > MAX_WAIT_MS) waitMs = MAX_WAIT_MS;

    logWarn(`HTTP ${code} - ${waitMs}ms 後にリトライ (${attempt + 1}/${maxRetries}) [${waitSource}]`, url);
    Utilities.sleep(waitMs);
  }
  return lastRes;
}
