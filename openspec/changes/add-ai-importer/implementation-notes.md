# AI 导入实施记录

## 回归基线（2026-09-20）

实施起点为 `c58e9575`，数据库 v11，工作区干净。以下现有 Vitest 文件全部通过，共 219 个用例、2 个既有跳过项：`book-service`、`chapter-content-service`、`indexed-db-migration`、`assistant-service.in-loop-summary`、`assistant-service.summary-safety`、`scraper-chapter-content`、`scraper-ncode-pagination`、`sync-data-service`、`sync-partial-apply`、`sync-revision-guards`。输出保存在 `/private/tmp/ai-importer-baseline.log`。

## 复用与写入入口

- `AssistantService.chat`：注入工具集、上下文、检查点和批内让出，保留默认助手行为。
- `BaseScraper`：抽取页面传输，复用代理与站点请求头；导入只读取明确指定资源。
- `BookService.saveBook/bulkSaveBooks`：目前正文与结构分次写入，需合并事务并维护书籍序号。
- `BookService.deleteBook/clearBooks`：删除结构、正文及关联资源，保留定向删除的修改序号。
- `ChapterContentService.saveChapterContent/deleteChapterContent/bulkDeleteChapterContent/clearAllChapterContent`：独立正文写入和清理；缓存、索引与嵌入维护应在事务提交后执行。
- `MemoryService.createMemory/createMemoryWithId/upsertMemoryForSync/updateMemory/deleteMemory/clearAllMemories` 及容量淘汰：语义变更接入序号；访问时间、嵌入与只读操作除外。
- `SyncDataService.applyDownloadedData/applyPartialRemoteData/overwriteFromSnapshot` 及备份回滚：经公共保存入口维护序号；不把导入私有数据加入同步。
- `indexed-db.ts` 的 localStorage 小说迁移直接写 `books`，也需维护序号；完整数据库清理同时清理导入 stores。
- `useChapterTranslation` 与单段处理入口：必须在读取快照前取得执行占用，直到最外层 finally 保存结束才释放，不能依赖 UI 终态。

上轮计划审查已核实正文错误与空记录混淆、终态后写入、导航派发、聊天宿主和 Markdown 换行映射问题，本次实现按修正后的设计执行。

## 已实现的数据基础

- v12 的六个 stores、增量升级、阻塞提示状态复位及完整测试重置。
- 导入类型契约、任务／来源分页、不可变资源、事件及检查点的原子保存；工具 JSON 未完成、结果缺少调用、运行代次过时均拒绝保存。
- Blob 快照摘要、快照位置绑定的正文块、分页与范围解析，搜索用途的资源不能进入小说正文。
- TXT 编码与原文范围、Markdown 顶层块及 CRLF／CR 到原文的偏移映射。
- 严格正文与小说快照读取，区分 absent / loaded / failed，不读取或污染 loader 缓存。
- URL、文件和目录清单登记，显式目录枚举、发现引用、相对 URL 和锚点、任务内资源去重与用途继承。

新增的运行时模块均先运行失败测试再实现。用例位于 `src/__tests__/import-*.test.ts`；尚未接通 Agent 或页面，不能把数据基础完成视为导入功能已可使用。

## Electron 能力实测与待决定事项

实际产物：Electron 39.8.10、macOS arm64，以 `file://.../app.asar/index.html` 加载。测试使用 `/private/tmp/ai-importer-electron-profile`，未使用用户现有书库。

1. 默认 `bun run build:electron` 在开发证书时间戳签名处失败。保留原签名配置，用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 构建本地未签名产物；沙箱不能执行 DMG 所需系统操作，在获得自动审批后于沙箱外构建成功。命令为 `ELECTRON_BUILDER_CACHE=/private/tmp/ai-importer-electron-cache CSC_IDENTITY_AUTO_DISCOVERY=false bun run build:electron`，日志 `/private/tmp/ai-importer-electron-local-unrestricted.log`。
2. 启动产物时添加 `--user-data-dir=/private/tmp/ai-importer-electron-profile`，通过现有 8315 调试端口连接测试实例。在同一进程用 `window.open(location.href)` 打开第二工作台，第一窗口持有锁，第二窗口的 `ifAvailable` 返回 null；释放或销毁持锁窗口后可重新取得锁。BroadcastChannel 消息到达；从 file URL 加载带静态 import 的模块 Worker 返回预期值 42。复现脚本 `/private/tmp/ai-importer-capabilities.mjs`，结果 `/private/tmp/ai-importer-electron-capabilities.json`。
3. 再用 Puppeteer 的 `pipe: true` 启动同一产物第二进程，传入同一用户数据目录；第二实例确实启动，并且仍能取得第一进程持有的同名 Web Lock。结果 `secondInstanceBlocked: false`，脚本 `/private/tmp/ai-importer-multi-instance.mjs`，结果 `/private/tmp/ai-importer-electron-multi-instance.json`。测试实例均已关闭。

结论：API 存在不能证明 Electron 跨进程互斥。已向用户提出保留多开并增加跨进程协调、工作区单实例、或暂禁 Electron 导入执行三个选择，等待确定后更新执行设计。任务 1.3 不标为完成；实际导入 Worker、受限回退和跨实例策略仍须实现并验证。其他独立任务继续推进。

## 第一轮验证

15 个基础与既有回归测试文件共 242 项通过、2 项既有跳过，另有 9 项 TXT／Markdown 测试通过，合计 251 项通过。类型检查及 Fallow 门禁通过；完整 Agent、应用／撤销、界面、实际导入 Worker 和最终端到端验收尚未实现，不以当前测试范围替代这些交付项。

## 第二轮：书库持久化与单页抓取

- `LibraryPersistence` 统一书籍结构与正文的原子保存、批量保存、删除与清空；原有空章节跳过和未改正文跳过行为保留。正文记录增量记录所属书籍，旧记录清理时通过书籍结构查归属。
- `book-revisions` 在写事务内更新；无语义变化、懒加载标记变化、记忆访问时间和向量更新不递增。删除后保留序号，改后改回仍被识别为后续修改。
- Memory 创建／更新／同步／容量淘汰／删除／批量清理均纳入相同边界。访问时间和嵌入写回也改为事务内重读，防止把旧快照正文覆盖回去。
- 普通小说删除与同步墓碑同事务提交；追加墓碑读取最新配置，普通设置更新只补显式字段，保留其他标签页新增的墓碑及凭据。用户明确清理删除传播状态的原行为保留。
- 缓存、全文索引和章节嵌入维护在提交后共用一个可重试入口，失败事务不提前修改缓存；共享事务收尾统一处理中止和异步拒绝。
- localStorage 迁移接入共同保存边界；实际增量同步和历史快照恢复用例确认修改序号增长，导入任务保留。完整数据库重置同时清除导入状态及序号。
- `BaseScraper` 复用新的单页面传输层，保留代理和站点请求头，公开快照、目录纯解析和章节纯解析入口。ncode／novel18 的目录下一页只作为返回值，不自动继续抓取；旧完整抓取入口保留分页行为。Web 请求传递 AbortSignal，取消时不再启动请求或代理重试；现有 Electron IPC 不具备底层请求中止接口，因此立即停止等待并丢弃迟到结果，底层请求仍受原 60 秒超时限制。

TDD 证据：`library-persistence`、`memory-book-revision`、`book-revision-integration`、`sync-deletion-transaction`、`import-page-transport` 和 `abortable-operation` 的新增用例均先失败再转绿。原 `book-service` 用例从内部方法调用断言改为实际落盘及嵌入副作用断言，保留原行为要求。

最终全量测试为 162 个文件通过、2021 项通过及 5 项既有跳过；lint、类型、Fallow、SPA 生产构建、格式和 OpenSpec 校验通过。验证日志使用 `/private/tmp/ai-importer-round2-*` 前缀。此时任务完成度为 19/66，尚无 Agent／工作台／应用撤销入口。

## 第三轮：HTML、EPUB 与解析执行

- HTML／XHTML 在 Cheerio 中解析，支持站点正文范围和自定义 CSS 选择／排除。正文块保留原始位置，前言、后记及脚注默认保留；导航、广告、时间和版权资源分别记录。脚本和外部图片不执行、不请求。已支持网站的目录纯解析接口补充嵌入式目录及后续引用，仍不自动跟页。
- 添加 `fflate@0.8.3`，按需解压 EPUB，解析容器、OPF、spine、导航／NCX、封面及缺失资源。校验路径、条目数、声明及实际解压大小、CRC、压缩方法和加密标识；只支持存储与 DEFLATE，不引入解密。ZIP 字段和完整性依据 [PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)，流式解压使用 [fflate](https://github.com/101arrowz/fflate)。多个 package 的身份信息提供给后续单本小说确认流程，不在解析阶段选择导入作品。
- `ImportParsingClient` 启动按需 Worker，失败时使用受限主线程路径；支持时间、输入与解压上限、分段让出和取消。Worker 完成或取消后终止，迟到结果不会重新返回；执行器仍须在最后提交时检查任务运行代次。
- `ImportExtractionService` 准备来源快照、发现引用、完整提取结果和错误状态，交由执行器与工具结果／检查点一起保存。批量只处理明确列出的 1–8 个来源，每项独立返回；补文件保留失败来源。检查与提取不修改书库或自动生成草稿。
- 提取保留 TXT／Markdown 原换行，分页不替代全文；历史快照重提取不会回退最新来源版本，重复检查不会清除“已提取”状态。没有检查元信息的旧快照通过新 ID 补充，旧资源保持不可变。
- 大量范围选择原先按块与全部范围交叉遍历，预算测试首先复现超时，再改为二分定位相交范围并合并排除区间；10 万行、1 万个不连续范围在 1 秒测试预算内完成，未改变所选文本。

当前解析上限：Worker 输入 64 MiB、单项 16 MiB、总解压 128 MiB、4096 个条目、4 Mi 个 UTF-16 单位、20 秒；主线程回退输入 4 MiB、单项 512 KiB、总解压 16 MiB、1024 个条目、256 Ki 个 UTF-16 单位、10 秒。它们是已实现的初始限额，桌面／手机样本的最终选择仍由任务 11.3 验收。

实际运行验证：用项目 Vite 生产编译解析客户端与 Worker 到 `/private/tmp/ai-importer-parser-built`，验证脚本为 `/private/tmp/ai-importer-parser-browser.mjs` 和 `/private/tmp/ai-importer-parser-electron.mjs`。隔离 Chrome 中 6 万段解析在 Worker 执行，主线程计时器继续运行；完整探针约 63 ms。已打包 Electron 的隔离 `file://.../app.asar/index.html` 页面加载这份生产模块，10 万段、EPUB、Worker 取消、主线程回退取消和回退限额均通过，结果为 `/private/tmp/ai-importer-parser-{browser,electron}-results.json`。未使用用户浏览器资料或书库。最终工作台接入并打包后，还需任务 11.6 再核对应用内实际资源路径。

本轮完成任务 1.3 中解析 Worker 的能力输入，跨进程互斥部分仍待用户选择，未修改 Electron 的多开政策。任务进度为 24/66；4.5 的错误记录和补文件关联已实现，小说归属核对仍需随 6.3 完成后验收。Agent、草稿、方案、应用／撤销和工作台仍需继续实现。验证日志使用 `/private/tmp/ai-importer-round3-*` 前缀。

第三轮最终验证：166 个测试文件、2049 项测试通过，5 项既有跳过；lint、类型、Fallow、SPA 构建、Prettier、差异空白与 OpenSpec 校验通过。全量运行暴露的数据库 blocked 测试时序依赖已修复：等待原生 blocked 事件，不再假定一个定时器 tick 后必定已经派发。

## 第四轮：草稿、单本小说及元信息

- `ImportDraftService` 统一手动与 Agent 的具名编辑，校验 `baseDraftRevision`，整批失败回滚。通过仓库的 `mutateTask` 可把草稿修改、工具完成回执及检查点放入同一事务。正文支持整份提取结果、连续块、块内范围和当前目标的既有段落引用，不接收模型生成的正文对象。
- 卷章创建、拆合、移动、排序及选择由引用组成；推断标题／结构带标识，标题限制 500 字符。跨任务内容、元信息专用来源、未归属所选小说的范围、其他目标书籍和过时书籍快照均拒绝。
- 多小说确认使用宿主问题 ID 和来源范围版本。取消、其他任务的回答、旧问题回答、Agent 缩减候选都不能解除门槛；确认新作品保留但取消选择旧草稿，重新确认同一作品保留手动标题和目标。补充文件只有在明确核对范围后才能进入草稿，原失败来源继续保存。
- `ImportLibraryService` 提供明确小说 ID 下的搜索、信息、章节和分页正文对照；同名多版本返回歧义，不自动指定目标。不读取全局当前书籍，不向 Agent 输出模型配置、凭据或无关记忆，正文读取失败不会变成空数组。
- 元信息搜索复用现有 Tavily 请求与配置，准备 `metadata-only` 来源供工具完成时一起提交。候选保留出处、不可变资源引用、冲突及推断标识；Agent 不能覆盖用户选择，用户可采用或取消采用字段。封面须为观察到的图片 URL 或任务中真实图片资源，草稿不保存临时 object URL，应用前按需生成持久 data URL。
- 回归测试发现旧版本书籍可能把正文内嵌在 `books` 中。严格小说读取保留这种正文，并以 `storage: embedded`／缺少 `record` 区分独立正文记录确实不存在。公共保存会在同一事务迁移仍保留的内嵌正文，元信息保存不会丢失它，纯存储表示迁移不递增语义序号。后续应用／撤销的前镜像必须同时保留旧书籍内嵌值和独立正文的缺席标记，不能把这种合法旧数据当成空正文。
- 整本范围授权的压力测试先复现重复展开导致约 2.5 秒耗时，再以每个候选／资源的范围索引校验，1 万段用例在 1.5 秒预算内通过。

本轮对应任务 4.5 与 6.1–6.6，进度为 31/66。尚未接入实际 Agent 循环、预览／应用／撤销和工作台 UI；Electron 跨进程互斥的选项仍未收到用户答复。工具接入阶段须继续验证编码覆盖参数、来源操作与回执的共同提交，以及提问恢复；最终打包阶段仍须复验 Worker 资源路径。

第四轮全量回归为 170 个测试文件、2073 项通过、5 项既有跳过；另以定向用例确认仅按作者检索会排除无关小说。lint、类型、Fallow 与 SPA 构建通过。旧书读取现已复用日期字段白名单：真实 Date 字段能够保留，形似 ISO 日期的书名和内嵌正文不会被转换成 Date。日志前缀为 `/private/tmp/ai-importer-round4-*`。

## 第五轮：方案预览基础与阶段提交审查（2026-09-21）

- 新增限定重组范围内的段落匹配：明确既有引用、唯一原文锚点及有界顺序匹配保留正确身份和译文，原文修订清空全部译文与当前选用。重复句歧义和多对多替换保存损失范围，只有实际用户对当前方案的确认才能解除冲突。大范围匹配进入解析 Worker，主线程回退限制为 5000 段；5 万段离散修订的性能回归已通过。
- `ImportPlanService` 从一致书库快照生成并保存方案和实体 ID，计算元信息、卷章、段落及译文损失。保存前再次校验草稿版本、目标修改序号与运行代次，可与工具回执和检查点同事务保存。当前仅生成预览，不执行书库应用。
- 章节匹配使用用户选择、已有应用映射或唯一 URL；标题只产生候选。保留缺席章节、未移动的既有段落、旧内嵌正文及无关书籍设置。合章设置冲突由用户选择来源，覆盖通过既有段落引用组成的合章。
- 本次提交审查先补失败用例，再修复三项预览缺陷：自动 URL／历史映射拆章的未选部分被误列为删除；仅检查目录终页误报整本总数；卷顺序调整未反映到方案。现在未完整选择重组范围会阻止该组生成覆盖方案，完整目录须包含同一作品起始页及全部已发现分页，输出卷顺序遵循草稿且保留未涉及卷。独立复验通过。
- 补齐缺失的设置选择接口，拆分复杂函数并共用事务校验器。完整回归为 172 个测试文件、2093 项通过、5 项既有跳过；lint、类型、Fallow、SPA 构建、格式、OpenSpec 校验通过。日志前缀为 `/private/tmp/importer-commit-*`。

Electron 的补充隔离实验明确设置两个进程相同的 `userData` 和会话存储目录：第二进程仍可取得同名 Web Lock，但打开同一 IndexedDB 返回 `UnknownError`；第一进程退出后，第二进程能读到其已写记录。结果见 `/private/tmp/ai-importer-storage-process-results.json`。这是后续存储预检方案的依据，尚未接入实际执行及收尾守卫，不能作为已解决跨进程互斥的结论。

这次为阶段提交，任务计数仍为 31/66。第 7 节已有上述基础，但工具接入、完整 Worker／补齐流程验收尚未完成，保持未勾选；Agent、应用／撤销、执行互斥和工作台界面继续保留待办。

## 第六轮：原子应用、撤销与书籍执行守卫

- `BookExecutionGuard` 使用同源 Web Locks 的共享执行与短时独占提交，立即报告忙碌，支持查询执行标签及章节。无可靠锁时拒绝导入提交；普通翻译保留原有可用路径。每次受保护执行先验证实际 IndexedDB 可访问性，第二个不能访问同一工作区存储的 Electron 进程不得开始操作。
- 七个正文 AI 入口（整章、继续、单段翻译以及整章／单段润色和校对）在读取内容前取得占用，保持到外层最终保存结束；取消不会释放尚在收尾的占用。原先丢弃 Promise 的段落／标题回调改为等待保存，复用服务已有的等待机制。开始前通过只更新缓存的 `refreshBookFromStorage` 读取当前章节；不向页面的只读 computed 选择状态赋值。
- `ImportApplicationService` 的确认属于当前工作台实例，不可持久化、复制到另一实例或通过 JSON 伪造。应用事务重新校验任务、草稿、方案、目标序号及章节 ID 归属，保存前镜像后提交小说、正文、序号及回执；初次快照写入和最后回执写入失败均整次回滚。新建／更新重复请求按已保存回执返回。
- 撤销在同一独占边界内复核后续修改，恢复元信息、原卷章、原文、全部译文及当前选用；新建撤销只删除本次小说和正文，并在同一事务向最新同步配置追加墓碑。旧内嵌正文恢复原来的物理存储形式，维护缓存和索引时仍读取其实际内容。模型配置不复制进导入快照，应用／撤销保留书籍当前配置。
- 部分导入保存来源到书库实体的映射，并为既有段落引用更新目标序号；同任务再次补齐不重复章节。完整的 97／100 章和实际工具贯通验收仍留在 9.3／11.2，未以两章服务用例代替这些验收。
- 提交后维护失败保留已应用回执和待维护标识，恢复只重做派生维护。`book-commits` 启动入口发布／接收身份与序号通知，当前页和其他页只从数据库重新读取，不接收旧正文载荷；缺少 BroadcastChannel 或通知丢失时聚焦补查，刷新不再次保存书库。

原生验证使用 `/private/tmp/importer-execution-electron/probe.mjs`，结果为 `/private/tmp/importer-execution-electron-results.json`。运行时是项目 Electron 39.8.10，加载现有打包产物的主程序及 `file://.../app.asar/index.html`，再加载本轮守卫的 Vite 生产模块；包装入口只用于在启动前设置隔离的共同存储目录，不修改项目 Electron 主程序。验证了同进程另一窗口被阻止、其他书可提交、执行结束和窗口重载后可取得锁，以及同目录第二进程在读库预检时被拒绝、首进程退出后可继续。测试实例均已关闭。最终打包入口和完整 Agent 仍须随 1.3／11.6 验收，不据此新增多开限制或启用无锁的进程内降级。

本轮已具备 7.1–7.4、9.1、9.2、9.4–9.6 的服务行为及回归证据，进度更新为 40/66。3.8／9.7 仍须覆盖普通助手的书库写工具执行与实际跨页链路，8.1–8.6 的导入 Agent／工具、7.5／7.6 的工具及 Worker 贯通、工作台 UI 和最终跨模块验收仍未完成。日志前缀为 `/private/tmp/importer-round6-*`，本轮变更尚未提交。

最终验证：176 个测试文件、2115 项通过，5 项既有跳过；lint、类型、Fallow、SPA 构建、格式及 OpenSpec 校验通过。使用 `ELECTRON_BUILDER_CACHE=/private/tmp/ai-importer-electron-cache CSC_IDENTITY_AUTO_DISCOVERY=false bun run build:electron` 生成本地未签名产物成功，并在新产物上重跑上述隔离探针通过；未修改正式签名配置或发布产物。

## 第七轮：助手执行配置、导入工具与 Agent 生命周期（暂停检查点）

- `AssistantExecution` 为原有 `AssistantService` 提供显式上下文、提示词、工具集合、执行器和检查点。流式请求与摘要继续复用原循环；可在工具批次中让出并恢复剩余调用，已成功步骤不重放。完整 JSON 参数通过校验后才保存；宿主生成唯一调用 ID，兼容提供商复用原始 ID 的情况。工具轮次或上下文上限保存后暂停，不补造成功结果。
- 普通月詠拥有书库写工具时也通过 `BookExecutionGuard` 持有共享执行占用，开始前刷新当前书籍；纯只读工具不阻止导入。该接入的定向回归与普通聊天摘要回归均通过，最终跨页面产品流程仍保留在 3.8／9.7／11.2 验收。
- `ImportToolExecutor` 已接入 14 项来源、内容、草稿、书库对照、元信息搜索和预览工具。宿主固定任务与运行身份，模型不能传入任务身份、用户确认或任意脚本。目录检查可先准备，批量追加来源与完成回执同事务提交；各工具的资源／草稿副作用、结果及检查点一致保存。预览不会提前结束仍在执行的 Agent。
- 文件显式编码与历史快照参数已接通；重新检查旧快照不回退最新来源。原始输入、提取结果和分页查看继续分离。实际工具链已验证“登记 TXT → 检查 → 提取 → 草稿 → 保存方案”，书库仍为空，等待用户确认。
- `ImportAgentService` 已具备模型绑定、单运行 Web Lock、可查询的任务占用、暂停、必要小说选择时让出、检查点恢复和消息记录基础。默认开始／继续会生成有效用户消息；界面订阅异常不会让仍在执行的 Agent 提前释放锁。模型配置不复制进任务或事件记录。

按用户要求在此暂停并提交。进度为 42/66，仅新增勾选已验证的 7.5、8.1；Agent 生命周期的基本链路已有代码和测试，但问答／待办工具、跨页面暂停与重载的完整贯通、存储失败的界面反馈及工作台仍待完成。恢复时优先继续 8.2–8.6 和第 10 节；同时复核 EPUB 多 package 中非首 package 条目的正文用途标记，避免可识别正文被当作 metadata-only。

提交前全量回归：179 个测试文件通过、2133 项通过、5 项既有跳过。lint、类型、Fallow 和 SPA 构建通过；日志函数拆分后再次运行 Agent／工具定向回归。日志前缀为 `/private/tmp/importer-pause-*`。本轮未向远端推送。

## 第八轮：Electron 单实例（2026-09-22）

用户选择「同一工作区只允许一个实例」，决策 7 已由「条件成立才启用的进程内例外」改为主进程单实例锁。

- `src-electron/single-instance.ts` 的 `claimSingleInstance` 在 `pie.initialize` 之前调用 `app.requestSingleInstanceLock()`。未取得锁的进程请求退出，并跳过 puppeteer 初始化和 ready 后的启动流程；主实例在 `second-instance` 时还原、显示并聚焦工作台，窗口已关闭或销毁时重新创建。锁按 `userData` 目录区分，不同 `--user-data-dir` 的实例互不影响。开发模式以脚本路径启动 Electron，默认 `userData` 为 `Electron` 目录，与正式版的产品名目录不同，推断不会与已安装正式版互相拦截，未另行实测。
- Electron 由此只剩一个进程，导入运行锁、书籍执行占用及应用／撤销独占直接使用同源 Web Locks，不再建无锁的进程内互斥；受保护执行前的 IndexedDB 预检保留为兜底。
- TDD：`electron-single-instance` 的 5 项用例（未取得锁即退出、取得锁后监听、最小化时还原、未最小化只聚焦、窗口关闭／销毁后重建）先因模块缺失失败，再实现转绿。

产物实测：使用 `ELECTRON_BUILDER_CACHE=/private/tmp/ai-importer-electron-cache CSC_IDENTITY_AUTO_DISCOVERY=false bun run build:electron` 生成本地未签名产物，脚本 `/private/tmp/importer-single-instance-probe.mjs` 通过主进程 `--inspect` 读取 `BrowserWindow` 状态，隔离目录为 `/private/tmp/importer-single-instance-{a,b}`，未使用用户书库。结果 `/private/tmp/importer-single-instance-results.json`：同目录第二实例以 0 退出，最小化的主工作台被还原且窗口数仍为 1；关闭工作台后主进程存活，再次启动由主进程重建工作台；不同目录的实例正常运行。测试实例均已关闭。

结合第三轮的 Worker／受限回退、第六轮的同进程窗口互斥、窗口重载后重新取锁和存储预检，任务 1.3 标记完成，进度 43/66。8.4 按修订后的验收继续实现。全量回归 180 个测试文件、2138 项通过、5 项既有跳过；lint、类型检查和 Fallow 通过。本轮未提交。

## 第九轮：Agent 工具校验、问答让出与运行回收（2026-09-22）

- 工具参数改为按完整定义校验（`import-tool-arguments.ts`）：整数、数值范围、数组长度、嵌套对象必填与枚举；声明了字段的对象拒绝未知字段，错误信息带字段路径（如 `operations[0].title`）。越界参数在执行前返回 `INVALID_ARGUMENTS`，草稿不变。
- `ask_user`／`ask_user_batch` 以普通助手的参数定义接入导入工具集，但不走阻塞等待界面的原 handler：执行器把问题（工具名、题目、候选、自由输入限制、当前范围版本）保存为 `pendingQuestion` 并让出，调用留在检查点。`ImportQuestionService.answer` 只接受当前任务、当前问题 ID 与范围版本的完整回答；取消（不调用）、部分回答、其他任务或旧问题的回答都不解除等待，不在候选内的回答在禁止自由输入时被拒绝。恢复时补入与普通问答相同格式的工具结果并移除问题，之前已成功的工具不重放。导入问答从不读取书籍级「跳过提问」设置，普通问答不变。
- 已回答但尚未补入结果的问题不再阻止继续执行（`awaitingImportAnswer`）；方案预览和应用仍对任何待处理的必要问题保持阻止。
- 待办工具沿用普通助手的名称与参数，数据写入导入任务的 `todos`（含状态与时间），与工具回执同事务保存；完成或删除后自动推进下一项，与普通助手一致。不写全局待办。
- `ImportAgentService.recover` 在取得任务锁后才把遗留的 running／pausing 转为可继续（作废旧运行代次、清理流式片段，意外中断记 `INTERRUPTED`）；锁被其他页面持有时只观察。`pause` 在本页没有执行者时轮询回收，等其他页面在下一步骤前停止；遗留运行可直接暂停。页面加载时由工作台对 running／pausing 的任务调用 `recover`（第 10 节接入）。
- 提示词补充提问与待办的使用约束。

TDD：参数校验、问答让出／回答／恢复、批量问答、跳过设置、待办、回收与其他页面暂停的用例先失败再转绿。其他页面置为暂停后运行页停止、暂停时迟到的工具结果不写入且恢复后只执行一次、上下文上限暂停、提示词与工具集合边界这几项在现有实现上直接通过，保留为回归用例。

8.2–8.6 标记完成，进度 48/66。8.4 的 Electron 部分依赖第八轮的单实例锁；导入运行的第一步即写 IndexedDB，第二个进程在此失败，不会发起模型请求。全量回归 181 个测试文件、2150 项通过、5 项既有跳过；lint、类型检查和 Fallow 通过。

## 第十轮：工作台界面、存储失败反馈与浏览器贯通（2026-09-22）

- 存储与清理（2.5）：导入任务的写入经 `ImportStorageStatus` 包装，存储错误（配额、UnknownError 等）转为 `STORAGE_FAILED` 并在当前页记录「尚未可靠保存」，同任务下一次写入成功后清除；业务错误不受影响。删除任务同时清除撤销记录，但仍有待补维护的已应用操作时拒绝删除（`MAINTENANCE_PENDING`），已导入小说与修改序号保留。
- 9.3 与 7.6 以验收用例补齐：97／100 章部分导入、期间新增译文、再补齐 3 章不重复章节且不清空译文，新的服务实例可辨别已提交与未提交；匹配计算期间取消不保存迟到方案，主线程回退超出匹配上限明确失败。实现沿用第六轮，未改动。
- 工作台（10.1–10.6）：`/import/:taskId?` 路由、dispatcher 与三变体；桌面侧栏、平板图标栏新增入口，手机保留底部五项、从侧边菜单进入；导入路由即使展开聊天也激活导入入口。`useImportWorkspaceStore` 统一任务列表、选择、增量事件、运行状态和存储状态，一次性初始化会回收中断运行，快速切换时丢弃旧加载，运行归属于发起任务；BroadcastChannel 通知其他页面刷新。页面组件包括任务列表、状态栏、来源（添加／列表／内容查看）、草稿（元信息、候选与写入选择、目标、卷章编辑）、章节正文检查、方案（摘要、冲突处理、确认、导入记录与撤销）。
- 聊天外壳（10.5）：`useImportChatPanel` 把任务事件映射成月詠消息与操作记录（来源名称与实际结果、问答与待办徽章），复用 `ChatMessageList`／`useChatPanelBindings`；布局的聊天槽位按路由选择导入外壳或原组件，三个原聊天组件未改动。回答必要问题或选定小说后，已配置模型时自动继续运行。
- 浏览器验证中发现并修复：`unplugin-auto-import` 的 PrimeVue 解析器把 `import-zip.ts` 中的全局 `new DataView` 改写成导入 PrimeVue 组件，导致真实应用中所有文件解析失败（Vitest 不经过该插件，未能发现）。改为过滤与运行环境全局同名的标识符，并加 `auto-imports-builtins` 回归测试。另修复：模型服务整页 HTML 错误原样写入任务并充满界面（改为保留状态码与标题的简短说明）；聊天操作记录因消息缓存不刷新而一直显示「进行中」；只调用工具的回复显示「（月詠施术中）」；已应用方案仍提示「过时」。
- Fallow：拆分超出认知复杂度的模板组件；组件直接使用 store 以便追踪；`showSource` 的读取逻辑移入 `ImportPreviewService.source` 并补测试。CI 门禁在改动范围内无问题。

浏览器端到端（隔离 profile、模拟模型服务）：新建任务 → 登记两个 TXT（显示尚未读取）→ 检查、提取、编辑草稿 → 提问并在工作台回答（自动继续）→ 生成方案（新建 2 章、不清空译文）→ 确认导入（书库出现小说）→ 撤销（小说与正文删除）；刷新后待回答问题与任务状态保留；手机 375、平板 1103、桌面宽度下页面可用。测试数据已清理。

仍未完成：10.7 的真实触控与旋转检查、3.8／9.7 的跨标签页实测和第 11 节。进度 57/66。全量回归 186 个测试文件、2183 项通过、5 项既有跳过；lint、类型检查、Fallow、SPA 构建通过。
