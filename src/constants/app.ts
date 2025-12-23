/**
 * 应用常量
 * 统一管理应用名称、版本等信息
 */

/**
 * 应用名称常量
 * Tsukuyomi（月詠）是日本神话中的月神
 */
export const APP_NAME = {
  /** 英文名称 */
  en: 'Tsukuyomi',
  /** 中文名称（月詠） */
  zh: '月詠',
  /** 完整英文名称 */
  fullEn: 'Tsukuyomi - Moonlit Translator',
  /** 完整中文名称 */
  fullZh: '月詠 - 月夜翻译器',
  /** 完整名称（中英文） */
  full: 'Tsukuyomi（月詠） - Moonlit Translator',
  /** 显示名称（用于 UI） */
  display: 'Tsukuyomi（月詠）',
  /** 描述 */
  description: {
    en: 'Moonlit Translator',
    zh: '月夜翻译器',
  },
} as const;

/**
 * 应用信息
 */
export const APP_INFO = {
  name: APP_NAME,
  description: {
    en: 'Moonlit Translator',
    zh: '月夜翻译器',
  },
} as const;

