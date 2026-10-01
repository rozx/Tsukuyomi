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

export type StringPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends object
        ? `${K}.${StringPaths<T[K]>}`
        : never;
}[keyof T & string];

export type MessageKey = StringPaths<MessageSchema>;

/**
 * 模型可见文字的 key：以简中资源为准，包含只存在于简中的模型专用文字。
 * 用户可见文字必须三语齐全，因此 MessageKey 仍以英文资源为准。
 */
export type AgentMessageKey = StringPaths<(typeof messages)['zh-CN']>;
