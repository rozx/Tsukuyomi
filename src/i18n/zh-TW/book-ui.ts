export default {
  bookUi: {
    scraper: {
      invalidUrl: '無效的 {site} 小說網址',
      contentMissing: '找不到章節正文內容',
      ageGate: '目標網站回傳了年齡確認頁，未能取得小說內容',
      notFound: '小說頁面不存在 (404)',
      unknown: '取得小說資訊時發生未知錯誤',
      kakuyomuNextDataMissing:
        '找不到 Kakuyomu 資料（__NEXT_DATA__ 不存在）。頁面可能未完全載入或結構已改變。HTML 長度：{htmlLength}，指令碼標籤數：{scriptTags}',
      kakuyomuParseFailed: '解析 Kakuyomu 資料失敗',
      kakuyomuApolloMissing: '找不到 Apollo State 資料',
      kakuyomuIdMissing: '找不到小說 ID',
      kakuyomuWorkMissing: '找不到作品資料',
    },
    fetch: {
      electronApiMissing: 'Electron API 未正確載入，請檢查 preload 指令碼',
      emptyResponse: '回傳的內容為空',
      httpStatus: '目標網站回傳錯誤：{status}',
      notText: '頁面回應不是可解析的文字',
      httpFailed: '取得頁面失敗：{status} {statusText}',
      networkFailed: '網路連線失敗，請檢查網路設定',
      requestInvalid: '請求設定錯誤：{detail}',
      unknown: '取得頁面時發生未知錯誤',
      blockedElectron: '目標網站回傳了反爬蟲驗證頁（Electron 直連）',
      blockedProxy: '目標網站回傳了反爬蟲驗證頁（{url}）',
      firecrawlQuotaKeyless:
        'Firecrawl 免費額度（按 IP 每日限額）已用盡，可在設定 → API Keys 設定 Firecrawl Key',
      firecrawlQuota: 'Firecrawl 額度已用盡，請在設定 → API Keys 中檢查額度',
      firecrawlRateLimited: 'Firecrawl 請求過於頻繁，請稍後重試',
      firecrawlTarget: '目標網站回傳錯誤：{status}（經 Firecrawl）',
      firecrawlEmpty: 'Firecrawl 回傳的內容為空',
      firecrawlFailed: 'Firecrawl 請求失敗：{status}',
      firecrawlFailedDetail: 'Firecrawl 請求失敗：{status} {detail}',
      firecrawlCreditFailed: '額度查詢失敗：{status}',
    },
  },
};
