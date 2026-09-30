import type { Novel } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { MessageSchema } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

/**
 * 操作详情项接口
 */
export interface ActionDetail {
  label: string;
  value: string;
}

/**
 * 操作详情上下文接口（用于获取相关数据）
 */
export interface ActionDetailsContext {
  /** 获取书籍的函数 */
  getBookById: (bookId: string) => Novel | undefined;
  /** 获取当前书籍 ID 的函数 */
  getCurrentBookId: () => string | null;
}

/**
 * 文本预览：超过 maxLength 则截断追加 "..."
 */
export function preview(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

type DetailKey = keyof MessageSchema['activityUi']['detail'];

/**
 * 详情固定标签/取值按界面语言渲染；存储的操作只保存结构化字段，显示时再投影。
 */
export function detailText(
  locale: AppLocale,
  key: DetailKey,
  values?: Record<string, string | number>,
): string {
  return translateText(locale, `activityUi.detail.${key}`, values);
}

/** 关键词等列表的界面分隔符（简中「、」，英文「, 」）。 */
export function joinList(locale: AppLocale, items: string[]): string {
  return items.join(translateText(locale, 'activityUi.listSeparator'));
}
