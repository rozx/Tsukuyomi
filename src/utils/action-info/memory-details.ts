import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail } from './types';

export function appendMemoryDetails(details: ActionDetail[], action: MessageAction): void {
  if (action.tool_name === 'search_memories') {
    if (action.keywords && action.keywords.length > 0) {
      details.push({ label: '搜索关键词', value: action.keywords.join('、') });
    }
  } else {
    if (action.memory_id) {
      details.push({ label: 'Memory ID', value: action.memory_id });
    }
    if (action.keyword) {
      details.push({ label: '搜索关键词', value: action.keyword });
    }
    if (action.keywords && action.keywords.length > 0) {
      details.push({ label: '关键词', value: action.keywords.join('、') });
    }
  }
  if (action.name) {
    details.push({ label: '摘要', value: action.name });
  }
}
