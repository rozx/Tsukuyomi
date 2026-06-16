## Why

`novel18.syosetu.com`（小説家になろう R18 分站）在抓取时会显示年龄确认页，未携带 `Cookie: over18=yes` 的请求无法进入正文，导致索引页/章节页解析失败或内容为空。当前 `Novel18SyosetuScraper` 继承自 `NcodeSyosetuScraper` 但未处理该 Cookie，**Electron 桌面端**用户无法导入 R18 小说。

Web SPA 涉及 `/api/novel18` 后端、浏览器 CORS、外部代理是否静默跳过及用户提示策略，均不在本 fork 可控范围内，交由上游原开发者决策；**本次仅交付 Electron 路径**。

## What Changes

### 本次 scope（Electron 桌面端）

- **`Novel18SyosetuScraper`**：对 `novel18.syosetu.com`（含子域）请求自动附加 `Cookie: over18=yes`；在 Electron 抓取路径上跳过外部 CORS 代理（第三方代理会剥离 Cookie）
- **`BaseScraper`**：新增可覆写钩子 `getFetchExtraHeaders()`、`shouldSkipExternalProxy()`，将站点级请求头与代理策略下沉到子类（通用机制，本次仅 novel18 使用）
- **`ProxyService`**：新增 `skipExternalProxy` 选项，供 Electron 抓取路径在需要 Cookie 的站点跳过外部 CORS 代理
- **Electron**：新增 `puppeteer-cookies.ts`；`electron-main.ts` 将 `Cookie` 头从 `setExtraHTTPHeaders` 拆出，改由 `page.setCookie()` 注入（Puppeteer 限制）
- **测试**：单元测试覆盖 Cookie 头生成、Cookie 解析工具；opt-in live 测试（Node 直连）验证抓取逻辑

### 明确不在本次 scope

| 项 | 决策 |
|---|---|
| **Web SPA** | **不在 scope**。含 `/api/novel18` 后端、浏览器 axios 路径、CORS 代理 UX（静默跳过 vs 提示用户）等，另开 issue 由上游决定 |
| **User-facing 文档** | 不需要更新 help 文档 |
| **Live 测试进 CI** | 保持 `RUN_LIVE_SCRAPER_TESTS=1` opt-in，不进 CI |

### Electron 代理行为约定

- Electron 本就直连目标站（不走 `/api/` 内部代理）；若用户启用了**外部 CORS 代理**，novel18 请求**静默跳过**外部代理，改走 Puppeteer 直连
- Web 浏览器路径行为**不变**（含原有失败场景）
- 其他站点（ncode、kakuyomu 等）行为不变，无 **BREAKING** 变更

## Capabilities

### New Capabilities

- `novel18-age-verification`：Electron 桌面端抓取 novel18.syosetu.com 时自动携带年龄验证 Cookie，并在该站点跳过外部 CORS 代理

### Modified Capabilities

（无——`openspec/specs/` 中尚无 scraper 相关 spec）

## Impact

**代码**：

- `src/services/scraper/scrapers/novel18-syosetu-scraper.ts` — Cookie 头 + 跳过外部代理（novel18 专用配置）
- `src/services/scraper/core/base-scraper.ts` — 钩子与 Electron `fetchPage` 集成
- `src/services/proxy-service.ts` — `skipExternalProxy` 选项（通用机制）
- `src-electron/puppeteer-cookies.ts`（新）、`src-electron/electron-main.ts` — Puppeteer Cookie 注入（通用机制）
- `src/__tests__/novel18-scraper.test.ts`、`puppeteer-cookies.test.ts`、`scraper-live.test.ts`

**不改动**：

- `fetchViaAxios` 浏览器路径
- `/api/novel18` 后端代理
- help 文档

**验收环境**（本次 scope）：

- Electron 桌面端（`bun run dev:electron` / 打包后导入 novel18 URL）
- Node/Vitest opt-in live 测试（直连 `novel18.syosetu.com`，验证 scraper 逻辑）

**上游 follow-up**（独立 issue，非本 PR）：

- Web 版 novel18 抓取：后端 Cookie 转发、外部 CORS 代理策略与用户提示方案

**工程规范**：

- TDD：改 `services/` 前先写失败测试
- 不手动修改 `src/constants/version.ts`（pre-commit hook 自动 bump）
- 提交前跑 `lint && type-check && quality-check`
