# 发布说明 - v0.9.4

## 版本信息

- **版本号**: 0.9.4
- **发布日期**: 2026年4月8日
- **基于版本**: v0.9.3

---

## 🤖 AI 功能增强 (AI Enhancements)

- **AI 助手与翻译面板整合**：重构了布局组件 `AppRightPanel.vue`，将原本独立的 AI 助手与翻译进度合并为右侧统一的选项卡 (Tab) 视图，优化了阅读界面的空间利用率。
- **单段落处理极致简化**：新增了 `single-paragraph-processor.ts`。在用户仅对单段落执行润色和校对时，系统将直接调用封装好的直连执行器，而不再经过复杂的 AI 状态机，大幅缩短了处理开销与状态流转时间。
- **多模型推理内容 (Reasoning Content) 兼容**：重构了 `OpenAIService` 的流式数据解析。除了标准的 `reasoning_content` 外，新增对 `reasoning_details` 和 `reasoning` 字段的提权支持，无缝兼容类似 Kimi (K2.5) 等模型返回的思考过程。
- **空响应异常捕获**：在 `OpenAIService` 结构里新增抛出 `AIEmptyResponseError` 异常捕捉，防止 AI 网络或抽风返回空数据时抛出无业务语义的通用错误。
- **原文校验精准下发**：调整了 `common.ts` 等提示词模块。在用户设置中关闭原文校验时，底层生成上下文中会自动剥离 `original_text_prefix` 及相关校验指令，降低 Prompt Token 消耗及模型误判开销。
- **纯符号过滤**：优化了 AI 翻译组件判定，修复由于内容纯符号导致翻译结果意外触发系统完整性警告的逻辑分支漏洞。

## 🔄 数据同步与存储 (Data Sync & Storage)

- **Memory (记忆库) 同步深度去重**：重构了 `SyncDataService` 的 Memory 合并算法。引入基于语义内容 (`content`) 的哈希冲突处理策略，即使因跨端重抓等原因导致 Memory ID 丢失差异，也能实现正确的内容级合并。
- **记忆库误删恢复支持**：补全软删除机制支持库，将 `memory` 列入全局 `RestorableItem` 范畴并写入了同步差异化对比层，在 `RestoreDeletedItemsDialog` 误删除面板提供支持。
- **段落级合并容错增强**：同步应用更新时，新增了 `remoteParagraphByTextMap` 基于文本匹配回退逻辑。解决因跨端获取源数据导致的源段落 ID 不同，从而丢失历史段落本地翻译缓存的问题。

## 📖 原型获取与界面交互 (Scrapers & UI/UX)

- **Kakuyomu 抓取器升级**：
  - 引入了 `tableOfContentsV2` GraphQL API 的支持解析，保持对旧版结构的联合兼容。
  - 新增自定义 `extractTextFromElement` 渲染函数。抓取正文时完美防范 `<br>` 的丢失，并且增加了对 `<ruby>` 注音文本的平铺翻译化处理（将原本嵌套结构提取为 `漢字(かんじ)`）。
  - 在基本请求失败时，增强了从内部 Apollo 状态池里提取 `author` 属性等元数据的容灾处理。
- **移动端与操作体验**：
  - 新置基于屏幕边界的移动端底部固定导航栏 (`mobile-bottom-nav`)。
  - 收纳移动版折叠式设置工具栏，移除了多余的标题占位符，并将章节编辑弹窗等元素支持了键盘直接通过聚焦滚动的内容浏览操作。
  - 新增 `QuickStartGuideDialog` 组件，初次使用时直接拉取托管的 Markdown 并使用 Markdown 解析器实时渲染到内置页面中展示指南。

## ⚙️ 系统与基础架构

- **性能调优**：将分批翻译机制的默认文本处理尺寸 (Chunk Size) 提升至 `2000`，改善模型高并发通信造成的接口限速问题与数据量截断平衡。
- **系统交互徽章强化**：修订 `ChatActionBadge.vue` 的 CSS 层与异常捕捉处理，确保不规则结果抛出时的 UI 解析样式安全对齐。
- **边缘文本工具引入**：实装 `text-matcher.ts` 及边缘匹配工具层函数，强化了内部代码对于章节比对边缘字符对齐测试 (text-matcher-edge.test.ts) 的健壮性。

---

_本文档基于代码层面对比构建 (git diff v0.9.3..HEAD)_
