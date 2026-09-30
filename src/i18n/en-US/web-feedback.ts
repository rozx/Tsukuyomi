export default {
  aiWebFeedback: {
    httpError: 'Firecrawl returned HTTP {status}',
    httpMessage: 'Firecrawl request failed (HTTP {status}): {detail}',
    queryRequired: 'A search query is required',
    urlRequired: 'A URL is required',
    urlInvalid: 'Invalid URL format',
    urlParse: 'Unable to parse URL: {url}',
    quota: 'Firecrawl quota exhausted',
    quotaKeyless:
      'The daily Firecrawl free quota for this IP is exhausted. Configure a Firecrawl or Tavily API key in Settings → API Keys and retry.',
    quotaKey: 'Firecrawl quota is exhausted. Check your quota in Settings → API Keys.',
    rate: 'Too many Firecrawl requests',
    retryLater: 'Too many Firecrawl requests. Retry later.',
    targetError: 'The target webpage returned error {status}',
    targetMessage: 'The target webpage returned error {status} and cannot be read.',
    empty: 'Firecrawl returned empty content',
    failed: 'Firecrawl request failed: {detail}',
    keyInvalid: 'Invalid Tavily API key',
    checkSearchKey:
      'Check your Tavily API key in settings. You can obtain a valid key at https://tavily.com/.',
    checkFetchKey: 'Check your Tavily API key in settings.',
    searchFailed:
      'Web search is unavailable: {detail}. Use the AI model’s existing knowledge to answer the question about “{query}”.',
    searchMissing: 'Web search is not configured',
    searchConfigure:
      'Configure a Tavily API key or enable Firecrawl fallback in Settings → API Keys.',
    extractEmpty: 'Unable to extract webpage content',
    extractMessage:
      'Tavily could not extract content from {url}. The webpage may be unavailable or empty.',
    fetchFailed: 'Unable to access webpage {url}: {detail}.',
    fetchMissing: 'Webpage reading is not configured',
    fetchConfigure:
      'Configure a Tavily API key or enable Firecrawl fallback in Settings → API Keys to read webpages.',
  },
};
