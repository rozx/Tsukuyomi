## 1. 扩展翻译批次工具返回契约

- [x] 1.1 在 `translation-tools` 中为成功结果增加 `accepted_paragraphs`（包含 `paragraph_id`、`translated_text`）
- [x] 1.2 在 `translation-tools` 中为失败结果增加结构化字段（`error_code`、`invalid_items`/`invalid_paragraph_ids`）并保留现有可读 `error`
- [x] 1.3 为新返回字段补充类型与序列化约束，确保现有调用方在缺省字段时不崩溃

## 2. 对齐任务执行层的结果消费逻辑

- [x] 2.1 在 `task-runner` 中为 `add_translation_batch` 成功结果优先读取 `accepted_paragraphs`
- [x] 2.2 增加兼容回退路径：当缺少 `accepted_paragraphs` 时继续使用旧参数提取逻辑
- [x] 2.3 调整完成度推进逻辑：仅在工具成功时、仅基于 accepted 集合更新提交状态与段落映射

## 3. 更新重试提示与错误修复引导

- [x] 3.1 在相关提示词中加入“优先依据结构化错误字段做最小修复后重试”的约束
- [x] 3.2 明确禁止在失败重试时重排或猜测段落映射，要求保持 `paragraph_id` 精确对应

## 4. 补齐测试与回归验证

- [x] 4.1 更新 `translation-tools` 测试：覆盖 `accepted_paragraphs` 成功返回与结构化错误返回
- [x] 4.2 更新执行循环测试：覆盖 canonical 消费、失败不推进、旧格式回退三类场景
- [x] 4.3 运行并通过 `bun test src/__tests__/translation-tools.test.ts`
- [x] 4.4 运行并通过与执行循环相关的测试（如 `ai-task-helper.executeToolCallLoop` / `cross-check-missing-with-db`）

## 5. 质量检查与收尾

- [x] 5.1 运行并通过 `bun run lint`
- [x] 5.2 运行并通过 `bun run type-check`
- [x] 5.3 记录兼容回退策略与后续清理条件，避免双路径长期并存

兼容回退策略记录：

- 当前策略：`task-runner` 优先消费 `accepted_paragraphs`；仅在字段缺失时回退到旧参数提取。
- 清理条件：当线上全部模型与工具结果稳定返回 canonical 字段且回归周期通过后，移除旧参数回退路径并收敛测试分支。
