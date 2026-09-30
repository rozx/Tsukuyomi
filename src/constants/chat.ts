import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';

/**
 * 当模型没有正文只调用工具时使用的占位符。
 * 老对话历史里仍可能存在 `（调用工具）` / `(调用工具)`，过滤器需向后兼容。
 * 该占位符写入发送给模型的对话历史（模型可见数据），保持简中单源。
 */
export const TOOL_CALL_PLACEHOLDER = '（月詠施术中）';

/**
 * 需要从输出、计数、摘要输入中过滤掉的工具调用占位符变体集合。
 */
export const TOOL_CALL_PLACEHOLDER_VARIANTS = [
  TOOL_CALL_PLACEHOLDER,
  '（调用工具）',
  '(调用工具)',
] as const;

/**
 * 新会话的默认标题哨兵：持久化存储并用于判断「尚未自动命名」，
 * 因此保持固定简中值；界面显示时经 {@link sessionDisplayTitle} 投影为当前语言。
 */
export const DEFAULT_SESSION_TITLE = '新会话';

/** 会话标题显示：默认哨兵按界面语言显示，用户消息生成的标题原样显示。 */
export function sessionDisplayTitle(title: string, locale: AppLocale): string {
  return title === DEFAULT_SESSION_TITLE
    ? translateText(locale, 'activityUi.chat.newSession')
    : title;
}
