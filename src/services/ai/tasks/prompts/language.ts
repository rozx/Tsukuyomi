import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
const LANGUAGE_KEYS = {
  'zh-CN': 'aiCommon.languages.zhCN',
  'zh-TW': 'aiCommon.languages.zhTW',
  'en-US': 'aiCommon.languages.enUS',
} as const;
/** AI 指令使用执行语言中的语言名称；界面语言选项保留原生名称。 */
export function aiLanguageName(uiLocale: AppLocale, language: AppLocale): string {
  return translateText(uiLocale, LANGUAGE_KEYS[language]);
}
