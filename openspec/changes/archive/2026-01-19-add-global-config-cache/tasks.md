## 1. Implementation

- [x] 1.1 新增 GlobalConfig（全局配置访问层）
  - [ ] 新增模块（例如 `src/services/global-config-cache.ts`）：
    - [x] 提供 `ensureInitialized()`（确保配置已从 store/DB 初始化到内存）
    - [x] 提供同步读取 API（app settings / sync config / book config）
    - [x] 提供更新机制：直接读取 store 作为事实来源（无需额外订阅即可保证一致性）
  - [x] 明确默认值策略：store 不可用时返回 undefined/默认值（由调用方兜底）

- [x] 1.2 启动流程集成
  - [x] 在 `src/App.vue`（或等价启动入口）确保 GlobalConfig 在关键业务开始前完成初始化
  - [x] 确保不会引入循环依赖（必要时使用动态 import）

- [x] 1.3 迁移配置读取点（移除 DB 直读）
  - [x] 修改 `src/services/ai/tools/ask-user-tools.ts`：
    - [x] 移除 `skipAskUserCache/skipAskUserInFlight` 与 `BookService.getBookById()` 读取逻辑
    - [x] 改为通过 GlobalConfig 读取书籍级 `skipAskUser`
  - [x] 统一 `src/services/ai/tasks/utils/ai-task-helper.ts` 的书籍级配置读取入口（改为通过 GlobalConfig 获取）

## 2. Tests

- [x] 2.1 单元测试：GlobalConfig 初始化与一致性
  - [ ] GIVEN store 已加载 / 未加载
  - [ ] WHEN 读取配置
  - [ ] THEN 返回值符合预期且不会重复触发 DB 读取（可通过 spy/mocks 验证）

- [x] 2.2 回归测试：ask_user skipAskUser
  - [ ] GIVEN 某书籍启用 `skipAskUser`
  - [ ] WHEN 调用 `ask_user`
  - [ ] THEN 不访问 DB 且直接返回 cancelled（行为不变）

## 3. Validation

- [x] 3.1 运行 `openspec validate add-global-config-cache --strict`
- [x] 3.2 实现阶段运行 `bun run lint`
- [x] 3.3 实现阶段运行 `bun run type-check`
- [x] 3.4 实现阶段运行 `bun test`

