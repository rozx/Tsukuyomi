export default {
  aiWebFeedback: {
    httpError: 'Firecrawl 回傳 HTTP {status}',
    httpMessage: 'Firecrawl 請求失敗 (HTTP {status}): {detail}',
    queryRequired: '搜尋查詢不能為空',
    urlRequired: 'URL 不能為空',
    urlInvalid: 'URL 格式無效',
    urlParse: '無法解析 URL: {url}',
    quota: 'Firecrawl 額度已用盡',
    quotaKeyless:
      'Firecrawl 免費額度（依 IP 每日限額）已用盡。可在設定 → API Keys 設定 Firecrawl 或 Tavily API Key 後重試。',
    quotaKey: 'Firecrawl 額度已用盡，請在設定 → API Keys 檢查額度。',
    rate: 'Firecrawl 請求過於頻繁',
    retryLater: 'Firecrawl 請求過於頻繁，請稍後再試。',
    targetError: '目標網頁回傳錯誤 {status}',
    targetMessage: '目標網頁回傳錯誤 {status}，無法讀取該網頁。',
    empty: 'Firecrawl 回傳的內容為空',
    failed: 'Firecrawl 請求失敗: {detail}',
    keyInvalid: 'Tavily API Key 無效',
    checkSearchKey:
      '請檢查設定的 Tavily API Key 是否正確。可在 https://tavily.com/ 取得有效的 API Key。',
    checkFetchKey: '請檢查設定的 Tavily API Key 是否正確。',
    searchFailed:
      '網路搜尋暫時無法使用: {detail}。建議使用 AI 模型的內建知識回答「{query}」的問題。',
    searchMissing: '尚未設定網路搜尋',
    searchConfigure:
      '請在設定 → API Keys 設定 Tavily API Key，或啟用 Firecrawl 備援以使用網路搜尋。',
    extractEmpty: '無法擷取網頁內容',
    extractMessage: 'Tavily 無法擷取網頁 {url} 的內容。網頁可能無法存取或內容為空。',
    fetchFailed: '無法存取網頁 {url}: {detail}。',
    fetchMissing: '尚未設定網頁讀取',
    fetchConfigure: '請在設定 → API Keys 設定 Tavily API Key，或啟用 Firecrawl 備援以讀取網頁。',
  },
};
