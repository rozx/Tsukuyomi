import type { TextTaskPromptParams } from './text-task';
import { buildTextTaskSystemPrompt } from './text-task';

export type ProofreadingSystemPromptParams = TextTaskPromptParams;

/** 构建Proofreading任务指令，沿用捕获的交互与目标语言。 */
export function buildProofreadingSystemPrompt(params: ProofreadingSystemPromptParams): string {
  return buildTextTaskSystemPrompt('proofreading', params);
}
