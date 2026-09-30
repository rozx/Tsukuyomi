export default {
  aiBatchFeedback: {
    QUOTE_OPEN: 'Opening quote {symbol} (accepted: {accepted})',
    QUOTE_CLOSE: 'Closing quote {symbol} (accepted: {accepted})',
    ASCII_QUOTE_PAIR: 'ASCII double quotes must be paired',
    CORRECTION_PREFIX_MISSING:
      'Paragraph {originalId} has correction candidate {candidateId} (edit distance {distance}), but original_text_prefix is empty. Provide the prefix to validate and enable automatic correction.',

    ID_NOTE: 'Each paragraph must contain a valid paragraph_id from [ID: xxx] in the chunk.',
    NOTE_SEPARATOR: '; ',
    NOTE_SUFFIX: '; ...',

    MISSING_PARAGRAPH_ID: 'paragraph_id is required; index is not supported',
    INVALID_PARAGRAPH_ID: 'paragraph_id must be a nonempty string',
    LEGACY_INDEX_REJECTED:
      'The deprecated index field is not supported. Use paragraph_id from [ID: xxx] in the chunk.',
    EMPTY_PARAGRAPH_LIST: 'The paragraph list cannot be empty',
    BATCH_SIZE_EXCEEDED: 'A batch supports at most {max} paragraphs; this batch contains {current}',
    BATCH_SIZE_TOLERANCE_WARNING:
      'This batch has {current} paragraphs, above the limit of {max} but within the tolerance of {allowedMax}. Keep future batches within the limit.',
    BATCH_SIZE_DOUBLE_WARNING:
      'This batch has {current} paragraphs, above the normal limit of {max}. The chunk has {remainingCount} unsubmitted paragraphs (no more than {allowedMax}), so up to {value4} may be submitted.',
    EMPTY_PARAGRAPH_ITEM: 'Batch paragraph item {index} is empty',
    INVALID_PARAGRAPH: 'Batch paragraph {index}: {error}',
    MISSING_TRANSLATION: 'Batch paragraph {index} lacks translated_text',
    MISSING_ORIGINAL_TEXT_PREFIX:
      'Paragraph {paragraphId} lacks original_text_prefix for alignment validation',
    ORIGINAL_TEXT_PREFIX_TOO_SHORT:
      'Paragraph {paragraphId} original_text_prefix is too short (at least {minLength} characters)',
    ORIGINAL_TEXT_PREFIX_TOO_LONG:
      'Paragraph {paragraphId} original_text_prefix is too long (at most {maxLength} characters)',
    ORIGINAL_TEXT_PREFIX_MISMATCH:
      'Paragraph {paragraphId} original text prefix does not match: "{prefix}"',
    DUPLICATE_PARAGRAPHS: 'Duplicate paragraph IDs in this batch: {ids}',
    OUT_OF_RANGE_PARAGRAPHS: 'These paragraphs are outside the current task scope: {ids}{extra}',
    PARAGRAPH_ID_AUTO_CORRECTED:
      'Paragraph ID corrected: {originalId} -> {correctedId} (edit distance {distance})',
    PARAGRAPH_ID_AMBIGUOUS_CANDIDATES:
      'Paragraph ID {originalId} has multiple matches (minimum edit distance {distance}); candidates: {candidateIds}',
    MISSING_QUOTE_SYMBOLS:
      'Paragraph {paragraphId} translation lacks quotation symbols from the source: {missingTypes}',
    TRANSLATION_DUPLICATE:
      'Translations for {count} paragraphs match existing versions; those versions were reused.',
    TRANSLATION_LENGTH_SHORT:
      'Paragraph {paragraphId} translation is {percentage}% of the source length and may be too short.',
    TRANSLATION_LENGTH_LONG:
      'Paragraph {paragraphId} translation is {percentage}% of the source length and may be too long.',
    AI_STORE_NOT_INITIALIZED: 'AI processing store is not initialized',
    TASK_ID_MISSING: 'Task ID is required',
    TASK_NOT_FOUND: 'Task not found: {taskId}',
    TASK_STATUS_INVALID:
      'This tool can only run in working or review; current status: {currentStatus}',
    TASK_TYPE_MISSING: 'The task type is missing; check the task information. taskId={taskId}',
    TASK_TYPE_UNSUPPORTED: 'The task type does not support batch submissions: {taskType}',
    BOOK_NOT_FOUND: 'Book not found: {bookId}',
    BOOK_NO_VOLUMES: 'The book has no chapter data',
    CHAPTER_NOT_FOUND: 'Chapter not found: {chapterId}',
    PARAGRAPH_NOT_FOUND: 'Paragraphs not found: {ids}',
    EMPTY_PARAGRAPH_CANNOT_TRANSLATE: 'Empty paragraphs cannot be translated: {ids}',
    BOOK_ID_MISSING: 'Book ID is required',
    AI_MODEL_ID_MISSING: 'AI model ID is required to record the translation source',
    CHAPTER_ID_MISSING: 'The task lacks chapterId; lazy chapter scanning may affect performance',
    PARAM_VALIDATION_FAILED: 'Parameter validation failed',
    PARTIAL_SUCCESS_SUMMARY:
      'Partial success: {acceptedCount} paragraphs processed and {failedCount} failed validation. Fix and resubmit only the failed paragraphs.',
    ALL_PARAGRAPHS_FAILED:
      'Every paragraph failed validation; no results were saved. Fix each failed_paragraphs entry and retry.',
    BATCH_PROCESS_ERROR: 'Batch processing failed: {errorMsg}',
    COUNT_REMAINING: ' ({count} paragraphs in total)',
    UNSET: 'unset',
    UNKNOWN_ERROR: 'Unknown error',
    INVALID_ID: 'Invalid paragraph identifier',
    PROCESSED: 'Processed {count} paragraphs',
    ACTION: 'Batch processed {count} paragraphs ({preview}{suffix})',
  },
};
