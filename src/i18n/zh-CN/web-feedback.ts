export default {
  aiWebFeedback: {
    httpError: 'Firecrawl 返回 HTTP {status}',
    httpMessage: 'Firecrawl 请求失败 (HTTP {status}): {detail}',
    queryRequired: '搜索查询不能为空',
    urlRequired: 'URL 不能为空',
    urlInvalid: '无效的 URL 格式',
    urlParse: '无法解析 URL: {url}',
    quota: 'Firecrawl 额度已用尽',
    quotaKeyless:
      'Firecrawl 免费额度（按 IP 每日限额）已用尽。可在设置 → API Keys 中配置 Firecrawl 或 Tavily API Key 后重试。',
    quotaKey: 'Firecrawl 额度已用尽，请在设置 → API Keys 中检查额度。',
    rate: 'Firecrawl 请求过于频繁',
    retryLater: 'Firecrawl 请求过于频繁，请稍后再试。',
    targetError: '目标网页返回错误 {status}',
    targetMessage: '目标网页返回错误 {status}，无法读取该网页。',
    empty: 'Firecrawl 返回的内容为空',
    failed: 'Firecrawl 请求失败: {detail}',
    keyInvalid: 'Tavily API Key 无效',
    checkSearchKey:
      '请检查设置的 Tavily API Key 是否正确。您可以在 https://tavily.com/ 获取有效的 API Key。',
    checkFetchKey: '请检查设置的 Tavily API Key 是否正确。',
    searchFailed:
      '网络搜索暂时不可用: {detail}。建议使用 AI 模型的内置知识库来回答关于「{query}」的问题。',
    searchMissing: '未配置网络搜索',
    searchConfigure:
      '请在设置 → API Keys 中配置 Tavily API Key，或启用 Firecrawl 回退以使用网络搜索功能。',
    extractEmpty: '无法提取网页内容',
    extractMessage: 'Tavily 无法提取网页 {url} 的内容。该网页可能无法访问或内容为空。',
    fetchFailed: '无法访问网页 {url}: {detail}。',
    fetchMissing: '未配置网页读取',
    fetchConfigure:
      '请在设置 → API Keys 中配置 Tavily API Key，或启用 Firecrawl 回退以使用网页读取功能。',
  },
};
