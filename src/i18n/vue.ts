import { createI18n } from 'vue-i18n';
import messages from './index';
import type { AppLocale } from 'src/models/locale';
import type { MessageSchema } from './types';

const dates = {
  short: { year: 'numeric', month: '2-digit', day: '2-digit' },
  long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
} as const;
const numbers = { decimal: { style: 'decimal' }, percent: { style: 'percent' } } as const;

export function createAppI18n(locale: AppLocale) {
  return createI18n<{ message: MessageSchema }, AppLocale, false>({
    locale,
    fallbackLocale: 'zh-CN',
    legacy: false,
    messages,
    datetimeFormats: { 'zh-CN': dates, 'zh-TW': dates, 'en-US': dates },
    numberFormats: { 'zh-CN': numbers, 'zh-TW': numbers, 'en-US': numbers },
  });
}
