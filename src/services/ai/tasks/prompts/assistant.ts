import type { AITool } from 'src/services/ai/types/ai-service';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import { captureExecutionLanguages } from '../utils/execution-languages';
import { aiLanguageName } from './language';
import { getToolScopeRules, hasQueryChapterTool } from './common';

export const PERSONA_CORE = translateText('zh-CN', 'aiAssistant.persona');
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
    translateText(locale, 'aiAssistant.persona'),
    todosPrompt,
    translateText(locale, 'aiAssistant.capabilities'),
    getToolScopeRules(tools, locale),
    translateText(locale, 'aiAssistant.principles'),
  ];
  if (hasQueryChapterTool(tools)) sections.push(translateText(locale, 'aiAssistant.semantic'));
  const details = [
    context.currentBookId
      ? translateText(locale, 'aiAssistant.book', { id: context.currentBookId })
      : '',
    context.currentChapterId
      ? translateText(locale, 'aiAssistant.chapter', { id: context.currentChapterId })
      : '',
    context.selectedParagraphId
      ? translateText(locale, 'aiAssistant.paragraph', { id: context.selectedParagraphId })
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (details) sections.push(translateText(locale, 'aiAssistant.context', { details }));
  sections.push(
    translateText(locale, 'aiAssistant.time', {
      time: new Date().toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }),
  );
  const targetLanguage = aiLanguageName(locale, languages.targetLanguage);
  sections.push(translateText(locale, 'aiAssistant.constraints', { targetLanguage }));
  sections.push(
    translateText(locale, 'aiAssistant.reply', {
      targetLanguage,
      dialogLanguage: aiLanguageName(locale, locale),
    }),
  );
  return sections.filter(Boolean).join('\n\n');
}

/** 摘要内的对话、问答和标识均作为数据，不提升为系统指令。 */
export function getStructuredSummaryPrompt(
  previousSummary: string,
  dialogContent: string,
  uiLocale: AppLocale = 'zh-CN',
): string {
  return translateText(uiLocale, 'aiAssistant.summary', {
    previousSummary: previousSummary || translateText(uiLocale, 'aiAssistant.none'),
    dialogContent,
  });
}
