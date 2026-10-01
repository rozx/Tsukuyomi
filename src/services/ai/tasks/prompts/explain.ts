import type { AppLocale } from 'src/models/locale';
import { agentText } from 'src/i18n/translate';
import { aiLanguageName } from './language';

/** 解释指令为简中单源，以界面语言回复；原文不限制语言，用户文本作为参数原样保留。 */
export function buildExplainPrompt(selectedText: string, uiLocale: AppLocale): string {
  return agentText('aiTasks.explain', {
    text: selectedText,
    dialogLanguage: aiLanguageName(uiLocale),
  });
}
