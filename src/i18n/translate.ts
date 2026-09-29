import {
  compile,
  createCoreContext,
  fallbackWithLocaleChain,
  resolveValue,
  translate,
} from '@intlify/core-base';
import messages from './index';
import type { AppLocale } from 'src/models/locale';
import { APP_LOCALES } from 'src/models/locale';
import type { MessageKey } from './types';

function context(locale: AppLocale) {
  return createCoreContext({
    locale,
    fallbackLocale: 'zh-CN',
    messages,
    messageCompiler: compile,
    messageResolver: resolveValue,
    localeFallbacker: fallbackWithLocaleChain,
  });
}

// 各语言上下文互不共享可变 locale；服务端和 AI 工具不依赖 Vue 或 Pinia。
const contexts = {
  'zh-CN': context('zh-CN'),
  'zh-TW': context('zh-TW'),
  'en-US': context('en-US'),
};

export function translateText(
  locale: AppLocale,
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  return String(translate(contexts[locale], key, values));
}

const LANGUAGE_KEYS = {
  'zh-CN': 'settings.general.zhCN',
  'zh-TW': 'settings.general.zhTW',
  'en-US': 'settings.general.enUS',
} as const;

export function languageOptions(locale: AppLocale): Array<{ value: AppLocale; label: string }> {
  return APP_LOCALES.map((value) => ({
    value,
    label: translateText(locale, LANGUAGE_KEYS[value]),
  }));
}
