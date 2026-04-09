## Context

当前 `add_translation_batch` 工具强制要求每个段落提供 `original_text_prefix` 字段（3-20 字符），用于防止 AI 将翻译写入错误段落（错位检测）。该字段在 tool schema 中标记为 `required`，handler 中对缺失、长度和匹配进行严格验证。

此机制增加了每个段落的 token 消耗（AI 需要额外生成前缀文本），对于 AI 模型能力强、错位风险低的场景，这是不必要的开销。

现有设置弹窗（`ChapterSettingsPopover.vue`）已有类似的开关模式（如 `skipAskUser`），可以复用同样的模式。

## Goals / Non-Goals

**Goals:**
- 提供书籍级别的开关，让用户控制 `original_text_prefix` 校验是否启用
- 禁用时，动态修改 tool schema（`original_text_prefix` 从 required 变为 optional），减少 AI token 消耗
- 禁用时，handler 跳过所有 `original_text_prefix` 相关验证
- 默认禁用（`enableOriginalTextValidation` 默认 `false`），因为大多数用户不需要此保护

**Non-Goals:**
- 不修改 paragraph_id 相关验证逻辑（范围检查、重复检测仍然保留）
- 不修改引号检查、长度异常检查等其他验证逻辑
- 不支持章节级别的覆盖（仅书籍级别）

## Decisions

### Decision 1: `translationTools` 从静态数组改为工厂函数

**选择**: 将 `export const translationTools: ToolDefinition[]` 改为 `export function createTranslationTools(options?: { enableOriginalTextValidation?: boolean }): ToolDefinition[]`

**理由**: tool schema 需要根据设置动态变化（required 数组、字段描述）。工厂函数是最直接的实现方式，且与现有的 `excludeAskUser` 过滤模式一致。

**替代方案**: 运行时克隆并修改静态数组 → 更脆弱，容易遗漏深层嵌套字段的修改。

### Decision 2: 通过 ToolContext 传递设置

**选择**: 在 `ToolContext` 中新增 `enableOriginalTextValidation?: boolean` 字段，由 `text-task-processor.ts` 从 book 对象读取后传入。

**理由**: 与现有 `ToolContext` 传递模式一致（如 `chunkBoundaries`、`submittedParagraphIds`），避免在 handler 中额外查询 BookService。

### Decision 3: 默认值为 `false`（禁用校验）

**选择**: `enableOriginalTextValidation` 默认 `false`。UI 开关默认关闭态。

**理由**: 用户明确要求默认禁用。大部分场景下 paragraph_id 范围校验已经足够防止错位。

### Decision 4: `getTranslationToolsForAI` 方法接收 options 参数

**选择**: `ToolRegistry.getTranslationToolsForAI(options?: { enableOriginalTextValidation?: boolean })` 传递给 `createTranslationTools`。

**理由**: 保持 ToolRegistry 作为工具分发中心的角色，调用方无需直接依赖 `createTranslationTools`。

### Decision 5: `handleToolCall` 传递设置到 ToolContext

**选择**: `ToolRegistry.handleToolCall` 新增 `enableOriginalTextValidation` 参数，传入 ToolContext。

**理由**: `handleToolCall` 已经是传递所有上下文的入口点，新增参数与现有模式一致。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 禁用校验后 AI 可能错位（paragraph_id 正确但内容对不上） | paragraph_id 范围校验 + 重复 ID 检测仍保留；用户主动选择的权衡 |
| `translationTools` 从静态改为工厂后影响测试 | 测试文件需要适配新签名，但改动较小 |
| `normalizeParagraphIds` 纠错降级 | 已有 ambiguous match 兜底机制，无 prefix 时仅跳过二次确认 |
| 现有 book 数据无此字段 | `!== true` 逻辑确保 undefined 等同于 false（默认不校验） |
