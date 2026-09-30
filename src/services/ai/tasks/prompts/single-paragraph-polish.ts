import type { TextTaskPromptParams, SingleParagraphUserPromptParams } from './text-task';
import { buildTextTaskSystemPrompt, buildSingleParagraphUserPrompt } from './text-task';

export type SingleParagraphPolishSystemPromptParams = TextTaskPromptParams;

/** 单段任务不注入状态机，只处理当前段落。 */
export function buildSingleParagraphPolishSystemPrompt(
  params: SingleParagraphPolishSystemPromptParams,
): string {
  return buildTextTaskSystemPrompt('polish', params, true);
}

export function buildSingleParagraphPolishUserPrompt(
  params: SingleParagraphUserPromptParams,
): string {
  return buildSingleParagraphUserPrompt('polish', params);
}
