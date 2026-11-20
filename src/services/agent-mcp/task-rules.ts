import { agentText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import {
  getCoreTaskRules,
  getDataManagementRules,
  getMemoryWorkflowRules,
  getSymbolFormatRules,
} from 'src/services/ai/tasks/prompts/common';
import { aiLanguageName } from 'src/services/ai/tasks/prompts/language';

export type ExternalTaskType = 'translation' | 'polish' | 'proofreading';

/**
 * 给外部 Agent 的翻译规则。正文与站内翻译 / 润色 / 校对任务的系统提示词是同一份文字
 * （src/i18n/zh-CN/ai-text-tasks.ts），只有工具名与阶段限制换成外部的说法，
 * 所以站内规则一改，这里自动跟着变。规则是给模型读的，与站内一样固定用简体中文。
 *
 * @param taskTypes 需要哪些任务的核心规则；公共规则（标点、格式、敬语、数据与记忆管理）只出现一次
 * @param targetLanguage 书籍的目标语言；不知道时同时给出中文与英文两套标点规则
 */
export function buildExternalTaskRules(
  taskTypes: readonly ExternalTaskType[],
  targetLanguage?: AppLocale,
): string {
  const languageName = targetLanguage
    ? aiLanguageName(targetLanguage)
    : agentText('aiText.audience.external.bookTargetLanguage');
  const symbolRules = targetLanguage
    ? [getSymbolFormatRules(targetLanguage)]
    : // 两套标点规则的后半段（保持格式）相同，只保留一份
      [agentText('aiText.symbolChinese'), getSymbolFormatRules('en-US')];
  return [
    agentText('aiText.source', { targetLanguage: languageName }),
    ...taskTypes.map((taskType) => getCoreTaskRules(taskType, { audience: 'external' })),
    ...symbolRules,
    agentText('aiText.honorific', {
      targetLanguage: languageName,
      historyTool: agentText('aiText.audience.external.historyTool'),
    }),
    getDataManagementRules('external'),
    getMemoryWorkflowRules('external'),
  ].join('\n\n');
}
