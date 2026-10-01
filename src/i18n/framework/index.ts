import enUS from './en-US';
import zhCN from './zh-CN';
import zhTW from './zh-TW';
import type { AppLocale } from 'src/models/locale';

const primeVueLocales = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'en-US': enUS };

export function getPrimeVueLocale(locale: AppLocale) {
  return structuredClone(primeVueLocales[locale]);
}
