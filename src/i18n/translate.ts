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
import type { AgentMessageKey, MessageKey } from './types';

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

/** 模型可见文字的唯一语言：提示词、工具说明与工具返回保持简中单源。 */
export const AGENT_LOCALE: AppLocale = 'zh-CN';

/**
 * 读取只给模型阅读的文字（简中单源）。界面语言与目标语言应作为参数值写入，
 * 不作为查找语言；用户可见文字使用 translateText。
 */
export function agentText(
  key: AgentMessageKey,
  values: Record<string, string | number> = {},
): string {
  return String(translate(contexts[AGENT_LOCALE], key, values));
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

const LANGUAGE_NAME_KEYS = {
  'zh-CN': 'aiCommon.languages.zhCN',
  'zh-TW': 'aiCommon.languages.zhTW',
  'en-US': 'aiCommon.languages.enUS',
} as const;

/** 界面上显示的语言名称（按界面语言本地化；语言选择器使用原生名称，见 languageOptions）。 */
export function languageName(locale: AppLocale, language: AppLocale): string {
  return translateText(locale, LANGUAGE_NAME_KEYS[language]);
}
