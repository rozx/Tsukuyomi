import type { AITool } from 'src/services/ai/types/ai-service';
import type { ExecutionLanguages } from 'src/models/locale';
import { captureExecutionLanguages } from '../utils/execution-languages';
import type { TaskType } from '../utils/task-types';
import { translateText } from 'src/i18n/translate';
import { aiLanguageName } from './language';
import { taskPromptLabel } from './runner';
import {
  getSymbolFormatRules,
  getDataManagementRules,
  getHonorificRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
  getToolScopeRules,
  hasQueryChapterTool,
  MAX_TRANSLATION_BATCH_SIZE,
} from './common';

export interface TextTaskPromptParams {
  languages?: ExecutionLanguages;
  todosPrompt?: string;
  bookContextSection?: string;
  chapterContextSection?: string;
  previousChapterSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
  includeChapterTitle?: boolean;
  enableOriginalTextValidation?: boolean;
}

/** 批次与单段复用准确性、语言及符号规则，单段不注入状态机。 */
export function buildTextTaskSystemPrompt(
  taskType: TaskType,
  params: TextTaskPromptParams,
  single = false,
): string {
  const languages = params.languages ?? captureExecutionLanguages('zh-CN');
  const { uiLocale, targetLanguage } = languages;
  const sections = [
    translateText(uiLocale, `aiText.role.${taskType}`, {
      targetLanguage: aiLanguageName(uiLocale, targetLanguage),
    }) +
      (params.todosPrompt ?? '') +
      (params.bookContextSection ?? '') +
      (params.chapterContextSection ?? '') +
      (params.previousChapterSection ?? '') +
      (params.specialInstructionsSection ?? ''),
    translateText(uiLocale, 'aiText.source', {
      targetLanguage: aiLanguageName(uiLocale, targetLanguage),
    }),
    translateText(uiLocale, `aiText.core.${taskType}`, {
      scope: translateText(uiLocale, single ? 'aiText.singleScope' : 'aiText.batchScope'),
    }),
    getSymbolFormatRules(uiLocale, targetLanguage),
    getHonorificRules(languages),
  ];
  if (single) {
    sections.push(
      getToolScopeRules(params.tools, uiLocale),
      translateText(uiLocale, 'aiText.single', {
        query: hasQueryChapterTool(params.tools) ? translateText(uiLocale, 'aiText.query') : '',
        max: MAX_TRANSLATION_BATCH_SIZE,
      }),
    );
  } else {
    sections.push(
      getDataManagementRules(uiLocale),
      getToolUsageInstructions(taskType, params.tools, params.skipAskUser, uiLocale),
      getMemoryWorkflowRules(uiLocale),
      getOutputFormatRules(taskType, { ...params, languages }),
    );
    if (taskType === 'translation')
      sections.push(
        translateText(
          uiLocale,
          hasQueryChapterTool(params.tools) ? 'aiText.lookup' : 'aiText.listLookup',
        ),
      );
  }
  return sections.join('\n\n');
}

export interface SingleParagraphUserPromptParams {
  languages?: ExecutionLanguages;
  paragraphId: string;
  originalText: string;
  currentTranslation: string;
  defaultContext: string;
}

export function buildSingleParagraphUserPrompt(
  taskType: TaskType,
  params: SingleParagraphUserPromptParams,
): string {
  const uiLocale = params.languages?.uiLocale ?? 'zh-CN';
  return translateText(uiLocale, 'aiText.singleUser', {
    task: taskPromptLabel(taskType, uiLocale),
    context: params.defaultContext,
    id: params.paragraphId,
    original: params.originalText,
    translation: params.currentTranslation,
  });
}
