import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';

/** 解释使用界面语言，原文不限制语言；用户文本作为参数原样保留。 */
export function buildExplainPrompt(selectedText: string, uiLocale: AppLocale = 'zh-CN'): string {
  return translateText(uiLocale, 'aiTasks.explain', { text: selectedText });
}
