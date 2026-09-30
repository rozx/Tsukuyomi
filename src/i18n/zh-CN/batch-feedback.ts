export default {
  aiBatchFeedback: {
    QUOTE_OPEN: '开引号 {symbol}（可用: {accepted}）',
    QUOTE_CLOSE: '闭引号 {symbol}（可用: {accepted}）',
    ASCII_QUOTE_PAIR: 'ASCII 双引号必须成对',
    CORRECTION_PREFIX_MISSING:
      '段落 {originalId} 存在拼写纠错候选 {candidateId}（编辑距离 {distance}），但 original_text_prefix 为空，无法验证纠错。请提供 original_text_prefix 以启用自动纠正。',

    ID_NOTE: '请确保每个段落都包含有效的 paragraph_id（从 chunk 中 [ID: xxx] 获取）。',
    NOTE_SEPARATOR: '；',
    NOTE_SUFFIX: '；…',

    MISSING_PARAGRAPH_ID: '必须提供 paragraph_id（不支持 index）',
    INVALID_PARAGRAPH_ID: 'paragraph_id 必须是非空字符串',
    LEGACY_INDEX_REJECTED:
      '检测到使用已废弃的 index 字段提交。请使用 paragraph_id 标识段落（从 chunk 中 [ID: xxx] 获取）',
    EMPTY_PARAGRAPH_LIST: '段落列表不能为空',
    BATCH_SIZE_EXCEEDED: '单次批次最多支持 {max} 个段落，当前批次包含 {current} 个段落',
    BATCH_SIZE_TOLERANCE_WARNING:
      '本次批次包含 {current} 个段落，已超过限制 {max} 个，但在容差范围内（最多 {allowedMax} 个）。请尽量控制在限制内。',
    BATCH_SIZE_DOUBLE_WARNING:
      '本次批次包含 {current} 个段落，已超过常规限制 {max} 个。由于当前 chunk 剩余 {remainingCount} 个未提交段落（≤ {allowedMax}），允许最多提交 {value4} 个段落。',
    EMPTY_PARAGRAPH_ITEM: '批次中第 {index} 个段落项为空',
    INVALID_PARAGRAPH: '批次中第 {index} 个段落: {error}',
    MISSING_TRANSLATION: '批次中第 {index} 个段落缺少翻译文本 (translated_text)',
    MISSING_ORIGINAL_TEXT_PREFIX: '段落 {paragraphId} 缺少 original_text_prefix（用于防错位校验）',
    ORIGINAL_TEXT_PREFIX_TOO_SHORT:
      '段落 {paragraphId} 的 original_text_prefix 长度不足（最少 {minLength} 个字符）',
    ORIGINAL_TEXT_PREFIX_TOO_LONG:
      '段落 {paragraphId} 的 original_text_prefix 过长（最多 {maxLength} 个字符）',
    ORIGINAL_TEXT_PREFIX_MISMATCH: '段落 {paragraphId} 的原文前缀不匹配："{prefix}"',
    DUPLICATE_PARAGRAPHS: '批次中存在重复的段落 ID: {ids}',
    OUT_OF_RANGE_PARAGRAPHS: '以下段落不在当前任务范围内: {ids}{extra}',
    PARAGRAPH_ID_AUTO_CORRECTED:
      '段落 ID 自动纠正：{originalId} -> {correctedId}（编辑距离 {distance}）',
    PARAGRAPH_ID_AMBIGUOUS_CANDIDATES:
      '段落 ID 无法唯一匹配：{originalId}（最小编辑距离 {distance}），候选: {candidateIds}',
    MISSING_QUOTE_SYMBOLS: '段落 {paragraphId} 的译文缺少原文引号符号: {missingTypes}',
    TRANSLATION_DUPLICATE: '{count} 个段落译文与历史版本相同（已自动复用历史翻译）。',
    TRANSLATION_LENGTH_SHORT: '段落 {paragraphId} 的译文长度仅为原文的 {percentage}%，可能过短。',
    TRANSLATION_LENGTH_LONG: '段落 {paragraphId} 的译文长度为原文的 {percentage}%，可能过长。',
    AI_STORE_NOT_INITIALIZED: 'AI 处理 Store 未初始化',
    TASK_ID_MISSING: '未提供任务 ID',
    TASK_NOT_FOUND: '任务不存在: {taskId}',
    TASK_STATUS_INVALID:
      "只能在 'working' 或 'review' 状态下调用此工具，当前状态为: {currentStatus}",
    TASK_TYPE_MISSING: '无法确定任务类型，请检查任务信息。taskId={taskId}',
    TASK_TYPE_UNSUPPORTED: '任务类型不支持批量提交: {taskType}',
    BOOK_NOT_FOUND: '书籍不存在: {bookId}',
    BOOK_NO_VOLUMES: '书籍缺少章节数据',
    CHAPTER_NOT_FOUND: '章节不存在: {chapterId}',
    PARAGRAPH_NOT_FOUND: '未找到以下段落: {ids}',
    EMPTY_PARAGRAPH_CANNOT_TRANSLATE: '无法翻译空段落: {ids}',
    BOOK_ID_MISSING: '未提供书籍 ID',
    AI_MODEL_ID_MISSING: '未提供 AI 模型 ID，无法写入翻译来源',
    CHAPTER_ID_MISSING: '任务缺少 chapterId，将触发惰性章节扫描，可能影响性能',
    PARAM_VALIDATION_FAILED: '参数验证失败',
    PARTIAL_SUCCESS_SUMMARY:
      '部分成功：已处理 {acceptedCount} 个段落，{failedCount} 个段落校验失败，请仅修复失败段落后重试。',
    ALL_PARAGRAPHS_FAILED:
      '本次批次所有段落均验证失败，未保存任何结果。请根据 failed_paragraphs 逐条修复后重试。',
    BATCH_PROCESS_ERROR: '处理批次时出错: {errorMsg}',
    COUNT_REMAINING: ' 等 {count} 个段落',
    UNSET: '未设置',
    UNKNOWN_ERROR: '未知错误',
    INVALID_ID: '无效的段落标识',
    PROCESSED: '成功处理 {count} 个段落',
    ACTION: '批量处理 {count} 个段落 ({preview}{suffix})',
  },
};
