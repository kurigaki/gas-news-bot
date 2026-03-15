function rankArticles(articles) {
  return articles.map(a => {
    a.score = computeTrendScore(a);
    return a;
  }).sort((a, b) => b.score - a.score);
}