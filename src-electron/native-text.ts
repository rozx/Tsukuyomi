import { isAppLocale } from '../src/models/locale';
import type { AppLocale } from '../src/models/locale';
import { translateText } from '../src/i18n/translate';
import type { MessageKey } from '../src/i18n/types';

let locale: AppLocale = 'zh-CN';

export function setNativeLocale(value: unknown): void {
  if (!isAppLocale(value)) throw new Error(translateText(locale, 'native.invalidLocale'));
  locale = value;
}

export function nativeText(
  key: Extract<MessageKey, `native.${string}`>,
  values?: Record<string, string | number>,
): string {
  return translateText(locale, key, values);
}
