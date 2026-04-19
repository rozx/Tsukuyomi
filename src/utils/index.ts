export { generateShortId, UniqueIdGenerator, extractIds } from './id-generator';
export { formatCharCount, formatWordCount } from './format';
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
  normalizeChapterTitle,
  getCharacterNameVariants,
  isEmptyParagraph,
  hasParagraphTranslation,
  ensureChapterContentLoaded,
} from './novel-utils';
export { normalizeTranslationQuotes } from './translation-normalizer';
export { formatTranslationForDisplay } from './translation-utils';
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
export type { DegradationDetectionOptions } from 'src/services/ai/degradation-detector';
export {
  isEmptyOrSymbolOnly,
  isSymbolOnly,
  getSelectedTranslation,
  buildOriginalTranslationsMap,
  hasTranslationChanged,
  filterChangedParagraphs,
  reconstructChunkText,
} from './text-utils';
export { formatTaskDuration } from './time-utils';
export { processItemsInBatches } from './yield';
