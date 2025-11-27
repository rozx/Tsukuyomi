export { generateShortId, UniqueIdGenerator, extractIds } from './id-generator';
export { runWithConcurrencyLimit } from './concurrency';
export { formatNumber, formatCharCount, formatWordCount } from './format';
export {
  getChapterCharCount,
  getChapterCharCountAsync,
  getVolumeCharCount,
  getVolumeCharCountAsync,
  getNovelCharCount,
  getNovelCharCountAsync,
  getTotalChapters,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  getCharacterNameVariants,
  isEmptyParagraph,
  hasParagraphTranslation,
  ensureChapterContentLoaded,
} from './novel-utils';
export { normalizeTranslationQuotes, normalizeTranslationSymbols } from './translation-normalizer';
export {
  escapeRegex,
  matchTermsInText,
  matchCharactersInText,
  parseTextForHighlighting,
  findUniqueTermsInText,
  findUniqueCharactersInText,
  countNamesInText,
  calculateCharacterScores,
} from './text-matcher';
export { getAssetUrl } from './assets';
export { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
export type { DegradationDetectionOptions } from 'src/services/ai/degradation-detector';
export { isEmptyOrSymbolOnly } from './text-utils';
export { isTimeDifferent, isNewlyAdded } from './time-utils';
export { yieldToEventLoop, processInBatches, processItemsInBatches } from './yield';
