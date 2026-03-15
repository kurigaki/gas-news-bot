function collectArticles() {
  let list = [];
  const stats = []; // フィード別の取得結果

  CONFIG.RSS_FEEDS.forEach(feedUrl => {
    try {
      const xml = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true }).getContentText();
      const articles = parseFeed(xml, feedUrl);
      list = list.concat(articles);
      stats.push({ url: feedUrl, count: articles.length, ok: true });
    } catch (e) {
      logError("RSS FETCH ERROR: " + feedUrl, e.message);
      stats.push({ url: feedUrl, count: 0, ok: false, error: e.message });
    }
  });

  // フィード別取得件数をログに記録（B）
  const summary = stats.map(s => {
    const host = s.url.replace(/^https?:\/\//, "").split("/")[0];
    return s.ok ? `${host}:${s.count}件` : `${host}:失敗`;
  }).join(", ");
  logInfo("フィード取得完了", summary);

  const failedFeeds = stats.filter(s => !s.ok);
  if (failedFeeds.length > 0) {
    logWarn("取得失敗フィードあり", failedFeeds.map(s => s.url).join(", "));
  }

  return list;
}

/**
 * RSS / Atom フィードをパースして記事リストを返す。
 * XmlService で失敗した場合は regex フォールバックを使用。
 */
function parseFeed(xml, feedUrl) {
  try {
    const fixed = fixMalformedXml(xml);
    const doc = XmlService.parse(fixed);
    return parseByXmlService(doc, feedUrl);
  } catch (e) {
    logWarn("XML PARSE FALLBACK: " + feedUrl, e.message);
    return parseByRegex(xml, feedUrl);
  }
}

/**
 * 不正な XML を修正する前処理。
 *
 * 1. <link>URL の閉じタグなしを補完
 * 2. description / summary / content タグ内の生 HTML を CDATA でラップ
 *    → <br> <img> など閉じタグなし HTML 要素が XML パースを壊すのを防ぐ
 */
function fixMalformedXml(xml) {
  // 1. <link>URL の閉じタグを正規化
  //    既存の </link> があれば消費し、常に <link>URL</link> の形に統一する。
  //    否定先読みを使うとバックトラッキングで URL 途中に </link> が挿入されるバグがあるため
  //    代わりにオプショナルキャプチャ (?:<\/link>)? で確実に上書きする。
  let fixed = xml.replace(/<link>(https?:\/\/[^\s<]+)(?:<\/link>)?/g, "<link>$1</link>");

  // 2. description / summary / content の中身に HTML タグが含まれる場合は CDATA でラップ
  fixed = fixed.replace(
    /<(description|summary|content)([^>]*)>([\s\S]*?)<\/\1>/g,
    (match, tag, attrs, content) => {
      // すでに CDATA 済みならスキップ
      if (content.indexOf("<![CDATA[") !== -1) return match;
      // HTML タグを含む場合のみラップ
      if (/<[a-zA-Z\/!]/.test(content)) {
        return `<${tag}${attrs}><![CDATA[${content}]]></${tag}>`;
      }
      return match;
    }
  );

  return fixed;
}

/** XmlService を使って Atom / RSS 両形式をパース */
function parseByXmlService(doc, feedUrl) {
  const list = [];
  const root = doc.getRootElement();
  const ns = root.getNamespace();

  // Atom: <entry>, RSS 2.0: <channel><item>
  let entries = root.getChildren("entry", ns);
  if (entries.length === 0) {
    const channel = root.getChild("channel");
    entries = channel ? channel.getChildren("item") : [];
  }

  entries.forEach(e => {
    const title = e.getChildText("title", ns) || e.getChildText("title") || "";

    // Atom は <link href="..."/>, RSS 2.0 は <link>URL</link>
    let link = "";
    const linkNode = e.getChild("link", ns) || e.getChild("link");
    if (linkNode) {
      const href = linkNode.getAttribute("href");
      link = href ? href.getValue() : linkNode.getText();
    }

    const desc =
      e.getChildText("content", ns) ||
      e.getChildText("summary", ns) ||
      e.getChildText("description") ||
      "";

    // 公開日: Atom は <updated>/<published>, RSS 2.0 は <pubDate>
    const pubDateStr =
      e.getChildText("published", ns) ||
      e.getChildText("updated", ns) ||
      e.getChildText("pubDate") ||
      "";

    if (!title || !link) return;
    list.push({ title: title.trim(), url: link.trim(), content: desc, source: feedUrl, pubDate: pubDateStr });
  });

  return list;
}

/** XML パースが完全に失敗した場合の regex ベースのフォールバック */
function parseByRegex(xml, feedUrl) {
  const list = [];

  // <item> または <entry> ブロックを抽出
  const blockRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/g;
  let block;
  while ((block = blockRe.exec(xml)) !== null) {
    const inner = block[1];

    const titleMatch = inner.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch =
      inner.match(/<link[^>]*href="([^"]+)"/) ||
      inner.match(/<link[^>]*>(https?:\/\/[^\s<]+)<\/link>/) ||
      inner.match(/<link[^>]*>(https?:\/\/[^\s<]+)/);
    const descMatch =
      inner.match(/<(?:content|summary|description)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:content|summary|description)>/);

    const pubDateMatch = inner.match(/<(?:pubDate|published|updated)[^>]*>([^<]+)<\/(?:pubDate|published|updated)>/);

    const title   = titleMatch   ? titleMatch[1].trim()   : "";
    const link    = linkMatch    ? linkMatch[1].trim()     : "";
    const desc    = descMatch    ? descMatch[1].trim()     : "";
    const pubDate = pubDateMatch ? pubDateMatch[1].trim()  : "";

    if (!title || !link) continue;
    list.push({ title, url: link, content: desc, source: feedUrl, pubDate });
  }

  return list;
}
