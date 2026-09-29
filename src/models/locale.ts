/** 界面与书籍目标支持的语言；原文语言不受此列表限制。 */
export const APP_LOCALES = ['zh-CN', 'zh-TW', 'en-US'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return APP_LOCALES.some((locale) => locale === value);
}

/** 同步主方未明确选过语言时，保留另一方的有效偏好。 */
export function mergeUiLocalePreference(
  primary: unknown,
  secondary: unknown,
): AppLocale | undefined {
  if (isAppLocale(primary)) return primary;
  return isAppLocale(secondary) ? secondary : undefined;
}

export function resolveAppLocale(saved: unknown, preferred: readonly unknown[] = []): AppLocale {
  if (isAppLocale(saved)) return saved;
  for (const value of preferred) {
    if (typeof value !== 'string' || !value) continue;
    try {
      const locale = new Intl.Locale(value);
      if (locale.language === 'en') return 'en-US';
      if (locale.language !== 'zh') continue;
      if (locale.script === 'Hant') return 'zh-TW';
      if (locale.script === 'Hans') return 'zh-CN';
      return ['TW', 'HK', 'MO'].includes(locale.region ?? '') ? 'zh-TW' : 'zh-CN';
    } catch {
      // 历史设置或环境可能包含不合法的语言标记，继续检查下一个首选值。
    }
  }
  return 'zh-CN';
}
