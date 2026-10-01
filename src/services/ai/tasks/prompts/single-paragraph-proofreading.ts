import type { TextTaskPromptParams, SingleParagraphUserPromptParams } from './text-task';
import { buildTextTaskSystemPrompt, buildSingleParagraphUserPrompt } from './text-task';

export type SingleParagraphProofreadingSystemPromptParams = TextTaskPromptParams;

/** 单段任务不注入状态机，只处理当前段落。 */
export function buildSingleParagraphProofreadingSystemPrompt(
  params: SingleParagraphProofreadingSystemPromptParams,
): string {
  return buildTextTaskSystemPrompt('proofreading', params, true);
}

export function buildSingleParagraphProofreadingUserPrompt(
  params: SingleParagraphUserPromptParams,
): string {
  return buildSingleParagraphUserPrompt('proofreading', params);
}
