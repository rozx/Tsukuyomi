## Context

`novel18.syosetu.com` 是小説家になろう的 R18 分站，页面结构与 `ncode.syosetu.com` 相同，但首次访问会弹出年龄确认页。站点通过 Cookie `over18=yes` 记录「已通过确认」状态；未携带该 Cookie 的 HTTP 请求会收到确认页 HTML 而非小说索引/正文。

当前 `Novel18SyosetuScraper` 继承 `NcodeSyosetuScraper`，复用全部解析逻辑，但 `BaseScraper.fetchPage()` 不携带站点级请求头。

**Electron 路径**（本次 scope）：

- 抓取走 `fetchViaElectron` → Puppeteer `page.goto`
- Puppeteer **禁止**通过 `page.setExtraHTTPHeaders()` 发送 `Cookie`，必须改用 `page.setCookie()`
- Electron 环境下 `skipInternalProxy: true`，**从不**走 `/api/novel18` 内部代理，直连目标站
- 若用户在设置中启用**外部 CORS 代理**，代理会剥离 Cookie 头，需在该站点跳过外部代理

**Web SPA 路径**（不在 scope）：

- 依赖 `/api/novel18` 后端转发、浏览器 CORS、外部代理 UX 等，本 fork 无法完整交付
- 是否静默跳过 CORS、如何提示用户，由上游原开发者决定；可另开 issue 讨论替代方案

参考实现见分支 `fix/novel18-age-cookie`（commit `14264655`）；本设计在其基础上**收敛为 Electron-only**，移除 Web/axios 相关改动。

## Goals / Non-Goals

**Goals:**

- Electron 桌面端：`Novel18SyosetuScraper` 能成功抓取索引页、章节列表与章节正文
- 对 `novel18.syosetu.com` 请求自动附加 `Cookie: over18=yes`（novel18 专用）
- Electron 用户启用外部 CORS 代理时，novel18 请求**静默跳过**外部代理，Puppeteer 直连
- 引入**通用**基础设施（`BaseScraper` 钩子、`puppeteer-cookies`、Electron Cookie 注入、`ProxyService.skipExternalProxy`），本次仅 novel18 启用站点配置
- TDD：单元测试 + opt-in live 测试覆盖核心行为

**Non-Goals:**

- Web SPA、浏览器 axios 路径、`/api/novel18` 后端代理
- 外部 CORS 代理的用户提示 UX（Web 范畴，上游决策）
- user-facing help 文档
- Live 测试进 CI（保持 `RUN_LIVE_SCRAPER_TESTS=1` opt-in）
- 用户 UI 确认 R18 内容（Cookie 硬编码，无交互）
- 改动 ncode、kakuyomu 等其他爬虫的行为

## Decisions

### D1. 站点级 Cookie 通过 `BaseScraper` 可覆写钩子注入

**选择**：在 `BaseScraper` 新增 protected 钩子（通用机制）：

| 钩子 | 默认 | Novel18 覆写 |
|------|------|--------------|
| `getFetchExtraHeaders(url)` | `{}` | `{ Cookie: 'over18=yes' }`（hostname 匹配时） |
| `shouldSkipExternalProxy()` | `false` | `true` |

`fetchPage()` 在 Electron 路径读取钩子，传入 `fetchViaElectron` 与 `ProxyService.executeWithAutoSwitch()`。

**不引入** `shouldSkipInternalProxy()` 生产逻辑（Electron 已通过 `skipInternalProxy: isElectron.value` 跳过内部代理）。live 测试子类可单独覆写 `fetchPage` 或保留测试用 hook 以 Node 直连。

**为什么**：

- Cookie 是站点语义，属于 scraper 子类；钩子是通用扩展点
- 不覆写整个 `fetchPage()`，避免重复 Electron/代理逻辑

**alternatives**：

- *在 `ProxyService` 硬编码 novel18 Cookie*：通用层耦合站点知识。✗
- *仅改 `electron-main.ts` 写死 over18*：无法随 URL 泛化，难测。✗

### D2. `ProxyService.skipExternalProxy` 仅服务 Electron 抓取路径

**选择**：`getProxiedUrl()` 与 `executeWithAutoSwitch()` 增加 `skipExternalProxy?: boolean`。为 `true` 时跳过外部 CORS 代理 URL，Electron 下最终直连原始 URL（因 `skipInternalProxy` 已为 true）。

`executeWithAutoSwitch` 在 `skipExternalProxy || !proxyEnabled` 时不进入外部代理轮换循环。

**为什么**：

- Electron 用户可能开启全局外部代理；novel18 必须绕过以免 Cookie 被剥离
- Web 路径不调用此选项（novel18 的 `shouldSkipExternalProxy` 仅在 scraper 层生效，Web 仍走原有 axios 逻辑且**不**附加 over18 cookie——行为与改前一致）
- 机制通用，触发由 novel18 子类决定

**alternatives**：

- *novel18 设置 `skipProxy: true`*：语义过宽，可能影响其它代理逻辑。✗
- *Web 也静默跳过并附加 Cookie*：scope 外，且后端/CORS 问题未解。✗

### D3. Electron：通用 `puppeteer-cookies` + `page.setCookie()`

**选择**：新增 `src-electron/puppeteer-cookies.ts`：

- `parseCookieHeader(header, targetUrl)` → `{ name, value, url }[]`
- `omitCookieHeader(headers)` → 移除 `Cookie` / `cookie` 键

`electron-main.ts`：`applyRequestCookies` → `setExtraHTTPHeaders(omitCookieHeader(...))`。

**为什么**：

- Puppeteer 限制；纯函数可 Vitest 单测
- **通用**：任何经 Electron fetch 传入 `Cookie` 头的请求均受益，不限 novel18

### D4. Cookie 值硬编码 `over18=yes`（novel18 专用）

**选择**：

```ts
hostname === 'novel18.syosetu.com' || hostname.endsWith('.novel18.syosetu.com')
```

无效 URL 返回 `{}`。

### D5. 不修改 `fetchViaAxios` / Web 路径

**选择**：本次不改浏览器 axios 抓取逻辑，不尝试在 Web 端附加 `over18` Cookie 或改变 Web 代理 UX。

**为什么**：

- Web 成功依赖后端与产品决策，半套实现易误导用户
- 减小 PR diff，边界清晰：「Electron 可用，Web 另议」

### D6. 测试分层

| 层 | 文件 | 内容 |
|----|------|------|
| 单元 | `novel18-scraper.test.ts` | `getFetchExtraHeaders` 输出；fixture HTML 解析 |
| 单元 | `puppeteer-cookies.test.ts` | parse/omit 纯函数 |
| 单元 | `proxy-service.test.ts`（可选） | `skipExternalProxy: true` 时不包装外部代理 URL（Electron 场景） |
| opt-in live | `scraper-live.test.ts` | Node 直连 `n2819do`，验证 scraper + Cookie 逻辑 |

不要求 Web `/api/novel18` 集成测试。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Web 版 novel18 仍无法导入 | 明确 non-goal；PR 与独立 issue 说明 |
| Electron 用户仅依赖外部代理访问其它站，novel18 静默改直连 | Electron 无 CORS 限制，直连可行；行为与 Web 无关 |
| 站点更改 Cookie 名/值 | 单点修改 `getFetchExtraHeaders`；live 测试可捕获 |
| 通用钩子被误认为 Web 已支持 | proposal/spec 写明 Electron-only 验收 |
| 手动 bump `version.ts` | 禁止；pre-commit hook |

## Migration Plan

- **无数据 migration**
- **部署**：随下一版 Electron 构建发布
- **回滚**：revert commit
- **上游**：独立 issue 讨论 Web novel18 方案（非 blocking）

## Open Questions

（无——Electron-only scope 已闭合）
