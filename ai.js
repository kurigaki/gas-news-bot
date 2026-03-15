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
    model:"openai/gpt-4o-mini",
    messages:[{role:"user", content:prompt}]
  };

  const res = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:"post",
    headers:{
      Authorization:"Bearer "+CONFIG.OPENROUTER,
      "Content-Type":"application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions:true
  });

  try{
    const json = JSON.parse(res.getContentText());
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
function aiBatchSummary(articles) {
  if (articles.length === 0) return [];

  const articlesText = articles.map((a, i) =>
    `=== 記事${i + 1} ===\nタイトル: ${a.title}\n本文: ${a.content.slice(0, 800)}`
  ).join("\n\n");

  const prompt =
    `以下の${articles.length}件の技術記事を分析してください。\n` +
    `必ず次の形式のJSON配列のみを返してください（説明文不要）:\n` +
    `[{"points":["要点1","要点2","要点3"],"summary":"100文字程度の要約","comment":"エンジニア視点のコメント"},...]\n\n` +
    articlesText;

  const res = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "post",
    headers: {
      Authorization: "Bearer " + CONFIG.OPENROUTER,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  try {
    const json = JSON.parse(res.getContentText());
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
    // フォールバック: 記事ごとに個別呼び出し
    return articles.map(a => {
      const result = aiSummary(a);
      Utilities.sleep(500);
      return result;
    });
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