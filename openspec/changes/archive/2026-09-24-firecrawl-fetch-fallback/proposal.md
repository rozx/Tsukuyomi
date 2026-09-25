## Why

部分小说站点即使经过 CORS 代理也无法访问——例如 `https://syosetu.org/novel/375522/6.html` 在直连与 `cors.rozx.moe` 下都返回 403（站点反爬），Electron 直连同样可能被拦。现有「自动切换代理服务」只能在一组 CORS 代理之间轮转，而新装用户默认只有 CORS Tsukuyomi 一个代理，轮转已没有意义。实测 Firecrawl `/v2/scrape` 在**无 API Key**（2026-08 上线的 keyless 模式，按 IP 每日限额）下即可取回该页完整 `rawHtml`，且 API 返回 `access-control-allow-origin: *`，浏览器可直接调用。因此用 Firecrawl 作为统一的「被拦截时的回退通道」替代代理轮转，并顺带让 AI 助手的网络搜索 / 网页读取在未配置 Tavily 时也能工作。

## What Changes

- **新增** Firecrawl 客户端：`/v2/scrape`（`rawHtml` / `markdown`，始终 `maxAge: 0`）、`/v2/search`、`/v2/team/credit-usage`；有 Key 时只用 Key，无 Key 时走 keyless；全局单队列限速，429 按 `Retry-After` 有限重试；402 / keyless 日限额视为「额度耗尽」终止当前批次。
- **新增** 设置项 `firecrawlApiKey`（随 Gist 同步，与 `tavilyApiKey` 一致）、`firecrawlFallbackEnabled`（默认开）、`firecrawlAutoAddMapping`（默认开）。旧用户首次加载时按默认值补齐。
- **新增** API Keys 标签页的 Firecrawl 卡片：Key 输入、保存时经 credit-usage 校验（401 拒绝保存）、「检查额度」按钮显示剩余 / 套餐额度与账期结束日；无 Key 时提示 keyless 按 IP 日限额；「启用 Firecrawl 回退」总开关（同时作用于网页抓取与 AI 网络工具）。
- **新增** 独立的「网站映射」标签页（Web 与 Electron 均显示），从「代理设置」中拆出：自动添加映射开关（依赖总开关）+ 映射表；映射可选 Firecrawl。
- **修改** 页面抓取链路：`映射代理（按序）或默认代理 → 瞬时错误重试一次 → Firecrawl`。触发回退的「被拦截」判定为网络 / CORS / 超时、403、429、5xx，以及 200 但为反爬挑战页；404 等其他 4xx 不回退。回退成功且开启自动添加映射时，把 `'firecrawl'` 令牌**置顶**写入该根域名映射（静默）。Firecrawl 回退与 firecrawl 映射独立于「启用代理」开关，Web 与 Electron 均生效；CORS 映射项仅在 Web 且代理开启时生效。
- **BREAKING（行为，Electron）** Electron 页面抓取不再经外部 CORS 代理：此前 `proxyEnabled` 默认开启且在 Electron 隐藏，导致 Puppeteer 实际加载的是 `cors.rozx.moe/?{url}`；改为 Puppeteer（stealth）直连 → 被拦截时回退 Firecrawl，与「Electron 由系统代理处理」的既有意图及 novel18 的直连做法一致。同时 Electron 抓取改为上报真实 HTTP 状态（此前恒为 200），以便判定拦截。
- **修改** Firecrawl 额度耗尽后进入「额度锁存」：后续请求不再发网络请求而直接失败，直到 Key 变更、额度查询成功或 60 分钟后；书籍同步在收到额度耗尽错误时停止剩余章节（不作废配方）。
- **修复** syosetu.org 目录解析：站点已改用 `section.episode-list` 新版目录（不再是 `<table>`），现有解析器在当前页面上取到 0 话；新增新版解析并保留旧版回退（实施中发现，经用户确认纳入本变更）。
- **BREAKING（行为）** 移除「自动切换代理服务」：不再在全局代理列表中轮转，`proxyAutoSwitch` 字段退役（保留读取兼容、不再生效），原「自动添加映射」不再记录成功的 CORS 代理，只记录 Firecrawl。
- **修改** AI 工具 `search_web` / `fetch_webpage`：有 Tavily Key 时先用 Tavily，Tavily 出错（额度 / 5xx / 网络）或未配置时回退 Firecrawl（受同一总开关控制）。「仅靠 Firecrawl」的可用性只开放给**助手聊天**与**导入 agent**；翻译 / 润色 / 校对任务仍仅在配置 Tavily Key 时提供网络工具，避免长翻译任务消耗与抓取共用的 keyless 额度。导入 agent 的 `search_web` 同样遵循此顺序。
- **修改（归档后补充，2026-09-24/25 实测驱动）** 书籍更新检查：快速检查**只读目录**，不再抓取任何已导入章节正文；按站点日期把章节分为「按更新日期无变化 / 更新日期较新、可能有修订 / 未比对正文」，正文比对只在「逐章比对正文」时进行。逐章比对确认未变的章节写回站点日期；手动添加（无网址）的章节按标题或相邻位置自动关联目录条目并写回网址，不再重复列为新章节；空行差异不计为修订；已抓取正文 30 分钟内跨会话复用；逐章比对显示「等待 Firecrawl 限速」。
- **修改（归档后补充）** Firecrawl 限速与额度：队列只限并发 2、不设固定每分钟上限（免费档每分钟 10 次由 Firecrawl 的 429 约束，付费档不被拖慢）；429 暂停整个队列（等待时间取 `Retry-After` 头、响应体 `retry_after_seconds`，否则 20 秒）。keyless 日额度按响应体 `reason: "credits"` 识别（不再按 keyless / free 字样），锁存持续到给出的等待时间。
- **修复（归档后补充）** API Keys：设置异步加载完成前输入框为空、「保存」误可用会删除已保存 Key 的竞态；「检查额度」改为描边按钮；网站映射表新增删除按钮。
- **不在范围**：移除默认 CORS 代理——新装用户自 `e8c24afc` 起已只有 CORS Tsukuyomi；本变更**不**迁移老用户已持久化的 `proxyList` / `proxySiteMapping`。AI 请求、封面、图片上传仍只走 CORS 代理，不经 Firecrawl。

## Capabilities

### New Capabilities

- `firecrawl-client`：Firecrawl 访问层契约——Key / keyless 选择、scrape / search / credit-usage 请求形状、缓存策略、限速队列、429 / 402 / 目标站状态码的错误语义。
- `page-fetch-fallback`：网页抓取的尝试链、「被拦截」判定（含挑战页识别）、Firecrawl 回退、`'firecrawl'` 映射令牌的存储与置顶、跨平台行为与自动切换的退役。
- `firecrawl-settings`：Firecrawl 相关设置项、默认值与同步，API Keys 中的 Key 校验与额度查询，独立「网站映射」标签页及其在各平台的可见性。
- `ai-web-tools-fallback`：`search_web` / `fetch_webpage` 在 Tavily 与 Firecrawl 之间的优先级、回退条件与结果归一化。

### Modified Capabilities

- `novel18-age-verification`：经 Firecrawl 抓取 novel18 时 MUST 通过 Firecrawl `headers` 转发 `Cookie: over18=yes`，且年龄确认页判定同样适用于 Firecrawl 返回内容。
- `book-sync-service`（归档后补充）：快速检查只读目录；逐章比对确认未变时记录站点日期；关联手动添加的章节；空行差异不计为修订。

## Impact

- 代码：`src/services/proxy-service.ts`（尝试链重写、令牌跳过）、`src/services/scraper/core/page-transport.ts`（Firecrawl 传输、挑战页识别）、`src-electron/electron-main.ts` + preload 类型（真实状态码）、`src/services/book-sync/book-sync-service.ts`（额度耗尽停止）、新增 `src/services/firecrawl/`、`src/services/ai/tools/{web-search-tools,tool-registry}.ts`、`src/services/import/import-metadata-service.ts`（导入 agent 搜索）、`src/models/settings.ts`、`src/stores/settings.ts`、`src/services/settings/settings-parsers.ts`、`src/services/global-config-cache.ts`、`src/composables/settings/useProxySettings.ts`、`src/components/settings/{ProxySettingsTab,ApiKeysSettingsTab}.vue` + 新增网站映射标签页组件、`src/composables/settings-page/useSettingsPage.ts`（标签列表与四张 tab 索引映射表）。
- 外部依赖：Firecrawl API（`api.firecrawl.dev`），无新增 npm 依赖（沿用 axios）。
- 隐私：回退触发时被访问页面的 URL 会发送给 Firecrawl；AI 搜索查询在回退时发送给 Firecrawl。设置文案需说明。
- 兼容：旧版本客户端经 Gist 同步读到 `'firecrawl'` 令牌时会把它当 URL 模板（Electron 旧版请求失败后轮转；Web 端总是加载最新构建），但令牌会随旧版保存完整保留。
- Electron：原先仅经 `cors.rozx.moe` 才能访问的站点，改由 Firecrawl 回退兜底。
- 文档：帮助文档中代理设置 / API Keys 章节需更新。
