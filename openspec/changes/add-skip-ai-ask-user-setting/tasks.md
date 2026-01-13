## 1. Implementation

- [x] 1.1 数据模型：新增书籍级开关字段
  - [x] 在 `src/models/novel.ts` 的 `Novel` 增加 `skipAskUser?: boolean`
  - [x] 确认 IndexedDB 序列化/反序列化对新增字段兼容（无迁移，旧数据默认 undefined=关闭）

- [x] 1.2 UI：在“翻译设置”弹窗新增开关
  - [x] 修改 `src/components/novel/ChapterSettingsPopover.vue`：
    - [x] 在「全局设置」页签增加 `InputSwitch`
    - [x] 开关文案：`跳过 AI 追问（不弹出问答对话框）`
    - [x] 说明文案：开启后本书 AI 不会弹出问答对话框；模型需要自行决策或继续执行
  - [x] 修改 `src/pages/BookDetailsPage.vue`：
    - [x] `handleSaveChapterSettings` 保存该字段到 `booksStore.updateBook(bookId, updates)`

- [x] 1.3 AI 行为：该书籍范围内跳过 ask_user
  - [x] 修改 `src/services/ai/tools/index.ts`（`ToolRegistry`）：
    - [x] 在 translation/polish/proofreading 使用的工具集（例如 `getTranslationTools(bookId)`）中：
      - [x] 若 `bookId` 对应书籍开启 `skipAskUser=true`，则 **不返回** `ask_user` 工具（从 tools 列表中移除）
  - [x] 修改 `src/services/ai/tools/ask-user-tools.ts`（兜底防护）：
    - [x] 若 `context.bookId` 对应书籍开启 `skipAskUser=true`，则不弹 UI，直接返回“取消结果”（等价于 `cancelled:true`）
    - [x] 同时记录 action（问题 + cancelled:true），便于追溯
  - [x] 修改 `src/services/ai/tasks/utils/ai-task-helper.ts`：
    - [x] 在书籍上下文/系统提示中加入提示：本书已开启“跳过 AI 追问”，模型不得调用 `ask_user`
    - [x] 确保提示在 translation/polish/proofreading/assistant 等路径都能覆盖

## 2. Tests

- [x] 2.1 单元测试：skipAskUser 开启时 ask_user 直接返回 cancelled
  - [x] 新增测试覆盖：`ask_user` handler 在有 `bookId` 且书籍设置开启时，不依赖 `window.__lunaAskUser`
  - [x] 断言：返回 `success:false` + `cancelled:true`

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`

