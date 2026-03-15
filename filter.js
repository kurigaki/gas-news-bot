// 本文がこの文字数未満の記事は要約品質が低いためスキップ（F）
const MIN_CONTENT_LENGTH = 100;

function filterArticles(articles) {
  const block          = CONFIG.KEYWORDS_BLOCK  || [];
  const keywords       = CONFIG.KEYWORDS        || [];
  const requireKeyword = CONFIG.REQUIRE_KEYWORD === true;

  return articles.filter(a => {
    // F: コンテンツ不足記事をスキップ
    if ((a.content || "").length < MIN_CONTENT_LENGTH) {
      logWarn("コンテンツ不足のためスキップ", `${a.title.slice(0, 50)} (${(a.content || "").length}文字)`);
      return false;
    }

    // ブロックキーワードに一致する記事を除外
    if (block.some(k => (a.title + a.content).toLowerCase().includes(k))) {
      return false;
    }

    // REQUIRE_KEYWORD: true のとき、キーワードが1件もヒットしない記事を除外
    // config シートで「REQUIRE_KEYWORD | true」を設定した Bot のみ有効
    if (requireKeyword && keywords.length > 0) {
      const text = (a.title + " " + a.content).toLowerCase();
      if (!keywords.some(k => text.includes(k))) {
        return false;
      }
    }

    return true;
  });
}