## Context

当前 `add_translation_batch` 的提交对象以 `index` 作为定位字段，`index` 与分块内顺序强耦合；当 AI 在调用上下文工具后跨段处理、重排输出或混入非当前块内容时，`index` 可能与真实目标段落不一致，造成译文写入错段。

该变更涉及三个层面：

- 提示词层：Translation/Polish/Proofreading 必须明确要求按 `paragraph_id` 提交。
- 分块上下文层：待处理段落展示需要稳定暴露每段的 `paragraph_id`，让 AI 可直接复制用于工具调用。
- 工具层：`add_translation_batch` 参数、校验和错误语义从 `index` 迁移到 `paragraph_id`。

约束条件：

- 现有段落数据模型已具备稳定 ID（8 位短 ID），不做数据迁移。
- 变更为 BREAKING，需要拒绝仅含 `index` 的旧调用。

## Goals / Non-Goals

**Goals:**

- 以 `paragraph_id` 作为唯一提交主键，消除 `index` 错配写入风险。
- 在提示词与分块文本中形成一致的 ID 语义，降低模型误用概率。
- 保持批量提交原子性、任务分配范围校验与重复提交检测能力。
- 为 translation/polish/proofreading 三类任务统一提交协议。

**Non-Goals:**

- 不改变段落查询工具（如 `get_previous_paragraphs`）的业务目标与返回结构主语义。
- 不重构任务状态机与工具调用循环框架。
- 不引入兼容模式（本次按 BREAKING 处理，不保留 `index` 提交入口）。

## Decisions

1. 提交协议主键统一为 `paragraph_id`

- 方案：`add_translation_batch` 的每个条目必须包含 `paragraph_id` 与处理文本；缺失 `paragraph_id` 直接报错并整批失败。
- 理由：`paragraph_id` 与段落实体一一对应，独立于 chunk 顺序和显示序号。
- 备选方案：继续允许 `index` 并在服务端映射为 `paragraph_id`。
  - 放弃原因：保留旧语义会持续诱导模型混用两套定位方式，错误面扩大。

2. 分块构建显式暴露可提交 ID

- 方案：在发送给 AI 的待处理段落内容中，为每段提供清晰的 `paragraph_id` 标识（可同时保留仅用于阅读的序号）。
- 理由：模型在同一上下文中即可获取“阅读信息 + 可提交主键”，减少推断。
- 备选方案：只在工具描述中要求 `paragraph_id`，不在 chunk 文本展示。
  - 放弃原因：模型需要额外检索/记忆 ID，易产生遗漏或误填。

3. 提示词改为强约束提交规则

- 方案：translation/polish/proofreading 提示词统一声明：提交结果时仅使用 `paragraph_id`，不得使用 `index`。
- 理由：在行为层面减少歧义，提升模型对工具参数契约的遵循度。
- 备选方案：弱提示（“优先使用 paragraph_id”）。
  - 放弃原因：弱提示在长对话和复杂上下文下执行一致性不足。

4. 校验逻辑与错误语义按 ID 迁移

- 方案：
  - 任务分配校验基于 `assignedParagraphIds: Set<string>`；
  - 批次去重基于 `paragraph_id`；
  - 越权或不存在段落返回包含具体 `paragraph_id` 的错误；
  - 任一条目失败则整批回滚（原子性不变）。
- 理由：保证“可定位、可追踪、可调试”。
- 备选方案：失败条目跳过、其余成功（部分成功）。
  - 放弃原因：会引入状态不一致和补偿复杂度，不符合现有原子语义。

5. 测试基线同步迁移

- 方案：将工具、提示词、分块构建相关测试从 `index` 断言迁移为 `paragraph_id` 断言，并新增“传 index 应失败”用例。
- 理由：防止回归并明确 BREAKING 契约。

## Risks / Trade-offs

- [Risk] 旧提示词缓存或旧样例仍使用 `index` → Mitigation：更新全部任务提示模板，并在工具层硬性拒绝 `index`。
- [Risk] 分块展示增加 ID 可能影响提示词长度 → Mitigation：仅输出必要字段，保持 ID 简短格式，避免冗余说明。
- [Risk] 测试改动面广导致短期不稳定 → Mitigation：先改工具契约测试，再改提示词/集成测试，分层回归。
- [Trade-off] 不提供兼容窗口可更快收敛，但升级瞬时破坏旧调用 → Mitigation：在变更说明与发布记录中明确 BREAKING，提供迁移示例。

## Migration Plan

1. 先改工具参数 schema 与处理器校验：`index` -> `paragraph_id`。
2. 更新三类任务提示词与 chunk 构建文本，确保上下文可直接引用 `paragraph_id`。
3. 更新单元测试与集成测试，补充 BREAKING 负例。
4. 全量回归 translation/polish/proofreading 的工具调用链路。

回滚策略：若上线后出现高频失败，可回滚到上一版本（恢复 `index` 契约）；不做数据层回滚。

## Open Questions

- 是否在工具错误信息中同时返回“建议修复动作”（例如“请改用 paragraph_id 字段重试”）以提升模型自修复率？
- chunk 文本中序号是否保留为纯展示字段（推荐保留），还是完全移除以最大化去歧义？
