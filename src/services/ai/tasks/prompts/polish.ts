import type { TextTaskPromptParams } from './text-task';
import { buildTextTaskSystemPrompt } from './text-task';

export type PolishSystemPromptParams = TextTaskPromptParams;

/** 构建Polish任务指令，沿用捕获的交互与目标语言。 */
export function buildPolishSystemPrompt(params: PolishSystemPromptParams): string {
  return buildTextTaskSystemPrompt('polish', params);
}
