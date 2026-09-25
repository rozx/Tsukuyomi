# Spec Delta

## MODIFIED Requirements

### Requirement: Novel18 跳过外部 CORS 代理

`Novel18SyosetuScraper` MUST return `true` from `shouldSkipExternalProxy()` in Electron so that Electron fetches SHALL NOT use external CORS proxy URLs (e.g. `cors.rozx.moe/?{url}`). In Web SPA it MUST return `false` so the browser can use the configured external proxy. (Since `page-fetch-fallback`, Electron page fetches for all scrapers skip external CORS proxies; the hook remains for the Web SPA distinction.)

#### Scenario: Electron 下全局外部代理已启用

- **当** 用户在设置中启用了全局外部 CORS 代理
- **且** `Novel18SyosetuScraper` 在 Electron 中抓取 novel18.syosetu.com URL
- **则** `ProxyService` 不得将请求 URL 包装为外部 CORS 代理 URL
- **且** Electron 抓取必须使用原始 novel18.syosetu.com URL

#### Scenario: 其他爬虫行为不变

- **当** `NcodeSyosetuScraper` 或 `KakuyomuScraper` 在 Web SPA 中、全局外部代理启用时抓取 URL
- **则** 首次尝试必须经外部 CORS 代理（默认代理或站点映射），与本次变更前一致
- **且** 在 Electron 中，这些爬虫必须直连原始 URL（见 `page-fetch-fallback`）

### Requirement: ProxyService 支持 skipExternalProxy 选项

`ProxyService.getProxiedUrl` and `ProxyService.executeWithAutoSwitch` MUST accept an optional `skipExternalProxy` parameter. When `skipExternalProxy` is `true`, URLs MUST NOT be wrapped as external CORS proxy URLs. `skipExternalProxy` only excludes CORS proxies: the Firecrawl fallback and `firecrawl` site-mapping entries (see `page-fetch-fallback`) MUST still apply, and the site's extra request headers MUST be forwarded to Firecrawl.

#### Scenario: 启用代理且 skipExternalProxy 为 true

- **当** 在全局代理已启用的情况下，以 `skipExternalProxy: true` 调用 `getProxiedUrl`
- **则** 返回的 URL 不得为 `cors.rozx.moe`（或其他外部 CORS 代理）包装后的 URL
- **且** 在 Electron 且跳过内部代理时，返回的 URL 必须为原始目标 URL

#### Scenario: executeWithAutoSwitch 不轮换外部代理

- **当** 在全局代理已启用的情况下，以 `skipExternalProxy: true` 调用 `executeWithAutoSwitch`
- **则** 任何一次尝试都不得使用外部 CORS 代理 URL
- **且** 首次尝试必须使用 `getProxiedUrl({ skipExternalProxy: true })` 的结果

#### Scenario: skipExternalProxy 下被拦截仍可回退 Firecrawl

- **当** 以 `skipExternalProxy: true` 抓取的首次尝试被判定为被拦截，且 Firecrawl 回退已启用
- **则** 必须经 Firecrawl 抓取该页面

## ADDED Requirements

### Requirement: 经 Firecrawl 抓取 novel18 时转发年龄验证 Cookie

When a novel18.syosetu.com page is fetched via Firecrawl (fallback or `firecrawl` mapping), the request MUST pass `Cookie: over18=yes` through Firecrawl's request headers option, and the returned HTML MUST go through the same age-verification-page check as any other transport.

#### Scenario: Firecrawl 请求携带 Cookie

- **当** novel18 章节页经 Firecrawl 抓取
- **则** Firecrawl scrape 请求体的 `headers` 必须包含 `{ "Cookie": "over18=yes" }`

#### Scenario: Firecrawl 返回年龄确认页

- **当** Firecrawl 返回的 HTML 同时包含标题 `年齢確認` 与年龄确认入口 `#yes18`
- **则** `fetchNovel` 必须返回 `success: false`，错误信息说明目标网站返回了年龄确认页
