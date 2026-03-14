function collectArticles(){
  let list=[];
  CONFIG.RSS_FEEDS.forEach(url=>{
    const xml = UrlFetchApp.fetch(url).getContentText();
    const doc = XmlService.parse(xml);
    const root = doc.getRootElement();
    const ns = root.getNamespace();

    let entries = root.getChildren("entry", ns);
    if(entries.length===0) entries = root.getChildren("item");

    entries.forEach(e=>{
      const title = e.getChildText("title", ns) || e.getChildText("title");
      let link="";
      const linkNode = e.getChild("link", ns);
      if(linkNode){
        link = linkNode.getAttribute("href") ? linkNode.getAttribute("href").getValue() : linkNode.getText();
      }
      const desc = e.getChildText("content", ns) || e.getChildText("description") || "";
      if(!title||!link) return;
      list.push({title:title,url:link,content:desc});
    });
  });
  return list;
}