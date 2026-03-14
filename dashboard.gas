function updateDashboard(collected, posted, aiArticles=null, devArticles=null, errors=null){
  const sheet = getSheet("dashboard");
  const dateStr = Utilities.formatDate(new Date(),"Asia/Tokyo","yyyy/MM/dd");
  const lastRow = sheet.getLastRow();
  let row;
  if(lastRow>1 && sheet.getRange(lastRow,1).getValue()===dateStr){
    row = lastRow;
  } else {
    sheet.appendRow([dateStr,0,0,0,0,0]);
    row = sheet.getLastRow();
  }
  const getPrev=(col,defaultVal=0)=>sheet.getRange(row,col).getValue()||defaultVal;
  sheet.getRange(row,2).setValue(collected);
  sheet.getRange(row,3).setValue(posted);
  sheet.getRange(row,4).setValue(aiArticles!==null?aiArticles:getPrev(4));
  sheet.getRange(row,5).setValue(devArticles!==null?devArticles:getPrev(5));
  sheet.getRange(row,6).setValue(errors!==null?errors:getPrev(6));
}