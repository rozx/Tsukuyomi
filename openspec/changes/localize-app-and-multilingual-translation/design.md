# Design

## Context

动机与确认范围见 [proposal.md](proposal.md)。当前有以下实际约束：

- `src/boot/i18n.ts` 在 boot 内创建实例，固定简中、英文 fallback；仅思考态文案使用 i18n。Quasar 和 HTML lang 固定简中，PrimeVue 未绑定语言。
- `useSettingsPage.ts` 以稳定 `savedIndex` 保存标签页，`AppSettings` 通过 IndexedDB 与 Gist 同步。新增「通用设置」不能重排旧的持久化编号。
- `Paragraph` 已有 `translations[]` 和单一 `selectedTranslationId`；卷章标题、术语、角色、别名各只有一个 `Translation`。`Translation` 没有语言字段。大量调用直接读取 `.translation.translation`。
- `ToolRegistry` 返回模块级工具定义；普通助手和 AI importer 有不同的执行路径。翻译、单段任务、术语任务、runner 状态消息、压缩摘要、工具反馈都各自生成文本。
- `TodoWorkflow` 把预定义说明存为文本，且从带 `原文:` 标签的 chunk 文本反向提取段落预览。直接翻译标签会破坏该解析。
- `isSymbolOnly` 仅识别 ASCII 与部分 CJK，其他文字可能被当作装饰符号跳过；检索关键词抽取也偏重 CJK/ASCII。中文标点规范化会作用于所有译文。
- AI importer 已支持通用网址、文件、文件夹及原文引用；真正写入在 `ImportApplicationService` / `import-application-persistence`，不一定经过普通 `BookService` 创建路径。预览操作可持久化且支持幂等应用和撤销。
- 帮助页面与 AI 工具各自加载同一份简中索引；标题文本生成章节锚点，首页主题还用中文关键词寻找文档。
- 章节向量包含原文和选中译文，别名索引含译名；仅过滤 prompt 不足以消除其他目标语言的参考内容。

## Goals / Non-Goals

**Goals:** 提供一个有类型的语言定义、一套有明确语言参数的译文读写入口，以及可固定语言的 AI 执行上下文。所有数据入口采用相同兼容规则；页面、导出、完成度、工具和检索使用同一语言解析结果。

**Non-Goals:** 不新增来源语言检测服务、目标语言之外的语言选项、全新爬虫或存储架构；不自动翻译用户历史消息、自由文本、旧译文或历史日志。不在界面语言变化时批量翻译小说。

## Decisions

### 1. 两个独立语言值与一个执行快照

统一 `AppLocale = 'zh-CN' | 'zh-TW' | 'en-US'`，界面语言称 `uiLocale`，书籍持久化字段称 `targetLanguage`。书籍目标语言不从全局 locale 动态推导。

```text
System locale --> Initial UI locale --> Synced preference
                          |
                          +--> UI / Help / New AI execution language
                          |
                          +--> Actual book creation --> Book target language
                                                        |
                                   Book settings -------+
                                                        |
                                              New task snapshot
                                                        |
                                       Target-language reads and writes
```

启动优先读取有效的已保存偏好；没有偏好时，依次匹配系统首选语言：zh-Hant / zh-TW / zh-HK / zh-MO 为繁中，zh-Hans / zh-CN / zh-SG / 裸 zh 为简中，任意 en 为英文，均不匹配回退简中。`AppSettings.uiLocale` 仅保存用户手动选择或同步得到的有效偏好，系统匹配结果作为内存中的有效语言，不伪造一个已选择值。普通设置合并任一侧缺少 uiLocale 时保留另一侧的有效偏好，即使缺失侧因修改其他设置而拥有较新时间；双方都有有效值时沿用现有设置冲突优先级。手动选择通过正常设置更新路径推进编辑时间。收到同步偏好后直接刷新界面，不重建页面状态。

设置增加「通用设置」作为首个可见标签，以新的稳定编号 `10` 保存，不复用既有编号（0–4、6–9 在用，5 为历史保留值，见 `useSettingsPage.ts:74`）。首屏产品文案等待设置 hydration 完成后再渲染，使已保存语言从第一帧起生效；加载期间可以显示不依赖文字的启动占位。`settings.ts:168` 的 localStorage 仅为旧版本读取回退，当前设置保存只写 IndexedDB，它不是持续更新的镜像，本变更不新增第二份语言偏好存储。启动 hydration 完成前不开放创建书籍/AI 执行入口，防止先使用临时默认值；读取失败时按既有错误处理结束加载并使用明确的系统匹配回退，不能永久停在启动占位。Electron 在渲染进程使用同一偏好解析；主进程用户可见文案通过窄 IPC 获得已验证语言值，启动早期采用系统匹配，不把 Pinia/IndexedDB 引入主进程。

已考虑让界面语言直接决定每次阅读和翻译；按用户最终决定弃用，因为同一本书应拥有独立、稳定的目标语言。

### 2. 三套完整资源和按用途使用的翻译入口

在 `src/i18n/<locale>/` 按 common、navigation、settings、books、reader、import、chat、sync、errors、ai/prompts、ai/tools、ai/todos 等功能拆分，顶层聚合。资源使用语义 key 与具名参数，UI 文案与 AI 长提示词分别命名但共用 locale 类型和完整性检查。简中为缺失 key 的运行时 fallback；发布检查必须阻止项目自有词条缺失，不能用 fallback 冒充完成翻译。

Vue 内使用响应式 `t`/computed，常量菜单保存 key 或在 computed 中构造；服务层使用显式传 locale 的无 Vue/Pinia 依赖翻译适配器。组件库、document lang、日期数字格式同步更新。保留用户输入、品牌名、URL、模型 ID、协议字段、状态枚举、代码示例中的语法和开发日志；用户可见错误的外层说明本地化，第三方原始错误作为诊断详情保留。

AI 模板包含 JSON 花括号、`@`、竖线、正则等，需要使用明确的模板转义/具名参数，不能把代码片段直接交给消息语法误解析。

**模型可见文字保持简中单源（实施中修订）。** 按阅读者划分 AI 文字，而不是按资源文件划分：
- 仅模型阅读：系统提示词、翻译/导入规则、状态机提醒、上下文标签、压缩摘要指令、工具描述与嵌套参数说明、工具 JSON 返回中的说明文字。统一用简中书写并通过单一 `agentText()` 入口读取，不提供繁中/英文版本。界面语言与书籍目标语言以**参数值**写入指令（例如「用{dialogLanguage}回复用户」「译文使用{targetLanguage}」），不作为查找语言。
- 仅用户阅读：任务面板状态/重试/取消、toast、导入问题与任务名、修复预填说明、系统生成的 todo、帮助正文。继续三语言本地化并使用执行快照的界面语言。
- 双向投影：`LocalizedError` 与 `ImportFailure.localization` 保存 key 与参数；返回给模型时投影为简中，展示给用户时投影为界面语言。

理由：维护三套提示词会在语言之间产生偏差。实施中的协议一致性检查已发现实例（简中说明写错参数名 `translationOnly`，英文说明遗漏 `search_memories` 指引）。模型能理解简中指令并按要求语言回复；单一来源让提示词调优只需做一次。

回复语言与人格：英文对话由简中指令要求使用中性专业英文，不做角色化；简繁对话保留月詠人格。人格选择依据回复语言，与小说目标语言独立。

已考虑运行时在线翻译 UI 或让各组件自建词表；不用这两种方式，以便离线、审校和缺失检测保持确定性。

### 3. 保留段落历史，增加语言选择；单值译名按语言保存

段落继续使用一份 `translations[]`，每个 `Translation` 增加 `language`。每种语言保存各自的选用 ID。卷章标题、术语、角色和别名增加按语言保存的单值译名映射，不额外引入它们从未有过的版本历史。

建议数据形状如下；实现时集中定义类型和归一化，不能各处自行拼装：

```ts
type SyncRevision = { counter: number; actorId: string };
type LocalizedSlot<T> = { value: T | null; revision: SyncRevision; updatedAt: number };
type LocalizedMap<T> = Partial<Record<AppLocale, LocalizedSlot<T>>>;
// Translation.language: AppLocale（旧输入可缺失，进入运行时后已归一化）
// Paragraph.selectedTranslations: LocalizedMap<string>
// Title / Terminology / CharacterSetting / Alias.translationsByLanguage:
//   LocalizedMap<Translation>
```

`null` 明确表示清空，缺失 key 表示没有该语言数据；这样同步时能区分删除和另一台设备尚未产生过。语言槽的逻辑版本和展示时间只在该槽实际修改时更新，不能因切换书籍目标语言推进。槽值按 `(counter, actorId)` 的固定顺序裁决，不能以本地/远端/主方身份打破平局；`updatedAt` 仅用于展示和审计。不同语言槽分别合并。具体版本和迁移规则见 §9a。

过渡期旧 `selectedTranslationId` 和单数 `translation` 保留为固定简中的兼容投影，统一由归一化/持久化边界生成，绝不随当前书籍目标语言变化。`selectedTranslationId` 必须始终持久化为字符串（无简中选用时为 `''`，不能省略或写 `undefined`）：`ImportLibraryReader` 的严格校验要求该字段为字符串，否则整章判为损坏并阻止导入（`import-library-reader.ts:26`）；本变更不移除该投影。新字段存在时优先使用新字段；无语言的旧段落版本标为简中；无新映射的旧单值译名填入简中槽。迁移保留 ID、内容、引用记忆、版本顺序和原选用。迁移展示时间取已有对象编辑时间或稳定的 epoch，不在读取时制造新时间；逻辑版本使用确定性的 legacy revision，不能在读取时分配新版本。

译文相同内容去重也必须限定语言；例如相同姓名或已经是目标语言的段落，不能复用另一个语言标记的版本。`translation-tools.ts` 的已有译文查找及无变化判断都须接入目标语言。

同一语言的段落版本删除与选用只能影响该语言；删除当前版本后，按既有版本选择行为在同语言内回退，无同语言版本则选用为空。显式清空某语言的译名写入 null，其他语言槽保留。删除整个术语/角色/别名按 §9a 的删除协议作用于所有语言；清空某个语言槽不等于删除实体。

全部展示和写入经过统一 helper：读取必须有目标语言，写入必须有执行或编辑操作捕获的目标语言。避免保留一批无语言参数的旧 helper，让漏改调用默默读简中。

已考虑把每种语言复制为整本书或完全替换所有旧字段；前者破坏共享原文/角色身份，后者使旧备份和同步兼容过于脆弱。采用增量字段，并用一致入口约束兼容投影。

### 4. 阅读、编辑、完成度、导出和上下文采用同一目标语言

阅读段落缺少当前目标语言译文时显示原文，状态仍为该语言待翻译；卷章标题回退原文。术语、角色和别名译名字段缺失时显示空白，原始名称仍显示在其原文字段。历史版本可保留全部语言并标注，但选用/编辑不得把其他语言版本指定给当前语言槽。

已翻译统计、未翻译批次选择、校对/润色是否可用、搜索替换、复制、章节导出（txt / json / 剪贴板，译文与双语类型；现有代码没有 EPUB 导出，本变更不新增）均使用书籍目标语言；英文没有译文时不能因为存在简中版本就跳过翻译或润色简中。阅读导出缺失处使用与阅读相同的原文回退；备份导出则保存所有语言数据。

用户打开编辑表单时捕获语言；保存时校验目标语言是否已变化，变化则提示重新打开，不能把旧表单中的简中内容写入英文槽。AI 写入按任务快照归属语言，晚到的英文结果不改变用户已切到繁中的显示与选用。

### 5. 原文不限语言，格式化尊重目标语言

模型在已有翻译调用内按段落判断语言，不新增独立识别请求或书籍必填字段。段落已是目标语言时经相同段落 ID 提交原样内容，保存目标语言版本并计为已处理；简繁视为不同目标，不能因都是中文而原样通过。混合段落翻译需要转换的部分并保留已是目标语言的内容。

去掉提示词、解释任务、术语/角色 schema 中对“原文必为日语、译文必为中文”的限制；日语敬语指导改为仅对实际日语片段适用，译名与标点遵循目标语言。全角中文标点规范化仅适用于简繁译文；英文不执行中文引号/破折号/空格转换，原文回退也不经过译文规范化。

同一规则还必须覆盖写入阶段：`terminology-service.ts`、`character-setting-service.ts`、对应 AI 工具和 `character-tool-helpers.ts` 当前直接调用 `normalizeTranslationQuotes`，会把英文句点和引号等转为中文并落库。这些入口应按本次写入的目标语言处理，英文保存时保留英文标点；不能只在阅读导出层修正。`character-setting-service.ts` 的 `aliasData.translation || aliasData.name` 原名回填也必须移除：缺失译名与显式清空都不能填入原名，已保存的其他语言译名保留。修改与清空按语言槽处理，省略更新字段表示保持原值，显式空白表示清空该语言译名。

工具层提交校验同样按目标语言分支，而不仅是提示词：`detectMissingQuoteSymbols` 目前对「」『』原文只接受「」『』或弯引号，明确拒绝 ASCII `"`，且结果是 `kind: 'failed'` 硬失败（`translation-tools.ts:128`、`:1147`），会阻止正常的英文对白提交。引号规则改为按目标语言选择：en-US 接受 ASCII 与弯引号成对；简繁保持现有规则。长度比例（<0.3 / >3，仅警告，`:1129`）按目标语言调整阈值，避免日→英普遍触发“过长”。「译文与原文相同，请检查翻译完整性」警告（`:1113`）改为提示“若该段已是目标语言可原样提交”，不再诱导模型改写已是目标语言的段落；“与当前选中版本相同”的拒绝规则限定同语言选用。

审计文字判断、检索/替换边界与字符切片：字母/数字判断覆盖 Unicode 文字，不把阿拉伯文、泰文、西里尔文字等作为纯符号跳过；保留既有 CJK 标识符逻辑，增加通用 Unicode 词元回退。来源正文仍由现有 importer 引用和分段处理，原始字节/偏移规则不因本地化改变。非已支持编码仍走明确指定编码的路径。

### 6. AI 执行上下文显式携带两种语言

执行启动时捕获 `{ uiLocale, targetLanguage }`。所有异步步骤、分块、重试、自动压缩继续、工具调用、回调和最终保存共用它。

语言快照的持久化范围以实际可恢复的执行为准：只有 AI importer 的执行把 checkpoint 写入 IndexedDB 并可跨重启续跑（`import-agent-journal.ts`、`import-agent-service.ts:361`）。普通助手的暂停 checkpoint 仅在内存中返回（`assistant-service.ts:735`），会话内继续时沿用原快照；翻译/润色/校对的 task-runner 与单段任务没有暂停/重启恢复路径，快照只需存活于本次内存执行，本变更不为它们新增恢复能力。importer checkpoint 只记录 `uiLocale`（新书目标按 §8 在最终应用时决定，更新已有书沿用该书字段），缺失时按原简中语义恢复。新助手消息启动新的执行并读取当前界面语言；没有书籍的独立术语翻译使用启动时界面语言作为目标。来源工具无目标书籍时不虚构书籍目标。

覆盖普通助手、AI importer/配方修复、翻译、单段/批量润色与校对、解释、术语任务、上下文构建、runner 和状态机的反馈、总结/压缩、重试与续跑消息。`ToolRegistry` 返回简中单源的不可变工具定义，不原地改全局数组；handler 上下文仍传入执行语言快照，用于目标语言数据读写、帮助正文选择及用户可见输出，工具返回给模型的说明固定简中。模型不能通过提交语言参数把结果写入另一语言槽。按 ID 操作译文的工具同样受限：`select_translation` 目前在全部版本中查找后直接设置选用（`paragraph-tools.ts:1505`），`update_translation`、`remove_translation` 亦接受任意 `translation_id`；它们必须拒绝语言与执行目标不同的版本 ID，`get_translation_history` 只返回目标语言版本。

将 todo 的段落预览输入改为已有结构化段落数据，不再解析本地化的 `原文:` 字符串。预定义 todo 在执行语言下生成并保存文本及语言；既有 todo、用户/模型创建的自由文本保留原文，新生成说明使用快照语言。状态 gate 仍按 ID/状态/阶段工作，禁止依赖翻译后的显示字符串。

目标语言改变后，已启动任务继续旧目标语言，但写入必须基于最新对象局部合并，不能回存任务启动时整本书快照，避免撤销新目标语言或覆盖其他语言成果。

### 7. 上下文语言隔离延伸到工具与检索

上下文 helper、前后段落工具、章节查询/全文读取、标题、术语/角色查询和检索别名仅暴露原文与执行目标语言译文。字段缺失明确为空，不使用 UI locale 或其他语言译名兜底。自由文本指令、人物描述、说话风格和剧情记忆是共享数据，保留原语言；系统提示词说明其内容可跨语言理解，但其中其他语言的译法不能覆盖当前目标。

章节向量沿用现有单份按章缓存，增加其构建目标语言及内容签名。构建输入仅含原文与该语言选用译文；标题、关键词和别名索引使用同一语言。切换书籍目标语言使不匹配缓存失效，并通过现有队列重建。异步计算在开始时捕获语言及输入签名，提交前复核，过时结果不得覆盖已经按新设置重建的向量；查询对不匹配语言返回可理解的重建状态，不能使用旧向量片段。仍在旧语言下执行的任务若缓存已切换，使用现有原文/同语言读取工具继续。共享记忆向量不随目标语言清空。别名索引没有缓存，每次查询由 `buildBookAliasIndex(book)` 现算（`chapter-embedding-service.ts:158`、`:801`），只需改为接收执行目标语言参数。

全文索引是第二个语言无关的持久派生缓存：`full-text-indexes` 存储的 `IndexDocument.translations` 汇集段落全部版本（`full-text-index-service.ts:193`），章节标题译文也直接取单值。`find_paragraph_by_keywords` 的 `onlyWithTranslation` 会把任一语言版本视为已翻译，`batch_replace_translations` 以 `searchInTranslations` 命中后再用 `evaluateKeywordMatch` 遍历全部版本（`paragraph-tools.ts:2496`），英文任务可能改写简中版本。索引文档改为按语言标记译文，查询按执行目标语言过滤，`onlyWithTranslation` 意为存在目标语言选用；替换只写目标语言选用版本。失效入口已存在（`maintainChapterContent` → `invalidateIndex`），另需在书籍目标语言变化时失效。

已考虑立即维护三套完整章节向量；当前选单份带语言签名的缓存以限制存储和后台工作。只有出现实测并发检索需求再扩展，不在此变更中更换 embedding 模型或排名公式。

### 8. 真正创建书籍时锁定目标语言

普通创建、站点添加和 AI importer 的最终持久化边界都必须取得已加载的有效界面语言。AI importer 的任务创建、Agent 运行和草稿预览均不能提前锁定新书目标。

最终确认显示将采用的目标语言；真正写入新书的事务需要把 `settings` 加入现有事务范围，读取有效的持久化偏好；若仍无偏好，则使用宿主捕获的系统匹配值，并在该事务复核偏好仍缺失。`ImportPlan.book` 在预览时已创建临时对象，不得把它提前归一化出的简中默认值当成最终语言。确认后到提交前若偏好改变，刷新语言说明并要求确认更新后的结果；已应用回执记录实际语言，幂等重试返回原回执，不重新读取新语言改写已有书。对已有书的更新、从完整备份恢复的书籍及同步下载不能经过“新书缺省值”路径；分别保留书籍字段或按旧数据归一化简中。`booksStore.addBook` 同时服务于新建与非新建：新建书弹窗 `useBookImportActions.ts:28`，以及书籍 JSON 导入（`useBooksPage.ts:276`，换新 ID 但携带原数据）、撤销删除 `onRevert`（`useBooksPage.ts:426`）、Gist 冲突恢复（`useGistUploadWithConflictCheck.ts:147`）。因此界面语言缺省值只能在 `buildNovelFromFormData` / 站点添加等真正新建的调用方设置，不能放进 `addBook`、`saveBook` 或归一化；归一化对缺失字段一律取简中。

AI importer 的读取器刻意绕过 loader 读原始记录（`import-library-reader.ts:63`），应用事务又以 `canonicalStringify` 比较事务内原始书籍与预览快照（`import-application-persistence.ts:211`），撤销可用性也比较章节正文与 `saved.after`（`:252`）。若只把快照归一化，未迁移的旧书将永远判为 `PLAN_STALE`。比较两侧必须使用同一归一化结果（或都为原始记录），应用时写入归一化形状，`saved.after` 记录实际写入内容。

导入重组在原文不变时保留所有语言版本和选用，原文变化时清空所有语言版本与选用；预览统计全部被清空版本。撤销快照、恢复、书籍指纹、update recipe 比对和应用后的草稿 rebasing 均保留新增字段。

### 9. 同步与兼容入口集中归一化

统一归一化用于 IndexedDB 读取、正文懒加载、书籍 JSON 导入、备份恢复、Gist 解析及 AI importer 读取已有书。首次读取归一化幂等，正常写回时持久化新字段；不在启动时一次加载全部正文，也不把纯读迁移标为用户编辑。`maintainChapterContent` 直接用数据库原文 `JSON.parse` 回填正文缓存（`chapter-content-maintenance.ts:34`），绕过 loader，也必须经过同一归一化。`settings-parsers.ts` 明确白名单复制可选字段，必须新增 uiLocale，避免备份导入时静默丢失。`sync-strip.ts` 必须遍历新增语言槽内的 Translation 并继续剥离本地 memoryScoreBreakdown，不因新嵌套形状把本地诊断数据纳入同步哈希。导出/同步使用同一确定性格式，避免同一数据在两个设备反复变 hash。

设置 locale 跟随现有 AppSettings 冲突规则。书籍 targetLanguage 跟随书籍设置冲突规则；段落结构裁决保持现有基准规则。原文相同才按 ID 合并各语言版本，再独立合并各语言选用槽；标题原文相同才逐语言合并标题译名。语言槽使用 §9a 的确定性逻辑版本，包括段落选用和标题槽，不再以主方优先解决槽冲突。有效选用必须指向同语言的存活版本。

当前 `mergeUniqueById` 对同 ID 取主方，但追加副方独有实体，主方为空时直接返回副方，因此术语/角色本来就缺乏可靠删除传播。此次由书内实体合并器替代这两类调用；别名不再以 name 作为长期身份或简单取并集。其余 book、chapter、memory、model、cover 的既有冲突规则及删除保留期暂不重构。

### 9a. 书内实体的身份、删除和确定性合并

**身份与数据形状。** 术语和角色保留现有 ID；别名增加独立 UUID，改名保留 ID。身份作用域为 `(bookId, kind, parentId?, id)`；别名记录其所属角色身份，不能因为名字相同自动移到另一个角色。删除记录放在 Novel 的 `entityTombstones` 中，以身份键索引 `{ revision, deletedAt }`（payload 内省略由所属书籍确定的 bookId，复制为新书时身份作用域随书籍改变），不能只挂在会被删除的角色对象里。书籍 payload 承载记录并参与内容哈希，不为每个别名创建 manifest 文件。实体删除不受当前 targetLanguage 限制；原文名称/描述/说话风格等共享字段继续属于同一个实体。

**逻辑版本。** 新增仅本机使用的 IndexedDB `sync-metadata` store，保存安装实例的随机 actorId 和单调计数器（升级现有 DB version；当前为 13）。actorId 与计数器不进入共享 AppSettings、云同步或可移植备份，另一设备恢复备份不得继承它们；同机多标签页共享事务保护的计数器。每次本地实体或语言槽变更，在写事务内取 `max(localCounter, allObservedCounters) + 1`；将版本、业务值和删除记录一起提交，失败全部回滚。收到远端版本必须在允许下一次编辑前推进本地已观察计数器。字段未改不分配新版本。

实体仍保留现有平面 `name`、`description`、`sex`、`speakingStyle` 等字段，增加对应 `fieldRevisions`，避免重写所有消费者；清空共享字段保存明确 null/空值及版本，省略 patch 字段表示不修改。各语言槽自身保存 revision。非删除字段冲突按 `(counter, actorId)` 字典序取最大版本，因此不依赖机器时钟或哪边先同步；不同字段修改和不同语言修改均可合并。同一业务值和 revision 的重复记录若仅审计时间不同，取最大的审计时间；同身份多份 tombstone 选取最大 revision 的记录，版本也相等时取最大 deletedAt，使审计元数据也与合并顺序无关。相同 revision 必须代表相同值；若遇到同 revision 不同值，报告数据冲突并停止该书合并，不静默选择本地一侧。最终集合按稳定 ID 排序、固定序列化，避免同一集合因数组遍历顺序不同产生不同哈希。

**删除与恢复。** 删除一个 ID 时，移除活动记录并原子写入 tombstone；一旦该身份存在 tombstone，其任何普通更新都不能使它重新活动，即使更新的 counter 或机器时间更大。角色 tombstone 同时阻止其所有旧身份子别名回流，无需逐条重复记录。界面、AI 工具、批量导入与晚到回调必须先检查身份，不能将已删除 ID 当作 upsert。清空某个语言译名则只写该语言槽的 null 和新 revision，不产生实体删除。明确撤销删除/重新添加通过新 UUID 恢复内容，旧 tombstone 保留；恢复角色时子别名也分配新身份，恢复映射在操作回执中固定以便重试幂等。

**合并顺序和不变量。** 先合并并保留双方 tombstone，再过滤被删除的实体及已删除父角色的子项，最后合并存活同 ID 的字段和语言槽；独立新 ID 都保留。合并对有效数据必须满足交换律、结合律、幂等性，并验证三副本、多种到达顺序及重复投递。两台设备独立新增同名但不同 ID 的别名时保留两条并报告同名冲突，编辑/删除按 ID 处理，不能按名称偷偷合并身份。需要兼容旧的按名字工具调用时，仅在名称唯一匹配时解析为 ID；不唯一时返回明确歧义错误。完整别名数组更新按 ID diff 识别显式移除并记录删除，省略 aliases 字段不删别名。

**旧数据迁移。** 已有角色/术语 ID 不变；缺少 ID 的旧别名按 `(bookId, characterId, 原始 name)` 的版本化确定性哈希生成带 legacy 命名空间的 ID，不能用数组下标或每机随机值。名字精确匹配，不折叠大小写/Unicode 形式；哈希仅用于第一次赋予身份，后续改名不重算。重复同名旧别名归并为同一 legacy 身份，各字段采用确定性 legacy revision（counter=0，actorId 由字段值的稳定摘要派生），冲突可见；已有原始 ID 的数据不再按名字去重。没有 revision 的旧字段与旧语言槽也采用相同 legacy 规则，任一真实新编辑的正 counter 均高于 legacy 值。旧记录若在升级前已分歧到不同名字，不能推断它们是否是同一次改名；保留候选并提示检查。升级前从未记录的删除无法重建，不编造 tombstone。非法 actor/counter/重复 ID 形状应拒绝或隔离，不把损坏数据视为旧格式。

**保留期。** 新书内 tombstone 在书籍数据中长期保留，不沿用现有 manifest/memory 的 90 天 TTL。当前没有全副本确认机制，不能只因经过一段时间或完成一次同步就修剪。书籍存在期间，普通同步、备份、恢复和强制覆盖都必须保留已知 tombstone；删除整个书籍仍采用原有书籍删除协议，本次不承诺修复该外层协议的保留期问题。

### 9b. 备份恢复、强制覆盖及协议升级

普通读取、完整备份在空库往返和普通同步保留现有 ID、revision、语言数据和 tombstone。用户显式恢复到过去修订或覆盖已有书籍时，可见数据仍按所选快照完全覆盖，但实体协议元数据不能倒退：保留已知书内 tombstone；被恢复替换掉的现有实体记录删除；所选快照里的术语、角色及别名作为新实例分配新 ID 和新逻辑版本，所有结构化引用和父子关系按同一映射更新，本次范围内的段落选用与标题语言槽也分配新逻辑版本以表达明确恢复。历史聊天/用户自由文本不做字符串替换。AI importer 对自身一次应用的撤销仍受无后续修改约束；其原样保留且从未删除的实体不必重建身份，若涉及已记录删除的身份则使用同一明确恢复规则。原始快照作为恢复来源保留，实际新身份与映射写入操作回执，同一次操作重试不得反复生成 ID。恢复结果不得在下一次正常同步中被旧 tombstone 删除；失败回滚恢复业务数据及删除元数据，逻辑计数器允许前进但不得回退重用版本。

强制推送仍以本地可见内容为准，但必须读取目标书籍的远端删除/版本元数据：保留双方已知 tombstone，为远端存在而本地明确排除的实体补删除记录；本地希望保留却已被远端删除的身份通过显式覆盖语义生成新 ID。为目标快照字段分配高于已观察版本的新 revision，使之后到达的旧快照不能撤销本次明确覆盖。协议元数据预处理和稳定 ID 映射归属于同一次可重试操作，不能在每次 PATCH 重试时生成新身份。对不兼容或读取不完整的远端不执行写入；不把远端业务内容自动并入本地期望快照。

manifest schema 升至 4，书籍 payload 中保存 `entitySyncVersion: 1`；正常同步、强制上传、历史修订恢复及导入读取均先检查可支持的协议。schema 1–3 数据按集中归一化迁移后与新模型合并，首次写回以单次 PATCH 发布 v4 manifest 和全部需要升级的书籍文件；部分书籍读取失败不能声称升级完成。数据哈希相同也不能跳过必要的版本升级；升级读取不能依赖 knownRemoteHashes 省略尚需归一化的书籍。发现未来版本须中止，不能当成 legacy 或损坏 manifest 重建并覆盖。

已发布旧客户端的普通同步已有 schemaVersionTooNew 检查，但当前强制推送只取 remoteFilesSnapshot，未检查该标志（`useSyncExecutor.ts:986-1000`）。本变更修正升级客户端的全路径门禁，无法远程修改已安装旧程序或撤销其 Gist 写权限。部署要求先升级所有参与该 Gist 同步的设备，再启用 v4；这项限制写入升级说明。未遵守协议的旧版强制覆盖无法由客户端协议防止，不宣称绝对向后写兼容。

**后续独立工作。** 全面统一同步冲突策略、书籍/记忆既有 TTL、条件写入并发保障、全副本确认与 tombstone 压缩，留到之后的同步机制整理。本次仅修复书内实体、多语言槽和它们必需的恢复/版本门禁，不引入通用 CRDT 框架。

### 10. 帮助指南和稳定导航

保留现有 `public/help/*.md` 为简中兼容路径，增加 `public/help/zh-TW/`、`public/help/en-US/`，三套目录元信息均有相同文档 ID。16 篇指南全部翻译；历史日志继续指向原来的 releaseNotes 文件，其标题/简介/分类的固定文案本地化。

页面和 AI 工具共用一个按 locale 解析文档资源的入口。分类和首页主题以稳定 ID 关联，不再用中文关键词决定文档。指南为章节提供跨语言稳定 anchor ID，保留旧中文链接别名；切换语言时保留文档/章节，文档加载竞态只允许最新语言响应更新页面。AI 工具以执行 uiLocale 搜索/读取，导航 action 用稳定文档/章节 ID，页面以当前 UI locale 打开，避免执行期间切换界面导致锚点失效。资源加载失败显示明确错误，不悄悄把缺失译本当作成功的完整本地化。

## Risks / Trade-offs

- [确定性合并不等于传输层不会丢更新] → 本次证明已收到状态的合并性质；现有 Gist 伪 CAS 的检查后竞争窗口及强制覆盖权限约束在后续同步机制整理中处理，不把实体协议描述为整个系统已实现强一致。

- [删除与恢复的语义变化] → 删除身份不可由普通更新复活，撤销/覆盖恢复创建新身份并固定映射；对 UI、AI 和同步分别验证。
- [旧版仍可强制覆盖 Gist] → 升级客户端全路径检查协议，发布前升级参与设备，文档明确旧程序写权限不是协议能撤销的。
- [长期 tombstone 占用空间] → 仅保留精简身份/版本/时间，随书籍分块；在未来建立副本确认前不以 TTL 换取不可靠删除。

- [直接字段消费者遗漏] → 用生产源代码扫描清点所有 `.translation.translation`、`selectedTranslationId`、`hasNonEmptyTranslation`、状态/排序/导出消费者，任务清单逐项验收。
- [文字被用作协议] → todo chunk 解析改用结构化输入，错误处理保留稳定 code，三语言协议 key/状态/工具 schema 校验。
- [旧数据重写导致同步振荡] → 稳定迁移时间、固定简中兼容投影、确定性序列化和相同数据重复同步测试。
- [模板翻译改变 AI 行为] → 三套模板逐规则核对，保留批次边界、权限、原文验证、无注入和 importer 最终确认约束；对英文中性人格沿用现有约定。
- [原文不限被字符过滤破坏] → Unicode 字母/组合符/补充平面字符用例；无空格文字和 RTL 原文使用内容级方向设置，UI 本身保持三种语言的 LTR 布局。
- [大范围 UI 替换漏掉设备变体或英文溢出] → 三语言 × 桌面/平板/手机主要流程审查，Electron 原生错误/更新/菜单一起清点。
- [目标切换与晚到写入竞争] → 所有语言归属取快照，写入最新对象的对应语言槽；校对/润色缺少目标译文时不可误改另一语言。
- [缓存重建影响正在执行的检索] → 语言不匹配时明确不可用，保留原文工具路径，不把不匹配缓存用于当前任务。

## Migration Plan

1. 先用失败测试定义 locale 解析、归一化、多语言选择/清空/合并及任务语言规则；再落地类型与公共读写入口，暂不切换 UI 的语言入口；同时定义实体稳定身份、逻辑版本和删除优先的合并契约。
2. 接通所有创建/读写/同步/恢复路径，验证旧数据、三种语言、幂等迁移、损坏/未来字段和并发结果；更新目录/正文指纹与序列化。
3. 接通 AI 的完整语言快照、工具、上下文、todo、importer 以及 Unicode 与格式化处理。
4. 按模块迁移三套 UI 文案与帮助文档，最后启用通用设置语言切换。不能发布只有首页翻译、其余靠 fallback 的中间状态。
5. 先验证三副本合并代数性质、跨 90 天离线回流、时钟偏移、改名/删除竞争、显式恢复和 schema 1–3 到 4 的升级；再跑针对性 TDD 回归、项目规定的 lint/type-check/quality-check、SPA/Electron 构建与三设备三语言人工流程检查；扫描自有文案遗漏和资源 key/参数差异。
6. 启用 v4 写入前完成参与同步设备的版本升级；上线前保留包含所有语言字段和书内删除元数据的备份。回滚优先修复前进或恢复升级前备份；降级客户端不能作为多语言数据的安全编辑器，不得丢字段后覆盖唯一副本。

## Planning Review Evidence

已按 review-openspec-plan 对照代码审查，以下发现已折入设计与任务；这里记录的是规划验证，并非运行时实现已完成。

| 核查点                                        | 代码证据                                                                                          | 设计处理 / 任务                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 设置新字段会被导入白名单丢弃                  | `src/services/settings/settings-parsers.ts:204`                                                   | 显式接入 uiLocale，并测试系统缺省与有效远端偏好合并；2.1 / 5.3 |
| importer 在预览建临时书对象，最终直接事务写入 | `src/services/import/import-plan-service.ts:410`、`import-application-persistence.ts:189`         | 最终写入读取偏好，扩展 settings 事务范围及幂等回执；4.3        |
| 更新书籍为浅合并，章节写入可携带旧 volumes    | `src/stores/books.ts:282`、`src/composables/book-details/useChapterTranslation.ts:309`            | 按语言局部合并最新对象，覆盖晚到回调/最终保存；7.3             |
| 译文去重当前按文字，不区分语言                | `src/services/ai/tools/translation-tools.ts:1005`                                                 | 同内容不同语言仍独立保存，去重与无变化判断限定语言；3.2 / 7.3  |
| todo 从中文标签反向解析原文                   | `src/services/ai/tasks/utils/todo-workflow.ts:98`、`src/__tests__/todo-workflow.test.ts:100`      | 结构化预览输入替代标签解析，保留 ID/状态规则；8.5              |
| 非 ASCII/CJK 会被识别为纯符号                 | `src/utils/text-utils.ts:139`                                                                     | Unicode 文字识别及实际任务用例；8.6                            |
| 章节向量仅按章节/kind 保存，含选中译文        | `src/services/chapter-embedding-service.ts:376`、`:656`                                           | 缓存语言/签名、读写双向新鲜度检查；9.2                         |
| 同步剥离逻辑只遍历旧段落数组                  | `src/utils/sync-strip.ts:38`                                                                      | 遍历新语言槽，诊断数据不参与同步；5.3                          |
| 全文索引汇集所有语言译文，供 AI 搜索/替换     | `src/services/full-text-index-service.ts:193`、`src/services/ai/tools/paragraph-tools.ts:2496`    | 按语言标记与过滤，替换只写目标语言，目标变化失效；9.2 / 7.3    |
| 引号校验对英文 ASCII 引号硬失败               | `src/services/ai/tools/translation-tools.ts:128`、`:1147`                                         | 引号/长度规则按目标语言，同原文警告改写；8.2 / 8.7             |
| importer 以原始记录与快照做规范化字符串比较   | `src/services/import/import-library-reader.ts:63`、`import-application-persistence.ts:211`        | 两侧同一归一化，写入归一化形状；4.3                            |
| addBook 同时服务新建、撤销删除、恢复、导入    | `src/composables/books-page/useBooksPage.ts:276`、`:426`、`useGistUploadWithConflictCheck.ts:147` | 缺省值仅在真正新建调用方；4.1                                  |
| 术语/角色整体主方胜出，别名无 ID，无实体墓碑  | `src/services/sync-data-service.ts:627`、`:126`、`src/models/novel.ts:280`                        | 新增稳定别名 ID、删除记录和确定性字段合并；5.2 / 5.4–5.9       |
| ID 型译文工具可跨语言选用/修改                | `src/services/ai/tools/paragraph-tools.ts:1505`                                                   | 拒绝非目标语言版本 ID；7.3                                     |
| 只有 importer 可跨重启恢复                    | `src/services/import/import-agent-journal.ts`、`src/services/ai/tasks/assistant-service.ts:735`   | 快照持久化限 importer（仅 uiLocale）；7.2                      |
| 维护路径绕过 loader 回填正文缓存              | `src/services/chapter-content-maintenance.ts:34`                                                  | 回填前归一化；3.3                                              |

本轮追加审查已修正：设置的 localStorage 仅用于旧数据读取（`settings.ts:25`、`:168`、`:203`），首屏改为等待 IndexedDB hydration；术语/角色服务与 AI 工具的 `normalizeTranslationQuotes` 会在落库前转换标点（`character-setting-service.ts:48`、`terminology-service.ts:165`），必须按目标语言处理；别名译名空值回填原名（`character-setting-service.ts:65`、`:182`）必须去除。对应任务为 2.3、6.2、8.8。实体同步现状已更正为「并集合并缺少删除信号」，不将它误称为主方缺席删除。用户已确认采用稳定 ID、显式删除和删除优先；原别名按 name 并集及主方优先条款已被 §9a 的确定性合并替代。

已核对无需修改：同步结构基准只哈希 `[id, text]`（`src/utils/chapter-structure-hash.ts:11`），新字段不影响结构裁决；manifest 哈希经 `canonicalStringify` 排序键（`src/utils/content-hash.ts:27`），语言映射的键顺序不会造成哈希抖动。

MODIFIED delta 保留基线 scenario 的适用行为，并在 data-sync 的覆盖恢复场景明确区分可见数据与新实体身份/删除元数据；未更改现有英文中性人格、导入最终确认和原文变化清空规则。
