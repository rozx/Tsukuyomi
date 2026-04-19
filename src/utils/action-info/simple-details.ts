import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail } from './types';

/**
 * 批量问答的详情（问题数量 + 每题预览）。
 */
export function appendAskUserBatchDetails(
  details: ActionDetail[],
  action: MessageAction,
): void {
  const questions = action.batch_questions ?? [];
  const answers = action.batch_answers ?? [];

  details.push({ label: '问题数量', value: `${questions.length} 题` });

  for (const ans of answers) {
    const q = questions[ans.question_index] ?? `#${ans.question_index + 1}`;
    const aPreview = ans.answer.length > 120 ? ans.answer.substring(0, 120) + '...' : ans.answer;
    details.push({
      label: `第 ${ans.question_index + 1} 题`,
      value: `${q} → ${aPreview}`,
    });
  }
}

export function appendWebDetails(details: ActionDetail[], action: MessageAction): void {
  if (action.type === 'web_search' && action.entity === 'web' && action.query) {
    details.push({ label: '搜索查询', value: action.query });
  }
  if (action.type === 'web_fetch' && action.entity === 'web' && action.url) {
    details.push({ label: '网页 URL', value: action.url });
  }
}

export function appendTodoDetails(details: ActionDetail[], action: MessageAction): void {
  if (action.entity === 'todo' && action.name) {
    details.push({ label: '内容', value: action.name });
  }
}

export function appendSearchDetails(details: ActionDetail[], action: MessageAction): void {
  if (action.tool_name === 'search_chapter_summaries') {
    if (action.keywords && action.keywords.length > 0) {
      details.push({ label: '搜索关键词', value: action.keywords.join('、') });
    }
  }
  if (action.tool_name === 'search_help_docs') {
    if (action.query) {
      details.push({ label: '搜索查询', value: action.query });
    }
    if (action.name) {
      details.push({ label: '命中文档', value: action.name });
    }
  }
}
