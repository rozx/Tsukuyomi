# Design

## Context

- All page fetching funnels through `fetchScraperPage()` (`src/services/scraper/core/page-transport.ts`), which wraps `ProxyService.executeWithAutoSwitch()`. Callers: `BaseScraper.fetchPageSnapshot`, `import-extraction-service`, `book-sync/replay`. Electron uses `window.electronAPI.fetch` (Puppeteer-backed); the browser uses axios. (`ScraperService.fetchChaptersContent` also exists but has no callers.)
- **Electron currently uses the CORS proxy for page fetches.** Nothing turns `proxyEnabled` off on Electron (it defaults to true in `stores/settings.ts:48`, and the tab is hidden), and `fetchScraperPage` only passes `skipInternalProxy: electron`. So Puppeteer navigates to `cors.rozx.moe/?{url}`. Only novel18 opts out, via `shouldSkipExternalProxy()`.
- **Electron always reports status 200.** `fetchUrlViaPuppeteer` (`src-electron/electron-main.ts:648`) returns `status: 200` whatever the navigation returned, after a fixed 2s wait for stealth to solve challenges.
- **Book sync keeps going after per-chapter errors.** Both the update check and apply loops (`book-sync-service.ts:238-250, 329-335`) record `CONTENT_FETCH_FAILED` and move on; only recipe-invalid codes stop them.
- A CORS proxy is a GET URL template (`https://x/?{url}`). Firecrawl is `POST /v2/scrape` returning JSON `{ data: { rawHtml | markdown, metadata: { statusCode, url, title } } }`, so it can't be treated as another proxy template.
- `getProxiedUrlForAI()` (AI provider requests, covers, image upload) uses the default CORS proxy and is unaffected.
- `proxySiteMapping: Record<rootDomain, { enabled, proxies: string[] }>` is persisted and synced. `migrateProxySiteMapping()` keeps only `enabled` and `proxies`, which is why a new field on the entry would be stripped by older builds.
- Fetch concurrency: import batch runner uses 3 workers and aborts the whole batch on the first failure (`import-batch-runner.ts:55-60`). Book sync uses 3 workers that catch per-chapter errors (see above).
- `ToolRegistry.getAllTools()` includes `getWebSearchTools()` and is shared by the assistant (`getAssistantTools`) and by translate/polish/proofread (`getTranslationTools`, `getToolsExcludingTranslationManagement`). The import agent defines its own `search_web` (`import-tool-definitions.ts:331`), which calls `searchWeb()` directly via `ImportMetadataService.prepareSearch` and passes an abort signal.
- Verified 2026-09-24: keyless `POST /v2/scrape` returned 200 and full `rawHtml` for `syosetu.org/novel/375522/6.html` (607 paragraphs, `#honbun` present), while direct and `cors.rozx.moe` returned 403. Keyless `POST /v2/search` returned 200 with `data.web[{ url, title, description, position }]`. The API answers preflight with `access-control-allow-origin: *` and allows the `authorization` header. There's no CSP in the web or Electron builds that restricts `connect-src`.

## Goals / Non-Goals

**Goals:**
- One Firecrawl module shared by page fetching and AI tools, so there's one rate limiter and one set of error types.
- Keep `ScraperPageSnapshot` as the only thing scrapers see; no scraper parse code changes.
- Keep `ProxyService`'s public entry points (`getProxiedUrl`, `executeWithAutoSwitch`, `getProxiedUrlForAI`) so callers and the novel18 spec keep their names.

**Non-Goals:**
- Cleaning up legacy proxies in stored settings (user decision: no migration).
- Using Firecrawl for AI provider requests, covers, or image upload.
- Firecrawl crawl / map / batch endpoints.
- Removing the `extractHtmlFromJsonProxyResponse` handling for JSON-wrapping proxies (users may still have those in their lists).

## Decisions

### D1. New `src/services/firecrawl/` module, plain axios, no SDK
`firecrawl-client.ts` exposes `scrape(url, { format, onlyMainContent, headers, signal })`, `search(query, { limit, signal })`, `getCreditUsage(key)` and typed errors: `FirecrawlQuotaError` (402 or keyless daily limit), `FirecrawlRateLimitError`, `FirecrawlTargetError(status)`, `FirecrawlEmptyContentError`. It reads the key through `GlobalConfig` at call time.
*Why not `@mendable/firecrawl-js`:* it adds a dependency for three endpoints, its keyless support and browser bundling are unverified, and we need our own queue and error types anyway.

### D2. One app-wide queue
*(Superseded in part by D13 after archiving: no fixed per-minute window; 429 pauses the whole queue; default wait 20s.)*
A module-level limiter (concurrency 2, and a sliding window of about 15 requests per 60s, which stays under the free tier's 20/min) wraps every request. On 429 it waits `Retry-After` seconds (default 5s, max 60s) and retries up to 3 times. Aborted waiters leave the queue without sending. The limits are constants in one place so they can be tuned without touching callers. Each request sends `timeout: 60000` to Firecrawl and uses an axios timeout of 75s. That timer starts only when the request leaves the queue, so time spent queued doesn't count. The abort signal covers both the wait and the request.

**Quota latch.** After a `FirecrawlQuotaError`, a module-level latch `{ keyFingerprint, setAt }` makes every request fail immediately with no network call. It clears when the key fingerprint changes, when `getCreditUsage` reports `remainingCredits > 0`, or after 60 minutes. The latch also makes callers that don't stop on errors (such as book sync) fail quickly instead of each waiting out a 402.
*Alternative:* per-caller throttling. Rejected because concurrent imports and book sync would add up past the limit.

### D3. Keyless daily-limit detection
*(Superseded by D14 after archiving: detection now uses the body's `reason: "credits"`; the words keyless/free no longer count.)*
The keyless daily-limit response format isn't documented. Classify as `FirecrawlQuotaError` when there's no key and the response is 402, **or** a 429 whose error body mentions a daily/keyless limit. **Resolved in task 2.1.** The official error catalog (checked 2026-09-24) documents the body `{ success: false, error, details? }`, 402 as `"Payment Required: Insufficient credits"`, and generic 429s (`"Rate limit exceeded"`, `"Concurrency limit reached"`) with an optional `Retry-After`. The rate-limit page says only that exceeding a keyless daily cap "returns a 429". It has no specific message, and exhausting the live cap to capture one would use up the user's daily quota. So a keyless 429 counts as quota-exhausted when its `error` text matches `/daily|per day|keyless|free/i` **or** its `Retry-After` is over 120s. Any other keyless 429 gets the normal bounded retries and becomes `FirecrawlQuotaError` once they run out. Keyed 429s become `FirecrawlRateLimitError`. Fixtures are in `src/__tests__/firecrawl-fixtures.ts`.

### D4. Attempt chain lives in `ProxyService.executeWithAutoSwitch`
The function keeps its name and signature (plus an optional `firecrawl?: { headers }` passthrough) and is rewritten as an explicit chain:

```
resolvePlan(url, platform, settings) -> { firecrawlFirst: bool, primary: Attempt, allowFallback: bool }
  firecrawlFirst -> firecrawlFetch()                        (no primary)
  else primary() -> [transient? retry once after 1s]
               -> ok & !challenge          -> return
               -> blocked (incl. challenge) & allowFallback
                                           -> firecrawlFetch() -> maybePromoteMapping()
               -> otherwise                -> throw
```
`requestFn(proxiedUrl)` remains the primary transport callback. Firecrawl is a second callback supplied by `page-transport`, so `ProxyService` stays independent of the HTML snapshot shape. `resolvePlan` is a pure function that gets table-driven tests across platform × proxy on/off × mapping × fallback flag.
*Transient* means network error, timeout, 429, or 5xx. 403 and a challenge page are *blocked but not transient*, so they skip the retry and go straight to Firecrawl, since a same-proxy retry won't get past a block.

### D5. Challenge detection runs after a successful primary response
`isChallengePage(html, status)` is a pure function in `page-transport` with a small marker list: `<title>Just a moment...</title>`, `cf-chl-`/`challenge-platform`, `Attention Required! | Cloudflare`, `cf-browser-verification`. It requires a title or script marker, **not** body text, to avoid false positives. It throws a `BlockedResponseError` so the chain in D4 treats it like a 403. It gets fixture tests with a real syosetu chapter, a kakuyomu page, and a Cloudflare challenge sample.

### D6. `'firecrawl'` token in `proxies[]`
The constant `FIRECRAWL_MAPPING_TOKEN = 'firecrawl'` lives in `src/constants/proxy.ts`. `resolveExternalProxyUrl`, `getProxiesForSite` consumers and the mapping UI filter or label it. Promotion is a new store action, `promoteFirecrawlForSite(rootDomain)`, which moves or inserts at index 0. The old store action `addProxyForSite` stays for manual adds. Older Electron builds treat the token as a template; `electronAPI.fetch('firecrawl')` fails and they rotate on. An old web build would request the relative path `/firecrawl`, which a static host may answer with the SPA `index.html` (200). That makes a parse error rather than a rotation, but web clients load the latest build on reload, so the window is small. Either way the token itself is preserved when an old build saves settings.

### D7. Settings shape and plumbing
There are three new optional `AppSettings` fields. Defaults go in `DEFAULT_SETTINGS`, and `normalizeLoadedSettings` fills in missing ones. They must be added to `copyOptionalAppSettingsFields` in `settings-parsers.ts`, because its comment warns that fields missing from that list are silently lost on export/import and sync. `GlobalConfig` gets `getFirecrawlApiKey()`, `getFirecrawlFallbackEnabled()` and `getFirecrawlAutoAddMapping()`. `proxyAutoSwitch` and `proxyAutoAddMapping` stay in the model for compatibility but are no longer read by the fetch path. The new `firecrawlAutoAddMapping` replaces `proxyAutoAddMapping`; old values aren't carried over, and the default is true.

### D8. Settings UI
- `ApiKeysSettingsTab.vue`: add a Firecrawl card. The save → validate → persist logic goes in a small composable (`useFirecrawlKeySettings`) so it can be tested apart from the template.
- New `SiteMappingSettingsTab.vue` with its own composable `useSiteMappingSettings`. The mapping-related half of `useProxySettings` (518 lines) moves there. `SiteMappingEditDialog` moves along with it and gets a "Firecrawl" option.
- `useSettingsPage.ts`: new tab list. Web: AI 模型, 代理设置, **网站映射**, API Keys, 同步设置, 本地嵌入, 爬虫设置, 导入/导出, 关于. Electron: the same list without 代理设置. The four saved-index ↔ tab-value tables are rebuilt from the tab list, keeping the saved index = logical tab identity, and a test covers every old saved index on both platforms.
- These are leaf settings panels rendered inside the existing settings-page variants, not pages or layouts, so the dispatcher pattern doesn't apply.

### D9. Stopping a batch on quota errors
*(Corrected during implementation: the import batch runner does **not** stop on a normal failure. `prepareExtraction` turns per-chapter fetch errors into failed items, as the test `一章失败不丢其他章节` shows.)*
- Import batch: `errorResult` maps `FirecrawlQuotaError` to item error code `FIRECRAWL_QUOTA`. `runChapterBatch` workers stop taking new items once a prepared result carries that code. Remaining items stay `pending`, so a later `run_chapter_batch` picks them up, and the summary's `issues` shows the quota message to the agent.
- Book sync: `replay.fetchChapter` maps `FirecrawlQuotaError` to failure code `FIRECRAWL_QUOTA` (not in `invalidRecipeCodes`, so the recipe stays valid). The update-check loop records the failure and aborts its controller, leaving the remaining entries unchecked. The apply loop stops taking new entries, writes the chapters it already fetched, and marks the selected entries it didn't fetch as `FIRECRAWL_QUOTA` failures, which gives a `partial` result. It doesn't throw, because throwing would drop chapters that were already fetched.
- The quota latch (D2) is the backstop for any other caller that loops through errors.
- `ScraperService.fetchChaptersContent` has no callers and gets no changes. Its removal is tracked separately as dead code.

### D10. AI tools
`web-search-tools.ts` wraps both tools as `tryTavily() -> on fallback-eligible error or no key -> firecrawl`, and `searchWeb(query, signal)` passes the signal through to both providers. Because `ImportMetadataService.prepareSearch` already calls `searchWeb`, the import agent picks up the same order with no further wiring.
Availability depends on context: `getWebSearchTools({ allowFirecrawlOnly })`. `getAssistantTools` (and its variants) pass `true` (`tavilyKey || firecrawlFallbackEnabled`). `getTranslationTools`, `getToolsExcludingTranslationManagement` and `getSingleParagraphPolishTools` pass `false` (Tavily key only, same as today). Since `getAllTools` is shared, the flag is threaded through it rather than filtered afterwards. Firecrawl `fetch_webpage` uses the `markdown` format with `onlyMainContent: true` and `maxAge: 0`. `text` is the markdown with the existing 50,000-character cap, and `title` comes from `metadata.title`. Tool results gain a `provider: 'tavily' | 'firecrawl'` field. Tool descriptions in the prompts no longer say a Tavily key is required.

### D11. Electron: direct fetch and real status
- `resolvePlan` never produces a CORS attempt when `isElectron()`, whatever `proxyEnabled` says. This is the one place the platform rule lives, so `getProxiedUrl` and `executeWithAutoSwitch` inherit it. `getProxiedUrlForAI` already skips the proxy on Electron.
- `fetchUrlViaPuppeteer` listens for `page.on('response')`, keeps the status of the **last main-frame document response** seen before `page.content()` is captured, and returns it in `ElectronFetchResponse.status`. A challenge that stealth resolves into a 200 page reports 200. `fetchViaElectron` already throws on `status >= 400`, and that error now carries the status so the chain can classify it, instead of only a message string.
- *Alternative:* keep the CORS proxy on Electron. Rejected (user decision), because Electron users can't see or change it, it contradicts the "由系统代理处理" intent, and Firecrawl now covers sites that only worked through `cors.rozx.moe`.

## Post-archive changes (2026-09-24/25)

These were made after the change was archived, driven by testing on a real 36-chapter syosetu.org book in the preview. The main specs (`book-sync-service`, `firecrawl-client`) were updated directly to match.

### D12. Quick check reads only the catalog
The quick check used to fetch every imported chapter whose site date looked newer. After the syosetu TOC fix reported revision (改稿) dates instead of publish dates, and the author had revised the whole book, that meant 33 of 36 chapters were fetched on every open, taking minutes. The quick check now replays only the catalog. It adds `BookSyncChangeset.dateNewer` (dated newer, not yet compared) next to `dateUnchanged`, and chapter content is compared only when the user runs 逐章比对正文 (deep check). This also fits the existing rule that the quick check must not bulk-fetch imported chapters without the user knowing.

### D13. Rate limiting without a fixed per-minute cap
Firecrawl's `/scrape` limits are 10/min on Free, 100 on Hobby, 500 on Standard and 5000 on Growth. A fixed window at the Free rate (first 15, then 10) made a 100-chapter deep check take 10+ minutes even on paid keys, and looked stuck at each minute boundary. The limiter now keeps only concurrency 2 (the Free plan's concurrent browsers). `RequestLimiter.pauseFor(ms)` pauses the whole queue on a 429, using the `Retry-After` header, else the body's `retry_after_seconds`, else 20s, capped at 60s. So 3 retries cover a one-minute window, and parallel requests don't all 429 again. `FirecrawlClient.pauseRemainingMs()` feeds the deep-check line 「等待 Firecrawl 限速，约 N 秒」.

### D14. Keyless daily-limit detection from the real response
Captured on 2026-09-24: `429 {"error":"You've hit Firecrawl's keyless free tier rate limit. …","reason":"credits","retry_after_seconds":81741}`, with no `Retry-After` header. The `/keyless|free/` keywords from D3 would also match short rate-limit messages, so detection now uses `reason === "credits"`, an explicit daily/per-day message, or a wait over 120s. The quota latch is `{ key, until }` and lasts for the given wait (about 22.7 hours here), or 60 minutes if none is given. This fixture replaced the made-up one. After review, a plain keyless 429 that exhausts its retries is a `FirecrawlRateLimitError`, not a quota error; only the explicit daily-limit signals above lock quota.

### D15. Confirmed-unchanged chapters record the site date
Only apply wrote `lastUpdated`, so chapters compared as unchanged kept looking newer forever. After a deep check, `recordConfirmedDates()` writes the catalog date onto checked, unchanged, dated-newer chapters. It goes through `writeConfirmedDates` via `patchChapters` / `patchBookRecord`, the shared transaction helper that also backs `writeSkipped`: BookExecutionGuard commit, revision bump, `notifySyncCommit`, then `refreshAfterCommit()`, keeping earlier failures. It's skipped when the book is occupied, and a failure never affects the check result.

### D16. Linking manually added chapters
Chapters added by hand have no `webUrl`, so they showed up as new chapters and applying would have duplicated them. `linkManualChapters()` (pure, in `changes.ts`) matches in two passes. First by exact title after NFKC and whitespace normalization, when the title is unique among unclaimed entries and among unlinked chapters. Then by position: a run of unlinked chapters between two linked neighbours whose count equals the unclaimed entries between them is paired in order. Anything else stays unlinked, with no guessing. `prepare()` applies the links in memory before `classify()` and writes them back with `writeChapterUrls` when the book isn't occupied. On the real book, 8 of 9 matched by title and 「骑士」 → #29 「竜狩りの騎士」 by position.

### D17. Blank lines are not revisions
The new syosetu markup puts a blank paragraph between lines. `sameChapterText` compares text with blank lines removed, and the 增/删 counts leave out blank-only inserts and removals.

### D18. Cross-session chapter cache
`remote-chapter-cache.ts` is a 30-minute in-memory cache keyed by the recipe's extraction rules, the URL and the catalog's `lastUpdated` (so a newer remote version is never served from cache). It's shared across check sessions, so rechecking, deep check followed by apply, and previews reuse chapter text without spending Firecrawl credits. The global test setup clears it before each test. Firecrawl's own cache (`maxAge`) stays off, because cached hits still cost a credit and would hide recent revisions.

### D19. Settings fixes
`useFirecrawlKeySettings` watches the stored key, so the input fills in after the non-blocking settings load. Previously an empty input with 保存 enabled could delete the saved key. 检查额度 is now an outlined button (the secondary style looked disabled). The 网站映射 table has a delete action (`removeSiteMapping`).

## Risks / Trade-offs

- [Electron sites that only worked through `cors.rozx.moe` (e.g. region-blocked from the user's IP)] → the Firecrawl fallback covers them. The status and challenge classification in D11 makes sure blocks actually trigger it. Verify kakuyomu and ncode on a desktop build (task 6.2).
- [It's unverified whether Firecrawl `rawHtml` keeps inline JSON/scripts that some parsers rely on (e.g. kakuyomu)] → the parser fixture test in task 3.6 uses a real Firecrawl `rawHtml` capture per supported site.

- [Keyless limits are unpublished and may change] → quota errors are typed and stop batches cleanly, the card text points users to a key, and the limits are constants.
- [Firecrawl sees every URL on a mapped site] → toggle text discloses it, the master switch turns it off, and mappings are visible and editable.
- [Stealth or JS-heavy sites may still fail through Firecrawl] → it fails with a clear error. `proxy: 'auto'` (the Firecrawl default) already escalates on its side.
- [Challenge-marker false positives would spend credits] → markers are title/script only and there are fixture tests on real novel pages.
- [Older synced builds make a failed request for `firecrawl`-first mappings] → accepted (user decision). It self-heals once the device updates.
- [Rate window of about 15/min makes large Firecrawl imports slow (300 chapters ≈ 20 min)] → accepted. Correctness over speed, and the limits can be tuned later per key tier.
- [`getProxiesForSite` consumers outside the fetch path might treat the token as a URL] → a grep-driven task plus the token regression test in the spec.

## Migration Plan

- No data migration. New fields are filled with defaults on load.
- Rollback: reverting the change leaves `firecrawl` tokens in mappings. The previous code treats them as a failing template and rotates past them. The extra settings fields are ignored.
- Help docs (proxy settings / API Keys) and release notes updated in the same change.

## Open Questions

- The exact keyless daily-limit response body (D3). This only affects the matcher, and there's a safe default.
- Whether a paid key tier should raise the rate window automatically, for example by reading plan credits. This can be tuned later without spec changes.
