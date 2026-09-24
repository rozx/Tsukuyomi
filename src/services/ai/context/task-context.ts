import type { AIService, TextGenerationRequest } from '../types/ai-service';
import type { AIProcessingStore } from '../tasks/utils/task-types';
import { createContextAnchor, measureContext } from './measure';
import type { ContextAnchor } from './measure';

/** 翻译类任务只更新度量，不改变现有历史或工具循环策略。 */
export function withContextUsage(
  generateText: AIService['generateText'],
  options: {
    modelKey: string;
    contextWindow: number | undefined;
    aiProcessingStore: AIProcessingStore | undefined;
    taskId: string | undefined;
  },
): AIService['generateText'] {
  let anchor: ContextAnchor | undefined;
  function input(request: TextGenerationRequest) {
    const messages =
      request.messages ??
      (request.prompt ? [{ role: 'user' as const, content: request.prompt }] : []);
    return {
      modelKey: options.modelKey,
      systemPrompt: messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content ?? '')
        .join('\n\n'),
      tools: request.tools ?? [],
      history: messages.filter((m) => m.role !== 'system'),
      anchor,
    };
  }
  async function update(request: TextGenerationRequest) {
    if (!options.aiProcessingStore || !options.taskId) return;
    const measured = measureContext(input(request));
    await options.aiProcessingStore.updateTask(options.taskId, {
      contextTokens: measured.tokens,
      contextEstimated: measured.estimated,
      contextWindow: options.contextWindow,
      contextPercentage: options.contextWindow
        ? Math.round((measured.tokens / options.contextWindow) * 100)
        : undefined,
    });
  }
  return async (config, request, onChunk) => {
    await update(request);
    const result = await generateText(config, request, onChunk);
    anchor = createContextAnchor(input(request), result.usage?.inputTokens);
    await update(request);
    return result;
  };
}
