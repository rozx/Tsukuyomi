export default {
  bookUi: {
    scraper: {
      invalidUrl: 'Not a valid {site} novel URL',
      contentMissing: 'Could not find the chapter body',
      ageGate: 'The site returned an age verification page; the novel could not be loaded',
      notFound: 'Novel page not found (404)',
      unknown: 'An unknown error occurred while loading the novel',
      kakuyomuNextDataMissing:
        'Could not find Kakuyomu data (__NEXT_DATA__ is missing). The page may not have fully loaded or its structure has changed. HTML length: {htmlLength}, script tags: {scriptTags}',
      kakuyomuParseFailed: 'Failed to parse Kakuyomu data',
      kakuyomuApolloMissing: 'Could not find Apollo State data',
      kakuyomuIdMissing: 'Could not find the novel ID',
      kakuyomuWorkMissing: 'Could not find the work data',
    },
    fetch: {
      electronApiMissing: 'The Electron API did not load correctly; check the preload script',
      emptyResponse: 'The response was empty',
      httpStatus: 'The site returned an error: {status}',
      notText: 'The page response is not parseable text',
      httpFailed: 'Failed to load the page: {status} {statusText}',
      networkFailed: 'Network connection failed; check your network settings',
      requestInvalid: 'Invalid request configuration: {detail}',
      unknown: 'An unknown error occurred while loading the page',
      blockedElectron: 'The site returned an anti-bot challenge page (Electron direct)',
      blockedProxy: 'The site returned an anti-bot challenge page ({url})',
      firecrawlQuotaKeyless:
        'The free Firecrawl quota (daily per-IP limit) is used up. You can set a Firecrawl key in Settings → API Keys',
      firecrawlQuota: 'The Firecrawl quota is used up. Check your quota in Settings → API Keys',
      firecrawlRateLimited: 'Too many Firecrawl requests; try again later',
      firecrawlTarget: 'The site returned an error: {status} (via Firecrawl)',
      firecrawlEmpty: 'Firecrawl returned empty content',
      firecrawlFailed: 'Firecrawl request failed: {status}',
      firecrawlFailedDetail: 'Firecrawl request failed: {status} {detail}',
      firecrawlCreditFailed: 'Quota lookup failed: {status}',
    },
  },
};
