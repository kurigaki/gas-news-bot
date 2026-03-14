function filterArticles(articles){
  const block = CONFIG.KEYWORDS_BLOCK || [];
  return articles.filter(a=>{
    return !block.some(k=> (a.title + a.content).toLowerCase().includes(k));
  });
}