## 1. 更新 `add_translation_batch` 工具契约

- [x] 1.1 修改 `src/services/ai/tools/translation-batch-tools.ts` 的参数 schema，将条目标识从 `index` 改为 `paragraph_id`
- [x] 1.2 在参数校验中强制要求 `paragraph_id`，并为缺失字段返回明确错误
- [x] 1.3 增加对旧 `index` 提交的拒绝逻辑与错误信息（BREAKING 行为）

## 2. 迁移批量提交校验与保存逻辑到 `paragraph_id`

- [x] 2.1 将任务分配范围校验改为基于 `paragraph_id` 集合判断
- [x] 2.2 将批次重复检测改为基于 `paragraph_id`，保持整批原子性
- [x] 2.3 更新 translation/polish/proofreading 三类保存路径，统一以 `paragraph_id` 定位段落

## 3. 更新分块构建与上下文标识

- [x] 3.1 修改翻译任务的 chunk 构建输出，为每个待处理段落显式包含 `paragraph_id`
- [x] 3.2 修改润色/校对任务的 chunk 构建输出，为每个待处理段落显式包含 `paragraph_id`
- [x] 3.3 明确 `index`（如保留）仅用于阅读定位，提交主键统一为 `paragraph_id`

## 4. 更新任务提示词为 paragraph_id-only 提交

- [x] 4.1 更新 `src/services/ai/tasks/prompts/translation.ts`，要求提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`
- [x] 4.2 更新 `src/services/ai/tasks/prompts/polish.ts`，要求提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`
- [x] 4.3 更新 `src/services/ai/tasks/prompts/proofreading.ts`，要求提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`

## 5. 对齐边界传播与错误语义

- [x] 5.1 检查并对齐 `ToolContext.chunkBoundaries` 在调用链中的 paragraph ID 语义
- [x] 5.2 更新越界/未分配段落报错内容，使错误信息包含被拒绝的 `paragraph_id`
- [x] 5.3 确认 AI assistant 非 chunk 场景不受本变更的边界限制副作用影响

## 6. 补齐与迁移测试

- [x] 6.1 更新 `src/__tests__/translation-tools.test.ts` 及相关测试断言为 `paragraph_id` 语义
- [x] 6.2 新增"仅传 `index` 会失败"的负例测试
- [x] 6.3 新增/更新 translation、polish、proofreading 的提示词约束测试（禁止 `index` 提交）
- [x] 6.4 新增/更新 chunk 构建测试，验证待处理段落输出包含 `paragraph_id`

## 7. 回归与质量检查

- [x] 7.1 运行 `bun run type-check` 并修复类型问题
- [x] 7.2 运行 `bun run lint` 并修复规范问题
- [x] 7.3 运行相关测试（至少覆盖 translation tools 与三类任务提示词）并确认通过
