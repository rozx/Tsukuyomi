import type { AITool } from 'src/services/ai/types/ai-service';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import { AGENT_LOCALE, agentText } from 'src/i18n/translate';
import { captureExecutionLanguages } from '../utils/execution-languages';
import { aiLanguageName, assistantPersona } from './language';
import { getToolScopeRules, hasQueryChapterTool } from './common';

const DEFAULT_LANGUAGES = captureExecutionLanguages('zh-CN');

export function getAssistantSystemPrompt(
  todosPrompt: string,
  tools: AITool[],
  context: {
    currentBookId: string | null;
    currentChapterId: string | null;
    selectedParagraphId: string | null;
  },
  languages: ExecutionLanguages = DEFAULT_LANGUAGES,
): string {
  const locale = languages.uiLocale;
  const sections = [
    assistantPersona(locale),
    todosPrompt,
    agentText('aiAssistant.capabilities'),
    getToolScopeRules(tools, locale),
    agentText('aiAssistant.principles'),
  ];
  if (hasQueryChapterTool(tools)) sections.push(agentText('aiAssistant.semantic'));
  const details = [
    context.currentBookId ? agentText('aiAssistant.book', { id: context.currentBookId }) : '',
    context.currentChapterId
      ? agentText('aiAssistant.chapter', { id: context.currentChapterId })
      : '',
    context.selectedParagraphId
      ? agentText('aiAssistant.paragraph', { id: context.selectedParagraphId })
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (details) sections.push(agentText('aiAssistant.context', { details }));
  sections.push(
    agentText('aiAssistant.time', {
      time: new Date().toLocaleString(AGENT_LOCALE, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }),
  );
  const targetLanguage = aiLanguageName(languages.targetLanguage);
  sections.push(agentText('aiAssistant.constraints', { targetLanguage }));
  sections.push(
    agentText(locale === 'en-US' ? 'aiAssistant.replyNeutral' : 'aiAssistant.reply', {
      targetLanguage,
      dialogLanguage: aiLanguageName(locale),
    }),
  );
  return sections.filter(Boolean).join('\n\n');
}

/** 摘要内的对话、问答和标识均作为数据，不提升为系统指令；摘要展示给用户，以界面语言撰写。 */
export function getStructuredSummaryPrompt(
  previousSummary: string,
  dialogContent: string,
  uiLocale: AppLocale,
): string {
  return agentText('aiAssistant.summary', {
    previousSummary: previousSummary || agentText('aiAssistant.none'),
    dialogContent,
    dialogLanguage: aiLanguageName(uiLocale),
  });
}
