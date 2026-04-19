export { generateShortId, UniqueIdGenerator, extractIds } from './id-generator';
export { formatCharCount, formatWordCount } from './format';
export {
  getChapterCharCount,
  getChapterCharCountAsync,
  getNovelCharCount,
  getNovelCharCountAsync,
  getTotalChapters,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  hasParagraphTranslation,
  ensureChapterContentLoaded,
} from './novel-utils';
export { normalizeTranslationQuotes } from './translation-normalizer';
export { formatTranslationForDisplay } from './translation-utils';
export {
  findUniqueTermsInText,
  findUniqueCharactersInText,
} from './text-matcher';
export { getAssetUrl } from './assets';
export type { DegradationDetectionOptions } from 'src/services/ai/degradation-detector';
export {
  isEmptyParagraph,
  getSelectedTranslation,
  buildOriginalTranslationsMap,
  filterChangedParagraphs,
  reconstructChunkText,
} from './text-utils';
export { formatTaskDuration } from './time-utils';
export { processItemsInBatches } from './yield';
