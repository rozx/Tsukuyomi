import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail } from './types';
import { detailText, joinList } from './types';

/**
 * 批量问答的详情（问题数量 + 每题预览）。
 */
export function appendAskUserBatchDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale = 'zh-CN',
): void {
  const questions = action.batch_questions ?? [];
  const answers = action.batch_answers ?? [];

  details.push({
    label: detailText(locale, 'questionCount'),
    value: detailText(locale, 'questionCountValue', { count: questions.length }),
  });

  for (const ans of answers) {
    const q = questions[ans.question_index] ?? `#${ans.question_index + 1}`;
    const aPreview = ans.answer.length > 120 ? ans.answer.substring(0, 120) + '...' : ans.answer;
    details.push({
      label: detailText(locale, 'questionIndex', { index: ans.question_index + 1 }),
      value: `${q} → ${aPreview}`,
    });
  }
}

export function appendWebDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.type === 'web_search' && action.entity === 'web' && action.query) {
    details.push({ label: detailText(locale, 'searchQuery'), value: action.query });
  }
  if (action.type === 'web_fetch' && action.entity === 'web' && action.url) {
    details.push({ label: detailText(locale, 'webUrl'), value: action.url });
  }
}

export function appendTodoDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.entity === 'todo' && action.name) {
    details.push({ label: detailText(locale, 'content'), value: action.name });
  }
}

export function appendSearchDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.tool_name === 'search_chapter_summaries') {
    if (action.keywords && action.keywords.length > 0) {
      details.push({
        label: detailText(locale, 'searchKeywords'),
        value: joinList(locale, action.keywords),
      });
    }
  }
  if (action.tool_name === 'search_help_docs') {
    if (action.query) {
      details.push({ label: detailText(locale, 'searchQuery'), value: action.query });
    }
    if (action.name) {
      details.push({ label: detailText(locale, 'matchedDoc'), value: action.name });
    }
  }
}
