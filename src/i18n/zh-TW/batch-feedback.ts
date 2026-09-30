export default {
  aiBatchFeedback: {
    QUOTE_OPEN: '開引號 {symbol}（可用: {accepted}）',
    QUOTE_CLOSE: '閉引號 {symbol}（可用: {accepted}）',
    ASCII_QUOTE_PAIR: 'ASCII 雙引號必須成對',
    CORRECTION_PREFIX_MISSING:
      '段落 {originalId} 有拼寫修正候選 {candidateId}（編輯距離 {distance}），但 original_text_prefix 為空，無法驗證。請提供 original_text_prefix 啟用自動修正。',

    ID_NOTE: '請確保每個段落包含有效的 paragraph_id（從區塊的 [ID: xxx] 取得）。',
    NOTE_SEPARATOR: '；',
    NOTE_SUFFIX: '；…',

    ACTION: '批量處理 {count} 個段落 ({preview}{suffix})',
    AI_MODEL_ID_MISSING: '未提供 AI 模型 ID，無法寫入翻譯來源',
    AI_STORE_NOT_INITIALIZED: 'AI 處理 Store 未初始化',
    ALL_PARAGRAPHS_FAILED:
      '本次批次所有段落均驗證失敗，未保存任何結果。請根據 failed_paragraphs 逐條修復後重試。',
    BATCH_PROCESS_ERROR: '處理批次時出錯: {errorMsg}',
    BATCH_SIZE_DOUBLE_WARNING:
      '本次批次包含 {current} 個段落，已超過常規限制 {max} 個。由於目前 chunk 剩餘 {remainingCount} 個未提交段落（≤ {allowedMax}），允許最多提交 {value4} 個段落。',
    BATCH_SIZE_EXCEEDED: '單次批次最多支持 {max} 個段落，目前批次包含 {current} 個段落',
    BATCH_SIZE_TOLERANCE_WARNING:
      '本次批次包含 {current} 個段落，已超過限制 {max} 個，但在容差範圍內（最多 {allowedMax} 個）。請盡量控制在限制內。',
    BOOK_ID_MISSING: '未提供書籍 ID',
    BOOK_NO_VOLUMES: '書籍缺少章節數據',
    BOOK_NOT_FOUND: '書籍不存在: {bookId}',
    CHAPTER_ID_MISSING: '任務缺少 chapterId，將觸發惰性章節掃描，可能影響性能',
    CHAPTER_NOT_FOUND: '章節不存在: {chapterId}',
    COUNT_REMAINING: ' 等 {count} 個段落',
    DUPLICATE_PARAGRAPHS: '批次中存在重復的段落 ID: {ids}',
    EMPTY_PARAGRAPH_CANNOT_TRANSLATE: '無法翻譯空段落: {ids}',
    EMPTY_PARAGRAPH_ITEM: '批次中第 {index} 個段落項為空',
    EMPTY_PARAGRAPH_LIST: '段落列表不能為空',
    INVALID_ID: '無效的段落標識',
    INVALID_PARAGRAPH: '批次中第 {index} 個段落: {error}',
    INVALID_PARAGRAPH_ID: 'paragraph_id 必須是非空字符串',
    LEGACY_INDEX_REJECTED:
      '檢測到使用已廢棄的 index 字段提交。請使用 paragraph_id 標識段落（從 chunk 中 [ID: xxx] 獲取）',
    MISSING_ORIGINAL_TEXT_PREFIX: '段落 {paragraphId} 缺少 original_text_prefix（用於防錯位驗證）',
    MISSING_PARAGRAPH_ID: '必須提供 paragraph_id（不支持 index）',
    MISSING_QUOTE_SYMBOLS: '段落 {paragraphId} 的譯文缺少原文引號符號: {missingTypes}',
    MISSING_TRANSLATION: '批次中第 {index} 個段落缺少翻譯文本 (translated_text)',
    ORIGINAL_TEXT_PREFIX_MISMATCH: '段落 {paragraphId} 的原文前綴不匹配："{prefix}"',
    ORIGINAL_TEXT_PREFIX_TOO_LONG:
      '段落 {paragraphId} 的 original_text_prefix 過長（最多 {maxLength} 個字符）',
    ORIGINAL_TEXT_PREFIX_TOO_SHORT:
      '段落 {paragraphId} 的 original_text_prefix 長度不足（最少 {minLength} 個字符）',
    OUT_OF_RANGE_PARAGRAPHS: '以下段落不在目前任務範圍內: {ids}{extra}',
    PARAGRAPH_ID_AMBIGUOUS_CANDIDATES:
      '段落 ID 無法唯一匹配：{originalId}（最小編輯距離 {distance}），候選: {candidateIds}',
    PARAGRAPH_ID_AUTO_CORRECTED:
      '段落 ID 自動糾正：{originalId} -> {correctedId}（編輯距離 {distance}）',
    PARAGRAPH_NOT_FOUND: '未找到以下段落: {ids}',
    PARAM_VALIDATION_FAILED: '參數驗證失敗',
    PARTIAL_SUCCESS_SUMMARY:
      '部分成功：已處理 {acceptedCount} 個段落，{failedCount} 個段落驗證失敗，請僅修復失敗段落後重試。',
    PROCESSED: '成功處理 {count} 個段落',
    TASK_ID_MISSING: '未提供任務 ID',
    TASK_NOT_FOUND: '任務不存在: {taskId}',
    TASK_STATUS_INVALID:
      "只能在 'working' 或 'review' 狀態下調用此工具，目前狀態為: {currentStatus}",
    TASK_TYPE_MISSING: '無法確定任務類型，請檢查任務信息。taskId={taskId}',
    TASK_TYPE_UNSUPPORTED: '任務類型不支持批量提交: {taskType}',
    TRANSLATION_DUPLICATE: '{count} 個段落譯文與歷史版本相同（已自動復用歷史翻譯）。',
    TRANSLATION_LENGTH_LONG: '段落 {paragraphId} 的譯文長度為原文的 {percentage}%，可能過長。',
    TRANSLATION_LENGTH_SHORT: '段落 {paragraphId} 的譯文長度僅為原文的 {percentage}%，可能過短。',
    UNKNOWN_ERROR: '未知錯誤',
    UNSET: '未設置',
  },
};
