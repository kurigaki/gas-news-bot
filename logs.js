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

  // ALERT_WEBHOOK が設定されていれば Discord にも通知
  // discord.js の関数は使わず直接 fetch（循環呼び出し防止）
  try {
    if (typeof CONFIG !== "undefined" && CONFIG.ALERT_WEBHOOK) {
      UrlFetchApp.fetch(CONFIG.ALERT_WEBHOOK, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          content: `🚨 **[News Bot ERROR]** ${message}\n\`\`\`${String(detail).slice(0, 1000)}\`\`\``,
        }),
        muteHttpExceptions: true,
      });
    }
  } catch (e) {
    // アラート通知失敗はログのみ記録（再帰呼び出しを避けるため logError は使わない）
    sheet.appendRow([new Date(), "WARN", "Discord アラート通知失敗", e.message]);
  }
}
