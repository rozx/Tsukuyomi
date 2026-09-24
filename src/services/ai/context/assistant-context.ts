import type { AIModel } from '../types/ai-model';
import type { AITool, ChatMessage, TextGenerationResult } from '../types/ai-service';
import type { AssistantServiceOptions } from '../tasks/assistant-service';
import type { EffectiveModelLimits } from '../model-limits/resolve';
import type { ContextAnchor } from './measure';
import { createContextAnchor, measureContext, modelContextKey } from './measure';
import { compactHistory } from './compact-history';
import { contextBudgets } from './constants';
import { isContextOverflowError } from './context-overflow';
import { isCancelledError } from 'src/utils/is-cancelled-error';
import { showToolToast } from '../tools/toast-helper';

/** 单次助手回复的上下文状态；请求入口统一负责预判和一次溢出恢复。 */
export class AssistantContext {
  private summary: string | undefined;
  private anchor: ContextAnchor | undefined;
  private compacted = false;

  constructor(
    private readonly input: {
      model: AIModel;
      limits: EffectiveModelLimits;
      messages: ChatMessage[];
      tools: AITool[];
      options: AssistantServiceOptions;
      taskId: string | undefined;
      signal: AbortSignal | undefined;
      prompt(summary?: string): string;
    },
  ) {
    this.summary = input.options.execution?.summary ?? input.options.sessionSummary;
    this.anchor = input.options.execution?.contextAnchor ?? input.options.contextAnchor;
  }

  get result() {
    return { contextAnchor: this.anchor, ...(this.compacted ? { summary: this.summary } : {}) };
  }

  private measurementInput() {
    const { messages, tools, model } = this.input;
    return {
      systemPrompt: messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content ?? '')
        .join('\n\n'),
      tools,
      history: messages.filter((m) => m.role !== 'system'),
      modelKey: modelContextKey(model),
      anchor: this.anchor,
    };
  }

  private async updateUsage(): Promise<void> {
    const { options, taskId, limits } = this.input;
    if (!taskId || !options.aiProcessingStore) return;
    const measured = measureContext(this.measurementInput());
    await options.aiProcessingStore.updateTask(taskId, {
      contextTokens: measured.tokens,
      contextEstimated: measured.estimated,
      contextWindow: limits.contextWindow,
      contextPercentage: limits.contextWindow
        ? Math.round((measured.tokens / limits.contextWindow) * 100)
        : undefined,
    });
  }

  private snapshot() {
    return {
      messages: [...this.input.messages],
      summary: this.summary,
      anchor: this.anchor,
      compacted: this.compacted,
    };
  }

  private restore(state: ReturnType<AssistantContext['snapshot']>): void {
    this.input.messages.splice(0, this.input.messages.length, ...state.messages);
    this.summary = state.summary;
    this.anchor = state.anchor;
    this.compacted = state.compacted;
    this.input.options.execution?.setSummary(state.summary);
    this.input.options.execution?.setContextAnchor(state.anchor);
  }

  private async compact(keepRecentBudget: number): Promise<boolean> {
    const { model, messages, options, signal } = this.input;
    const history = messages.filter((m) => m.role !== 'system');
    const pinnedIndex = history.findLastIndex((m) => m.role === 'user');
    const before = this.snapshot();
    let started = false;
    try {
      const result = await compactHistory(
        {
          history,
          pinnedIndex,
          keepRecentBudget,
          model,
          signal,
          previousSummary: this.summary,
        },
        async () => {
          started = true;
          await options.onSummarizingStart?.();
        },
      );
      if (!result) return false;
      signal?.throwIfAborted();
      const systemPrompt = options.execution
        ? await options.execution.profile.systemPrompt(result.summary)
        : this.input.prompt(result.summary);
      this.summary = result.summary;
      this.anchor = undefined;
      this.compacted = true;
      options.execution?.setSummary(result.summary);
      messages.splice(
        0,
        messages.length,
        { role: 'system', content: systemPrompt },
        ...result.keep,
      );
      await options.execution?.beforeRequest(messages, signal);
      return true;
    } catch (error) {
      this.restore(before);
      throw error;
    } finally {
      if (started) await options.onSummarizingEnd?.();
    }
  }

  private async prepare(): Promise<void> {
    const { options, messages, signal, limits } = this.input;
    signal?.throwIfAborted();
    await options.execution?.beforeRequest(messages, signal);
    const budgets = contextBudgets(limits);
    if (
      budgets.threshold !== undefined &&
      measureContext(this.measurementInput()).tokens > budgets.threshold
    ) {
      try {
        await this.compact(budgets.keepRecentBudget);
      } catch (error) {
        if (signal?.aborted || isCancelledError(error)) throw error;
        showToolToast(
          {
            severity: 'warn',
            summary: '上下文压缩失败',
            detail: '原始历史已保留，将继续发送本次请求。',
            life: 5000,
          },
          options.onToast,
        );
      }
    }
    await this.updateUsage();
  }

  async generate(request: () => Promise<TextGenerationResult>): Promise<TextGenerationResult> {
    await this.prepare();
    this.input.signal?.throwIfAborted();
    let response: TextGenerationResult;
    try {
      response = await request();
    } catch (error) {
      if (this.input.signal?.aborted || !isContextOverflowError(error)) throw error;
      response = await this.recover(request, error);
    }
    this.input.signal?.throwIfAborted();
    this.anchor = createContextAnchor(this.measurementInput(), response.usage?.inputTokens);
    this.input.options.execution?.setContextAnchor(this.anchor);
    await this.updateUsage();
    return response;
  }

  private async recover(
    request: () => Promise<TextGenerationResult>,
    original: unknown,
  ): Promise<TextGenerationResult> {
    const { options, messages, signal, limits } = this.input;
    const before = this.snapshot();
    try {
      if (!(await this.compact(contextBudgets(limits).keepRecentBudget / 2))) throw original;
      return await request();
    } catch (error) {
      this.restore(before);
      if (signal?.aborted || isCancelledError(error)) throw error;
      if (options.execution) {
        await options.execution.beforeRequest(messages, signal);
        throw await options.execution.stop('context_limit');
      }
      throw new Error('会话超出模型上下文，压缩后仍无法继续。请新建会话或改用更大窗口的模型。', {
        cause: error,
      });
    }
  }
}
