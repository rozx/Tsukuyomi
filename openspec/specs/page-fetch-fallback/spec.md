# page-fetch-fallback Specification

## Purpose

定义爬虫、导入与书籍同步抓取网页时的尝试链：先走站点映射或默认通道，被拦截时回退到 Firecrawl，并把只有 Firecrawl 可用的站点自动记入网站映射；同时规定「被拦截」的判定、`'firecrawl'` 映射令牌的存储，以及 Web 与 Electron 的一致行为。

## Requirements

### Requirement: Attempt chain

Page fetches (scraper index / catalog / chapter pages, import extraction, book-sync replay) SHALL follow this order for the target URL's root domain:

1. If an enabled site mapping exists whose first entry is the `firecrawl` token and the Firecrawl fallback is enabled, fetch via Firecrawl directly.
2. Otherwise make the primary attempt: in Electron, a direct request; on the web with proxy on, the enabled mapping's CORS proxies in list order, else the default CORS proxy; on the web with proxy off, the internal `/api/` path or a direct request.
3. On a transient failure of the primary attempt, retry the same attempt once after about one second.
4. If the attempt is classified as blocked and the Firecrawl fallback is enabled, fetch via Firecrawl.

The system SHALL NOT try CORS proxies from the global proxy list that are neither the default nor in the site's mapping.

#### Scenario: Default proxy succeeds

- **WHEN** on the web with proxy enabled, no mapping for `kakuyomu.jp`, and the default CORS proxy returns the page
- **THEN** exactly one request SHALL be made, through the default CORS proxy
- **AND** Firecrawl SHALL NOT be called

#### Scenario: Blocked then Firecrawl

- **WHEN** the default CORS proxy returns 403 for `https://syosetu.org/novel/375522/6.html` and the Firecrawl fallback is enabled
- **THEN** the page SHALL be fetched via Firecrawl and returned to the scraper

#### Scenario: Unmapped custom proxies are not tried

- **WHEN** the global proxy list contains `A` (default) and `B`, there is no mapping, and `A` fails with 503 twice
- **THEN** `B` SHALL NOT be requested

#### Scenario: Firecrawl mapping skips the primary attempt

- **WHEN** the mapping for `syosetu.org` is `{ enabled: true, proxies: ["firecrawl", "https://cors.rozx.moe/?{url}"] }` and the fallback is enabled
- **THEN** the fetch SHALL go to Firecrawl without first requesting the CORS proxy

#### Scenario: Fallback disabled

- **WHEN** the Firecrawl fallback is disabled and the default CORS proxy returns 403
- **THEN** the fetch SHALL fail with the 403 error and Firecrawl SHALL NOT be called

#### Scenario: Firecrawl mapping while fallback disabled

- **WHEN** the mapping for `syosetu.org` is `["firecrawl", "https://cors.rozx.moe/?{url}"]` and the fallback is disabled
- **THEN** the `firecrawl` entry SHALL be skipped and the primary attempt SHALL use `https://cors.rozx.moe/?{url}`

#### Scenario: Firecrawl-mapped fetch fails

- **WHEN** a domain is mapped to `firecrawl` first and the Firecrawl scrape fails
- **THEN** the fetch SHALL fail with the Firecrawl error without trying the remaining CORS entries

### Requirement: Blocked classification

An attempt SHALL be classified as blocked when it fails with a network error, a CORS failure, a timeout, HTTP 403, HTTP 429, or HTTP 5xx, or when it returns 200 with a body recognized as an anti-bot challenge page. HTTP 404, 410, and other 4xx responses SHALL NOT be classified as blocked and SHALL NOT trigger the Firecrawl fallback. Challenge-page recognition SHALL use a conservative marker set (e.g. Cloudflare "Just a moment...", `cf-chl` challenge markers, "Attention Required") so that ordinary novel pages are never misclassified.

#### Scenario: 404 does not spend credits

- **WHEN** the primary attempt returns 404
- **THEN** the fetch SHALL fail with the 404 error and Firecrawl SHALL NOT be called

#### Scenario: Challenge page

- **WHEN** the primary attempt returns 200 with an HTML body titled "Just a moment..." containing a `cf-chl` challenge marker
- **THEN** the attempt SHALL be classified as blocked and the Firecrawl fallback SHALL run

#### Scenario: Ordinary page not misclassified

- **WHEN** the primary attempt returns a normal syosetu chapter page that mentions the word "challenge" in its body text
- **THEN** the attempt SHALL NOT be classified as blocked

### Requirement: Auto-add Firecrawl mapping

When a Firecrawl fallback succeeds after a blocked primary attempt and the auto-add mapping setting is enabled, the system SHALL record the `firecrawl` token for the URL's root domain, silently (no toast). If the domain has no mapping, it SHALL create `{ enabled: true, proxies: ["firecrawl"] }`. If it has one, it SHALL move or insert `firecrawl` at index 0 and keep the other entries in their existing order. A successful CORS attempt SHALL NOT add or change any mapping.

#### Scenario: New domain

- **WHEN** `syosetu.org` has no mapping and a fallback succeeds
- **THEN** the mapping SHALL become `{ enabled: true, proxies: ["firecrawl"] }`

#### Scenario: Promote in existing mapping

- **WHEN** `kakuyomu.jp` maps to `[corslol, x2u, codetabs]`, all fail as blocked, and Firecrawl succeeds
- **THEN** the mapping SHALL become `["firecrawl", corslol, x2u, codetabs]`

#### Scenario: Auto-add disabled

- **WHEN** auto-add mapping is disabled and a fallback succeeds
- **THEN** no mapping SHALL be created or changed

### Requirement: Firecrawl token is never used as a URL template

Site mappings SHALL store Firecrawl as the literal string `firecrawl` inside `proxies[]`. Every code path that turns a mapping entry into a CORS proxy URL SHALL skip this token, and the token SHALL be preserved unchanged when settings are loaded, saved, and synced.

#### Scenario: Proxied URL resolution skips token

- **WHEN** the mapping for `syosetu.org` is `["firecrawl", "https://cors.rozx.moe/?{url}"]` and a proxied URL is resolved for a `syosetu.org` page
- **THEN** the resolved URL SHALL use `https://cors.rozx.moe/?{url}` and SHALL NOT contain the string `firecrawl`

#### Scenario: Token survives round-trip

- **WHEN** settings containing a `firecrawl` mapping entry are saved, reloaded, and parsed from synced data
- **THEN** the entry SHALL still be `firecrawl` at the same position

### Requirement: Cross-platform and proxy-switch independence

The Firecrawl fallback and `firecrawl` mapping entries SHALL apply on the web regardless of whether the global proxy is enabled, and in Electron. CORS proxy entries in a mapping, and the default CORS proxy, SHALL take effect only on the web while the global proxy is enabled. In Electron, page fetches SHALL NOT use any external CORS proxy regardless of the stored `proxyEnabled` value (a behavior change: previously Electron page fetches were wrapped with the default CORS proxy); the primary attempt SHALL be a direct request.

#### Scenario: Electron direct fetch blocked

- **WHEN** in Electron a direct fetch of a page returns 403 and the fallback is enabled
- **THEN** the page SHALL be fetched via Firecrawl

#### Scenario: Web with proxy disabled

- **WHEN** on the web with the global proxy disabled, the internal or direct request fails with a CORS error, and the fallback is enabled
- **THEN** the page SHALL be fetched via Firecrawl

#### Scenario: Electron ignores CORS mapping entries

- **WHEN** in Electron the mapping for a domain is `["https://cors.rozx.moe/?{url}"]`
- **THEN** the primary attempt SHALL be a direct request, not a CORS-proxied one

#### Scenario: Electron ignores stored proxyEnabled

- **WHEN** in Electron stored settings have `proxyEnabled: true` and default proxy `https://cors.rozx.moe/?{url}`, and a kakuyomu page is fetched
- **THEN** the Electron fetch SHALL navigate to the original kakuyomu URL

### Requirement: Electron fetch reports the real HTTP status

The Electron page fetch SHALL report the HTTP status of the last main-frame document response observed before content is captured (so a challenge that the browser resolves into a 200 page reports 200, while a persistent 403 reports 403), instead of always reporting 200. The renderer SHALL classify Electron results with the same blocked rules as other transports.

#### Scenario: Persistent 403

- **WHEN** the Electron fetch of a page ends on a 403 main-frame response
- **THEN** the fetch SHALL report status 403 and the attempt SHALL be classified as blocked

#### Scenario: Challenge resolved in the browser

- **WHEN** the first main-frame response is 403 with a challenge and the browser then navigates to a 200 novel page before capture
- **THEN** the fetch SHALL report status 200 and return the novel page

#### Scenario: Missing page

- **WHEN** the Electron fetch ends on a 404 main-frame response
- **THEN** the fetch SHALL fail as not found and Firecrawl SHALL NOT be called

### Requirement: Auto-switch is retired

The `proxyAutoSwitch` setting SHALL no longer affect fetch behavior. Existing stored values SHALL be tolerated when loading and SHALL NOT cause errors, and the setting SHALL NOT be shown in the UI.

#### Scenario: Stored autoSwitch true

- **WHEN** loaded settings contain `proxyAutoSwitch: true` and the default proxy fails with 503
- **THEN** the attempt chain SHALL be exactly as specified above, with no rotation through the global proxy list

### Requirement: Fetch result provenance

A page returned via Firecrawl SHALL be delivered to scrapers in the same snapshot shape as other transports, with the original URL as the request URL, a transport indicator identifying Firecrawl, the target status code, and the final URL reported by Firecrawl when it differs from the request URL.

#### Scenario: Scraper parses Firecrawl HTML

- **WHEN** the syosetu.org chapter is fetched via Firecrawl
- **THEN** the syosetu scraper SHALL parse the chapter body from the returned HTML exactly as it would from a direct response
