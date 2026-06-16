# novel18-age-verification Specification

## Purpose

为 Electron 桌面端抓取 `novel18.syosetu.com`（小説家になろう R18 分站）提供年龄验证 Cookie 处理、站点级抓取钩子与代理跳过机制，使用户可成功导入 R18 小说。Web SPA 路径不在本规范范围内。

## Requirements

### Requirement: Novel18 爬虫附加年龄验证 Cookie

When the target URL hostname is `novel18.syosetu.com` or a subdomain ending in `.novel18.syosetu.com`, `Novel18SyosetuScraper` MUST attach `Cookie: over18=yes` to fetch requests.

#### Scenario: Novel18 索引页 URL

- **当** 以 `https://novel18.syosetu.com/n2819do/` 调用 `getFetchExtraHeaders`
- **则** 返回的请求头必须包含 `Cookie: over18=yes`

#### Scenario: Novel18 章节 URL

- **当** 以 `https://novel18.syosetu.com/n2819do/1/` 调用 `getFetchExtraHeaders`
- **则** 返回的请求头必须包含 `Cookie: over18=yes`

#### Scenario: 非 novel18 域名

- **当** 以 `https://ncode.syosetu.com/n2819do/` 调用 `getFetchExtraHeaders`
- **则** 返回的请求头不得包含 `Cookie`

#### Scenario: 无效 URL

- **当** 以非法 URL 字符串调用 `getFetchExtraHeaders`
- **则** 返回的请求头必须为空对象
- **且** 爬虫不得抛出错误

### Requirement: Novel18 跳过外部 CORS 代理

`Novel18SyosetuScraper` MUST return `true` from `shouldSkipExternalProxy()` so that novel18.syosetu.com fetches SHALL NOT use external CORS proxy URLs (e.g. `cors.rozx.moe/?{url}`).

#### Scenario: Electron 下全局外部代理已启用

- **当** 用户在设置中启用了全局外部 CORS 代理
- **且** `Novel18SyosetuScraper` 在 Electron 中抓取 novel18.syosetu.com URL
- **则** `ProxyService` 不得将请求 URL 包装为外部 CORS 代理 URL
- **且** Electron 抓取必须使用原始 novel18.syosetu.com URL

#### Scenario: 其他爬虫行为不变

- **当** `NcodeSyosetuScraper` 或 `KakuyomuScraper` 在全局外部代理启用时抓取 URL
- **则** 外部 CORS 代理行为必须与本次变更前一致

### Requirement: Electron 抓取通过 Puppeteer setCookie 注入 Cookie

Electron page fetches that include a `Cookie` request header MUST parse that header and inject cookies via `page.setCookie()` before navigation; the `Cookie` header MUST NOT be passed through `page.setExtraHTTPHeaders()`.

#### Scenario: 请求头含单个 Cookie

- **当** Electron fetch 以请求头 `{ Cookie: 'over18=yes' }` 抓取 `https://novel18.syosetu.com/n2819do/1/`
- **则** Puppeteer 必须调用 `page.setCookie`，参数为 `{ name: 'over18', value: 'yes', url: 'https://novel18.syosetu.com/' }`
- **且** `setExtraHTTPHeaders` 不得包含 `Cookie` 键

#### Scenario: 请求头不含 Cookie

- **当** Electron fetch 未携带 `Cookie` 请求头
- **则** 不得为注入 Cookie 而调用 `page.setCookie`
- **且** 其他额外 HTTP 请求头仍须按变更前方式应用

### Requirement: BaseScraper 提供站点级抓取钩子

`BaseScraper` MUST provide protected hooks `getFetchExtraHeaders(url)` and `shouldSkipExternalProxy()` with default implementations returning `{}` and `false` respectively. Electron `fetchPage` MUST read these hooks when building requests and proxy options.

#### Scenario: 子类未覆写钩子

- **当** 爬虫子类未覆写 `getFetchExtraHeaders` 或 `shouldSkipExternalProxy`
- **则** 该爬虫的抓取行为必须与本次变更前一致

#### Scenario: Electron fetchPage 使用钩子

- **当** 覆写了 `getFetchExtraHeaders` 的爬虫在 Electron 中执行 `fetchPage`
- **则** 额外请求头必须传入 `fetchViaElectron`
- **且** `shouldSkipExternalProxy` 必须传入 `ProxyService.executeWithAutoSwitch`

### Requirement: ProxyService 支持 skipExternalProxy 选项

`ProxyService.getProxiedUrl` and `ProxyService.executeWithAutoSwitch` MUST accept an optional `skipExternalProxy` parameter. When `skipExternalProxy` is `true`, URLs MUST NOT be wrapped as external CORS proxy URLs.

#### Scenario: 启用代理且 skipExternalProxy 为 true

- **当** 在全局代理已启用的情况下，以 `skipExternalProxy: true` 调用 `getProxiedUrl`
- **则** 返回的 URL 不得为 `cors.rozx.moe`（或其他外部 CORS 代理）包装后的 URL
- **且** 在 Electron 且跳过内部代理时，返回的 URL 必须为原始目标 URL

#### Scenario: executeWithAutoSwitch 不轮换外部代理

- **当** 在全局代理已启用的情况下，以 `skipExternalProxy: true` 调用 `executeWithAutoSwitch`
- **则** 不得进入外部代理自动切换重试循环
- **且** 必须仅执行一次请求，使用 `getProxiedUrl({ skipExternalProxy: true })` 的结果

### Requirement: Electron 桌面端可端到端导入 novel18 小说

In Electron, with age-verification cookie handling enabled, `Novel18SyosetuScraper` MUST successfully fetch a novel18.syosetu.com index page and at least one chapter body.

#### Scenario: 抓取小说元数据与章节正文

- **当** 用户在 Electron 中、代理设置为默认开启，导入 `https://novel18.syosetu.com/n2819do/`
- **则** `fetchNovel` 必须返回 `success: true`，且标题非空、至少一卷含章节
- **且** 对第一章调用 `fetchChapterContent` 必须返回长度大于 100 字符的正文

### Requirement: Web SPA 版 novel18 不在本次范围

This change MUST NOT alter Web SPA scraper behavior for novel18.syosetu.com. Web novel18 support MAY remain unavailable until upstream addresses it separately.

#### Scenario: Web axios 路径不变

- **当** `Novel18SyosetuScraper.fetchPage` 在浏览器（非 Electron）环境运行
- **则** 本次变更不得通过 axios 为 novel18 URL 附加 `over18=yes`
- **且** Web 代理相关 UX（静默跳过 vs 用户提示）交由上游决定
