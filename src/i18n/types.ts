import type { default as messages } from 'src/i18n';
import type { AppLocale } from 'src/models/locale';

/**
 * 支持的消息语言类型
 */
export type MessageLanguages = AppLocale;

/**
 * 消息模式类型（基于 en-US 作为主模式）
 */
export type MessageSchema = (typeof messages)['en-US'];

type StringPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends object
        ? `${K}.${StringPaths<T[K]>}`
        : never;
}[keyof T & string];

export type MessageKey = StringPaths<MessageSchema>;
