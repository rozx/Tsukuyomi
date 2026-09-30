import type { ExecutionLanguages } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import { aiLanguageName } from './language';
import { captureExecutionLanguages } from '../utils/execution-languages';

const DEFAULT_LANGUAGES = captureExecutionLanguages('zh-CN');
function values(languages: ExecutionLanguages) {
  return {
    targetLanguage: aiLanguageName(languages.uiLocale, languages.targetLanguage),
    example: JSON.stringify({ t: translateText(languages.uiLocale, 'aiTasks.term.example') }),
  };
}
export interface TermTranslationSystemPromptParams {
  languages?: ExecutionLanguages;
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
}

export function buildTermTranslationSystemPromptBase(languages = DEFAULT_LANGUAGES): string {
  return translateText(languages.uiLocale, 'aiTasks.term.base', values(languages));
}
export function buildTermTranslationSystemPrompt(
  params: TermTranslationSystemPromptParams,
): string {
  const {
    languages = DEFAULT_LANGUAGES,
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
  } = params;
  return (
    buildTermTranslationSystemPromptBase(languages) +
    bookContextSection +
    chapterContextSection +
    specialInstructionsSection +
    '\n\n' +
    translateText(languages.uiLocale, 'aiTasks.term.rules', values(languages))
  );
}
export interface TermTranslationUserPromptParams {
  languages?: ExecutionLanguages;
  text: string;
  relatedContextInfo?: string | undefined;
  customPrompt?: string | undefined;
}
export function buildTermTranslationUserPrompt(params: TermTranslationUserPromptParams): string {
  const { languages = DEFAULT_LANGUAGES, text, relatedContextInfo = '', customPrompt } = params;
  if (customPrompt) return customPrompt;
  return translateText(languages.uiLocale, 'aiTasks.term.user', {
    ...values(languages),
    text,
    relatedContextInfo,
  });
}
export function buildTermTranslationRetryPrompt(languages = DEFAULT_LANGUAGES): string {
  return translateText(languages.uiLocale, 'aiTasks.term.retry', values(languages));
}
