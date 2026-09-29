import { isAppLocale } from 'src/models/locale';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';

/** 无书籍时以执行 UI 语言为目标；宿主须为旧书明确传入简中。 */
export function captureExecutionLanguages(
  uiLocale: AppLocale,
  targetLanguage: AppLocale = uiLocale,
): ExecutionLanguages {
  if (!isAppLocale(uiLocale) || !isAppLocale(targetLanguage))
    throw new Error('INVALID_EXECUTION_LANGUAGE');
  return Object.freeze({ uiLocale, targetLanguage });
}
