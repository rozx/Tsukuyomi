export default {
  aiRun: {
    init: {
      translation: 'Starting translation session…',
      polish: 'Starting polishing session…',
      proofreading: 'Starting proofreading session…',
    },
    connecting: 'Connecting…',
    chunk: {
      translation: 'Translating part {current}/{total}…',
      polish: 'Polishing part {current}/{total}…',
      proofreading: 'Proofreading part {current}/{total}…',
    },
    single: {
      translation: 'Translating paragraph…',
      polish: 'Polishing paragraph…',
      proofreading: 'Proofreading paragraph…',
    },
    working: {
      translation: 'Translating…',
      polish: 'Polishing…',
      proofreading: 'Proofreading…',
    },
    done: {
      translation: 'Translation complete',
      polish: 'Polishing complete',
      proofreading: 'Proofreading complete',
    },
    failed: {
      translation: 'Translation failed',
      polish: 'Polishing failed',
      proofreading: 'Proofreading failed',
    },
    unknownError: {
      translation: 'An unknown error occurred during translation',
      polish: 'An unknown error occurred during polishing',
      proofreading: 'An unknown error occurred during proofreading',
    },
    emptyContent: {
      translation: 'There is no content to translate',
      polish: 'There is no content to polish',
      proofreading: 'There is no content to proofread',
    },
    needsTranslation: {
      translation: 'Paragraphs to translate must have a selected translation',
      polish: 'Paragraphs to polish must have a selected translation',
      proofreading: 'Paragraphs to proofread must have a selected translation',
    },
    incomplete: {
      translation: 'The translation task did not finish (status: {status}). Please try again.',
      polish: 'The polishing task did not finish (status: {status}). Please try again.',
      proofreading: 'The proofreading task did not finish (status: {status}). Please try again.',
    },
    retriesExhausted: {
      translation: 'The translation task did not finish after {max} retries',
      polish: 'The polishing task did not finish after {max} retries',
      proofreading: 'The proofreading task did not finish after {max} retries',
    },
    maxTurns: {
      translation:
        'The AI did not finish the translation task within {turns} turns (current status: {status}). Please try again.',
      polish:
        'The AI did not finish the polishing task within {turns} turns (current status: {status}). Please try again.',
      proofreading:
        'The AI did not finish the proofreading task within {turns} turns (current status: {status}). Please try again.',
    },
    degraded: 'The AI output contained repeated characters; this request was stopped',
    retrying: 'Abnormal AI output detected; retry {count}/{max}…',
    degradedFinal:
      'The AI output kept repeating characters after {max} retries. Check the AI service or try again later.',
    modelDisabled: 'The selected model is disabled',
    cancelled: 'Cancelled',
    cancelRequest: 'Request cancelled',
    emptyResult: 'The AI returned an empty result',
    emptyText: 'The AI returned empty text',
    term: {
      analyzing: 'Analyzing text…',
      generating: 'Generating translation…',
      retryingJson: 'Retrying for valid JSON output…',
      done: 'Translation complete',
      unknownError: 'An unknown error occurred during translation',
      emptyText: 'There is no text to translate',
      noJson: 'No valid JSON was found',
      missingField: 'The JSON is missing the t/translation field',
      formatError:
        'Invalid AI response format: {detail}. The retry limit was reached and no valid translation was obtained.',
      termUnsupported: 'The selected model does not support term translation',
      translationUnsupported: 'The selected model does not support translation',
    },
    batchAction: 'Batch processed {count} paragraphs ({preview}{suffix})',
    summaryToolCall: 'Tool call {name} ({id}): {content}',
    summaryToolResult: 'Tool result {name} ({id}): {content}',
  },
};
