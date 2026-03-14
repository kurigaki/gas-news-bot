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