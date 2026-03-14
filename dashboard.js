function updateDashboard(collected, posted, highRelevance = null, regular = null, errors = null) {
  const sheet = getSheet("dashboard");
  const dateStr = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");
  const lastRow = sheet.getLastRow();
  let row;
  if (lastRow > 1 && sheet.getRange(lastRow, 1).getValue() === dateStr) {
    row = lastRow;
  } else {
    sheet.appendRow([dateStr, 0, 0, 0, 0, 0]);
    row = sheet.getLastRow();
  }
  const getPrev = (col) => sheet.getRange(row, col).getValue() || 0;
  sheet.getRange(row, 2).setValue(collected);
  sheet.getRange(row, 3).setValue(posted);
  sheet.getRange(row, 4).setValue(highRelevance !== null ? highRelevance : getPrev(4));
  sheet.getRange(row, 5).setValue(regular !== null ? regular : getPrev(5));
  sheet.getRange(row, 6).setValue(errors !== null ? errors : getPrev(6));
}
