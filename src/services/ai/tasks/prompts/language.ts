import { agentText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
const LANGUAGE_KEYS = {
  'zh-CN': 'aiCommon.languages.zhCN',
  'zh-TW': 'aiCommon.languages.zhTW',
  'en-US': 'aiCommon.languages.enUS',
} as const;
/** 简中指令内的语言名称（作为参数值写入）；界面语言选项保留原生名称。 */
export function aiLanguageName(language: AppLocale): string {
  return agentText(LANGUAGE_KEYS[language]);
}

/** 按回复语言选择人格：简繁回复使用月詠人格，英文回复保持中性专业表达。 */
export function assistantPersona(uiLocale: AppLocale): string {
  return agentText(uiLocale === 'en-US' ? 'aiAssistant.personaNeutral' : 'aiAssistant.persona');
}
