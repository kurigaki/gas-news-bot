function aiSummary(article){
  const prompt = `
技術記事を分析してください。タイトルは含めず、本文のみ分析してください。

出力フォーマット:
【要点】
・
・
・

【要約】
100文字程度

【コメント】
エンジニア視点

本文:
${article.content.slice(0,2000)}
`;

  const payload = {
    model:"google/gemini-2.0-flash-exp:free",
    messages:[{role:"user", content:prompt}]
  };

  const res = fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "post",
    headers: {
      Authorization: "Bearer " + CONFIG.OPENROUTER,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(payload),
  });

  const code = res.getResponseCode();
  if (code >= 400) {
    logWarn(`aiSummary: HTTP ${code}`, res.getContentText().slice(0, 300));
    return {points:[], summary:"AI要約失敗(HTTP " + code + ")", comment:"", trend:0};
  }

  try{
    const json = JSON.parse(res.getContentText());
    if (!json.choices || !json.choices[0]) {
      logWarn("aiSummary: choices が無い", res.getContentText().slice(0, 300));
      return {points:[], summary:"AI要約失敗", comment:"", trend:0};
    }
    const text = json.choices[0].message.content;

    const pointsMatch = text.match(/【要点】\s*([\s\S]*?)\s*(?=【要約】)/);
    const summaryMatch = text.match(/【要約】\s*([\s\S]*?)\s*(?=【コメント】)/);
    const commentMatch = text.match(/【コメント】\s*([\s\S]*)/);

    // 要点を配列に変換（「・」「-」「*」区切りに対応）
    const rawPoints = pointsMatch ? pointsMatch[1].trim() : "";
    const points = rawPoints
      .split(/\n/)
      .map(l => l.replace(/^[・\-\*]\s*/, "").trim())
      .filter(l => l.length > 0);

    return {
      points: points,
      summary: summaryMatch ? summaryMatch[1].trim() : "",
      comment: commentMatch ? commentMatch[1].trim() : "",
      trend: 0
    };
  } catch(e){
    return {points:[], summary:"AI要約失敗", comment:"", trend:0};
  }
}

/**
 * 複数記事をまとめて1回の API 呼び出しで要約する。
 * 個別呼び出しに比べて大幅に実行時間を削減できる。
 * パースに失敗した場合は個別呼び出し（aiSummary）にフォールバックする。
 *
 * @param {Object[]} articles 記事配列
 * @returns {Object[]} 各記事に対応する要約オブジェクトの配列
 */
/**
 * @param {Object[]} articles 記事配列
 * @param {Date|null} deadline この時刻を過ぎたら個別フォールバックを打ち切る
 */
function aiBatchSummary(articles, deadline) {
  if (articles.length === 0) return [];

  const articlesText = articles.map((a, i) =>
    `=== 記事${i + 1} ===\nタイトル: ${a.title}\n本文: ${a.content.slice(0, 800)}`
  ).join("\n\n");

  const prompt =
    `以下の${articles.length}件の技術記事を分析してください。\n` +
    `必ず次の形式のJSON配列のみを返してください（説明文不要）:\n` +
    `[{"points":["要点1","要点2","要点3"],"summary":"100文字程度の要約","comment":"エンジニア視点のコメント"},...]\n\n` +
    articlesText;

  const res = fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "post",
    headers: {
      Authorization: "Bearer " + CONFIG.OPENROUTER,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,  // Fix A: 途中切れ防止
    }),
  });

  const code = res.getResponseCode();
  // 402 等のクレジット/権限系エラーは個別呼び出ししても無駄なので即空配列を返す
  if (code === 402 || code === 401 || code === 403) {
    logWarn(`aiBatchSummary: HTTP ${code} - AI要約をスキップ`, res.getContentText().slice(0, 300));
    return articles.map(() => ({ points: [], summary: `AI要約失敗(HTTP ${code})`, comment: "", trend: 0 }));
  }
  if (code >= 400) {
    logWarn(`aiBatchSummary: HTTP ${code}`, res.getContentText().slice(0, 300));
  }

  try {
    const json = JSON.parse(res.getContentText());
    if (!json.choices || !json.choices[0]) {
      throw new Error("choices が無い: " + res.getContentText().slice(0, 200));
    }
    const text = json.choices[0].message.content.trim();

    // JSON 配列部分だけ抽出（前後に余分なテキストがある場合に対応）
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("JSON 配列が見つかりません");

    const results = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(results)) throw new Error("レスポンスが配列ではありません");

    return results.map(r => ({
      points:  Array.isArray(r.points) ? r.points : [],
      summary: r.summary || "",
      comment: r.comment || "",
      trend:   0,
    }));
  } catch (e) {
    logWarn("AI バッチ要約失敗、個別要約にフォールバック", e.message);

    // Fix B: フォールバック中も残り時間を監視し、期限を超えたら残りをスキップ
    const results = [];
    for (const a of articles) {
      if (deadline && new Date() >= deadline) {
        logWarn("フォールバック中断：実行時間上限", `処理済み ${results.length}/${articles.length} 件`);
        while (results.length < articles.length) {
          results.push({ points: [], summary: "", comment: "", trend: 0 });
        }
        break;
      }
      results.push(aiSummary(a));
      Utilities.sleep(500);
    }
    return results;
  }
}

function computeTrendScore(article){
  let score = 0;
  const text = (article.title + " " + article.content).toLowerCase();
  const aiKeywords=["ai","llm","gpt","openai","claude","生成ai","chatgpt","cursor","copilot"];
  const devKeywords=["typescript","next.js","react","docker","kubernetes","aws","api","backend"];

  aiKeywords.forEach(k=>{ if(text.includes(k)) score+=25 });
  devKeywords.forEach(k=>{ if(text.includes(k)) score+=10 });
  if(article.content.length>1500) score+=10;
  if(article.content.length>3000) score+=10;
  score += Math.floor(Math.random()*10);
  return Math.min(score,100);
}