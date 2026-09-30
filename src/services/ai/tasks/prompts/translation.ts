import type { TextTaskPromptParams } from './text-task';
import { buildTextTaskSystemPrompt } from './text-task';

export type TranslationSystemPromptParams = TextTaskPromptParams;

/** 构建Translation任务指令，沿用捕获的交互与目标语言。 */
export function buildTranslationSystemPrompt(params: TranslationSystemPromptParams): string {
  return buildTextTaskSystemPrompt('translation', params);
}
