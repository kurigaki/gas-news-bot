function logInfo(message, detail = "") {
  const sheet = getSheet("logs");
  sheet.appendRow([new Date(), "INFO", message, detail]);
}

function logWarn(message, detail = "") {
  const sheet = getSheet("logs");
  sheet.appendRow([new Date(), "WARN", message, detail]);
}

function logError(message, detail = "") {
  const sheet = getSheet("logs");
  sheet.appendRow([new Date(), "ERROR", message, detail]);
}
