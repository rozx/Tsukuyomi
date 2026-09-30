import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';

/**
 * 总结气泡的存储哨兵：写入会话消息并用于清理残留气泡的匹配，保持固定简中值；
 * 显示时经 {@link chatMessageDisplayContent} 按界面语言渲染。
 */
export const SUMMARIZING_MESSAGE_CONTENT = '聊天正在总结中...';
export const SUMMARIZED_BUBBLE_CONTENT = '📝 已完成对话总结';

const SUMMARIZATION_NOTICE_KEYS: Record<string, MessageKey> = {
  [SUMMARIZING_MESSAGE_CONTENT]: 'activityUi.chat.summarizing',
  [SUMMARIZED_BUBBLE_CONTENT]: 'activityUi.chat.summarized',
};

/**
 * 聊天气泡显示内容：系统生成的总结提示按当前界面语言重绘，
 * 其他内容（用户输入、AI 回复等历史自由文本）原样显示。
 */
export function chatMessageDisplayContent(
  message: Pick<ChatSessionMessage, 'content' | 'isSummarization'>,
  locale: AppLocale,
): string {
  const key = message.isSummarization ? SUMMARIZATION_NOTICE_KEYS[message.content] : undefined;
  return key ? translateText(locale, key) : message.content;
}
