import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail } from './types';
import { detailText, joinList } from './types';

export function appendMemoryDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale = 'zh-CN',
): void {
  const hasKeywords = !!action.keywords && action.keywords.length > 0;
  if (action.tool_name === 'search_memories') {
    if (hasKeywords) {
      details.push({
        label: detailText(locale, 'searchKeywords'),
        value: joinList(locale, action.keywords!),
      });
    }
  } else {
    if (action.memory_id) {
      details.push({ label: detailText(locale, 'memoryId'), value: action.memory_id });
    }
    if (action.keyword) {
      details.push({ label: detailText(locale, 'searchKeywords'), value: action.keyword });
    }
    if (hasKeywords) {
      details.push({
        label: detailText(locale, 'keywords'),
        value: joinList(locale, action.keywords!),
      });
    }
  }
  if (action.name) {
    details.push({ label: detailText(locale, 'summary'), value: action.name });
  }
}
