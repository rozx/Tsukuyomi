## 1. BaseScraper 钩子与 Electron 接线（先做）

- [x] 1.1 在 `base-scraper.ts` 新增 protected 钩子：`getFetchExtraHeaders(url)` 默认 `{}`，`shouldSkipExternalProxy()` 默认 `false`
- [x] 1.2 扩展 `fetchViaElectron(proxiedUrl, originalUrl, extraHeaders?)` 签名，合并 `extraHeaders` 到请求头
- [x] 1.3 改写 `fetchPage()`：读取钩子；**仅 Electron 分支**将 `extraHeaders` 传入 `fetchViaElectron`，将 `skipExternalProxy` 传入 `ProxyService.executeWithAutoSwitch`；**不修改** `fetchViaAxios` 浏览器路径

## 2. Novel18 年龄验证 Cookie（TDD）

- [x] 2.1 在 `novel18-scraper.test.ts` 增加失败测试：`getFetchExtraHeaders` 对 novel18 索引/章节 URL 返回 `{ Cookie: 'over18=yes' }`，ncode 返回 `{}`，非法 URL 返回 `{}` 且不抛错（测试子类 expose protected 方法）
- [x] 2.2 在 `Novel18SyosetuScraper` 覆写 `getFetchExtraHeaders(url)` 使 2.1 转绿
- [x] 2.3 增加失败测试：`shouldSkipExternalProxy()` 为 `true`
- [x] 2.4 覆写 `shouldSkipExternalProxy(): true`；更新 `useProxy` 注释为「跳过外部 CORS 代理，Electron 直连」

## 3. ProxyService skipExternalProxy（TDD → 实现）

- [x] 3.1 新增 `proxy-service.test.ts`：用 `spyOn(GlobalConfig, …)` mock 代理启用，`afterEach` 调用 `mock.restore()`；覆盖 `getProxiedUrl({ skipExternalProxy: true })` 不返回外部 CORS 包装 URL（应先 fail）
- [x] 3.2 同上文件：覆盖 `executeWithAutoSwitch({ skipExternalProxy: true })` 不进入外部代理轮换、仅执行一次（应先 fail）
- [x] 3.3 在 `ProxyService.getProxiedUrl` 与 `executeWithAutoSwitch` 实现 `skipExternalProxy` 使 3.1–3.2 转绿

## 4. Electron Puppeteer Cookie 注入（TDD → 实现）

- [x] 4.1 新增 `puppeteer-cookies.test.ts`：`parseCookieHeader`（单/多 Cookie）、`omitCookieHeader`（应先 fail）
- [x] 4.2 新增 `src-electron/puppeteer-cookies.ts`
- [x] 4.3 改写 `electron-main.ts`：`fetchUrlViaPuppeteer` 先 `page.setCookie(...)` 再 `setExtraHTTPHeaders(omitCookieHeader(...))`

## 5. Opt-in Live 测试

- [x] 5.1 在 `scraper-live.test.ts` 顶部加 `// @vitest-environment node`；新增 `LiveNovel18Scraper` 测试子类（覆写 `fetchPage` 直连或等效方式跳过 `/api/novel18`）；opt-in 用例验证 `n2819do` 索引 + 第一章正文 > 100 字

## 6. 回归与验收

- [x] 6.1 运行 `bunx vitest run novel18-scraper puppeteer-cookies proxy-service`，确认 ncode/kakuyomu 既有 scraper 测试仍通过
- [x] 6.2 运行 `bun run lint && bun run type-check && bun run quality-check`
- [x] 6.3 手动验收：`bun run dev:electron` 导入 `https://novel18.syosetu.com/n2819do/`
- [x] 6.4 确认未手动修改 `version.ts`；PR 描述注明 Electron-only、Web novel18 另开 upstream issue
