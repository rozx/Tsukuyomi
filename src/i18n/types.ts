import type { default as messages } from 'src/i18n';

/**
 * 支持的消息语言类型
 */
export type MessageLanguages = keyof typeof messages;

/**
 * 消息模式类型（基于 en-US 作为主模式）
 */
export type MessageSchema = (typeof messages)['en-US'];
