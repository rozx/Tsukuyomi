## Context

`add_translation_batch` 工具使用 `original_text_prefix` 字段校验 AI 提交的翻译是否对应正确的源段落。当前校验逻辑：

1. `startsWith` 匹配 — 确保前缀是原文的实际开头
2. `TOO_SHORT` — 前缀长度 < `min(3, originalText.length)`，防止过短前缀碰运气匹配
3. `TOO_LONG` — 前缀长度 > `max(3, floor(len * 0.8), ...条件扩展)`，限制前缀不要过长

经过纯符号段落和短文本的两轮补丁，max 计算引入了条件 spread 数组和硬编码阈值 `2 * MIN_ORIGINAL_TEXT_PREFIX_LENGTH`，代码可读性下降。

**当前代码**（`translation-tools.ts` ~L743-749）:

```typescript
const shortTextThreshold = 2 * MIN_ORIGINAL_TEXT_PREFIX_LENGTH;
const maxOriginalTextPrefixLength = Math.max(
  MIN_ORIGINAL_TEXT_PREFIX_LENGTH,
  Math.floor(trimmedOriginalText.length * MAX_ORIGINAL_TEXT_PREFIX_LENGTH_RATIO),
  ...(trimmedOriginalText.length <= shortTextThreshold ? [trimmedOriginalText.length] : []),
);
```

## Goals / Non-Goals

**Goals:**

- 提高前缀校验代码的可读性和可维护性
- 用动态窗口宽度计算替代魔法数字阈值，使短文本放宽逻辑精确对应问题本质
- 提取前缀长度校验为独立函数，减少 `processTranslationBatch` 的认知负担
- 评估 `TOO_LONG` 降级为 warning 的可行性

**Non-Goals:**

- 不改变 `startsWith` 匹配逻辑
- 不改变纯符号段落跳过长度校验的行为
- 不改变 `TOO_SHORT` 的行为
- 不修改工具的对外 API 接口或参数 schema

## Decisions

### Decision 1: 用三元分支替代条件 spread

**选择**: 将 `Math.max(...(cond ? [val] : []))` 改为先计算 ratioMax 再用三元选择。

**理由**: 条件 spread 语法虽然函数式风格但引入了不必要的数组分配，且 `...[]` 在 Math.max 中的语义不直观。分成两步后逻辑一目了然。

```typescript
const ratioMax = Math.max(
  MIN_ORIGINAL_TEXT_PREFIX_LENGTH,
  Math.floor(len * MAX_ORIGINAL_TEXT_PREFIX_LENGTH_RATIO),
);
const maxPrefixLen = isShortText ? len : ratioMax;
```

**替代方案**: 保持 spread 语法但添加注释 — 被否决，因为结构性问题不应靠注释弥补。

### Decision 2: 用合法窗口宽度判断替代固定阈值

**选择**: 当 `ratioMax - effectiveMinLength < MIN_WINDOW_WIDTH`（建议 MIN_WINDOW_WIDTH = 2）时，放宽 max 为原文全长。

**理由**: 短文本问题的本质是合法前缀窗口（min ~ max）过窄，直接检测窗口宽度比用 `length <= 6` 更精确。例如：

- `「ゆず」`（4 字符）: ratioMax=3, min=3, 窗口=0 → 放宽
- `abcdefg`（7 字符）: ratioMax=5, min=3, 窗口=2 → 不放宽（刚好足够）
- `abcdefgh`（8 字符）: ratioMax=6, min=3, 窗口=3 → 不放宽

**替代方案**: 保持 `length <= 2 * MIN` 硬编码阈值 — 被否决，因为阈值与问题的关联不直观（为什么是 2 倍？）。

### Decision 3: 提取 helper 函数

**选择**: 提取 `validatePrefixLength(prefix, originalText)` 函数，返回 `{ valid: true } | { valid: false, error: ErrorCode, maxLen?: number }`.

**理由**: 前缀校验是一个独立的关注点，不应内联在 processTranslationBatch 的 500+ 行循环体中。独立函数更易测试、更易理解。

### Decision 4: TOO_LONG 保持为 error，暂不降级

**选择**: 保持 `ORIGINAL_TEXT_PREFIX_TOO_LONG` 为硬性错误。

**理由**: 虽然前缀过长主要是效率问题，但降级为 warning 会改变 AI 侧的行为反馈循环，可能导致 AI 在后续对话中持续提交过长前缀。且当前通过窗口宽度放宽已经解决了合法场景被误拒的核心问题，不需要进一步松动。降级可作为后续独立变更评估。

## Risks / Trade-offs

- **[窗口宽度阈值选择]** MIN_WINDOW_WIDTH = 2 是经验值。过大（如 5）会对中等长度文本不必要地放宽；过小（如 1）可能仍有边界 case。→ 缓解：当前测试覆盖了 4~8 字符范围的典型场景，2 是合理的中间值。
- **[函数提取的 scope]** 提取 helper 可能需要同时传递 `isSymbolOnly` 结果，增加参数数量。→ 缓解：纯符号判断在 helper 外部完成（跳过整个长度校验），helper 只处理非符号文本。
