import { AGENT_LOCALE } from 'src/i18n/translate';
import { LocalizedError } from 'src/utils/localized-error';
import type { MessageKey } from 'src/i18n/types';
import type {
  AITool,
  AIToolCall,
  AIToolCallResult,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import { captureExecutionLanguages } from './execution-languages';
import type { ContextAnchor } from 'src/services/ai/context/measure';

export type AssistantPauseReason = 'waiting_user' | 'user' | 'tool_limit' | 'context_limit';
export interface AssistantExecutionCheckpoint {
  uiLocale?: AppLocale;
  messages: ChatMessage[];
  remainingCalls: AIToolCall[];
  completedCallIds: string[];
  summary?: string;
  contextAnchor?: ContextAnchor;
  deferredUserMessage?: string;
}
interface ToolOutcome {
  result?: AIToolCallResult;
  pause?: AssistantPauseReason;
  /** 执行器已把副作用、结果和 afterResult 检查点放在同一事务中提交。 */
  checkpointCommitted?: boolean;
}
export interface AssistantExecutionProfile {
  languages?: ExecutionLanguages;
  context: {
    currentBookId: string | null;
    currentChapterId: string | null;
    hoveredParagraphId: string | null;
    selectedParagraphId: string | null;
  };
  tools: AITool[];
  systemPrompt(summary?: string): Promise<string>;
  executeTool(
    call: AIToolCall,
    options: {
      afterResult(result: AIToolCallResult): AssistantExecutionCheckpoint;
      signal?: AbortSignal;
    },
  ): Promise<ToolOutcome>;
  saveCheckpoint(
    checkpoint: AssistantExecutionCheckpoint,
    state: { phase: 'running' | 'response' | 'paused' | 'complete'; reason?: AssistantPauseReason },
  ): Promise<void>;
  resume?: AssistantExecutionCheckpoint;
  maxToolTurns?: number;
}

function executionError(code: string, locale: AppLocale, key: MessageKey): LocalizedError {
  const error = new LocalizedError(code, key, {}, locale);
  error.message = `${error.code}: ${error.message}`;
  return error;
}

export class AssistantExecutionPaused extends Error {
  constructor(
    readonly reason: AssistantPauseReason,
    readonly checkpoint: AssistantExecutionCheckpoint,
  ) {
    super(`ASSISTANT_PAUSED: ${reason}`);
  }
}

/** 只适配执行上下文和步骤保存；流式请求、工具循环及摘要仍由 AssistantService 执行。 */
export class AssistantExecution {
  private current: AssistantExecutionCheckpoint;
  readonly maxToolTurns: number;
  readonly languages: ExecutionLanguages;

  constructor(readonly profile: AssistantExecutionProfile) {
    const uiLocale = profile.languages?.uiLocale ?? profile.resume?.uiLocale ?? 'zh-CN';
    this.languages = captureExecutionLanguages(
      uiLocale,
      profile.languages?.targetLanguage ?? uiLocale,
    );
    this.current = structuredClone(
      profile.resume ?? { messages: [], remainingCalls: [], completedCallIds: [] },
    );
    this.current.uiLocale = this.languages.uiLocale;
    this.maxToolTurns = Math.min(50, Math.max(1, profile.maxToolTurns ?? 50));
  }
  get context() {
    return this.profile.context;
  }
  get tools() {
    return this.profile.tools;
  }
  get pendingCalls() {
    return this.current.remainingCalls;
  }
  get history() {
    return this.current.messages;
  }
  get summary() {
    return this.current.summary;
  }
  get contextAnchor() {
    return this.current.contextAnchor;
  }
  setContextAnchor(anchor: ContextAnchor | undefined): void {
    if (anchor) this.current.contextAnchor = anchor;
    else delete this.current.contextAnchor;
  }
  prompt() {
    return this.profile.systemPrompt(this.current.summary);
  }
  setSummary(summary: string | undefined): void {
    if (summary) this.current.summary = summary;
    else delete this.current.summary;
    delete this.current.contextAnchor;
  }

  initializeMessages(
    systemPrompt: string,
    userMessage: string,
    history: ChatMessage[] | undefined,
  ): ChatMessage[] {
    const messages = structuredClone(this.profile.resume?.messages ?? history ?? []);
    const index = messages.findIndex((message) => message.role === 'system');
    if (index >= 0) messages[index] = { role: 'system', content: systemPrompt };
    else messages.unshift({ role: 'system', content: systemPrompt });
    if (userMessage.trim()) {
      if (this.pendingCalls.length) this.current.deferredUserMessage = userMessage;
      else messages.push({ role: 'user', content: userMessage });
    }
    return messages;
  }

  normalizeCalls(calls: AIToolCall[]): AIToolCall[] {
    for (const call of calls) {
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(call.function.arguments);
      } catch {
        throw executionError(
          'INCOMPLETE_TOOL_CALL',
          this.languages.uiLocale,
          'aiToolFeedback.incompleteCallJson',
        );
      }
      if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue))
        throw executionError(
          'INCOMPLETE_TOOL_CALL',
          this.languages.uiLocale,
          'aiToolFeedback.incompleteCallObject',
        );
    }
    // 兼容服务常在每次回复中复用 tool_call_0；宿主身份必须跨恢复和多轮唯一。
    return calls.map((call) => ({
      ...call,
      id: `call_${crypto.randomUUID()}`,
      function: { ...call.function },
    }));
  }

  private snapshot(
    messages: ChatMessage[],
    remainingCalls: AIToolCall[],
    completed = this.current.completedCallIds,
  ): AssistantExecutionCheckpoint {
    return structuredClone({
      ...this.current,
      messages,
      remainingCalls,
      completedCallIds: completed,
    });
  }
  private async save(
    checkpoint: AssistantExecutionCheckpoint,
    phase: 'running' | 'response' | 'paused' | 'complete',
    reason?: AssistantPauseReason,
  ): Promise<void> {
    await this.profile.saveCheckpoint(checkpoint, { phase, ...(reason ? { reason } : {}) });
    this.current = checkpoint;
  }
  async recordReply(messages: ChatMessage[], calls: AIToolCall[]): Promise<void> {
    await this.save(this.snapshot(messages, calls), 'response');
  }
  async begin(messages: ChatMessage[]): Promise<void> {
    await this.save(this.snapshot(messages, this.pendingCalls), 'running');
  }
  async beforeRequest(messages: ChatMessage[], signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw await this.stop('user');
    const prompt = await this.prompt();
    const index = messages.findIndex((message) => message.role === 'system');
    if (index >= 0) messages[index] = { role: 'system', content: prompt };
    else messages.unshift({ role: 'system', content: prompt });
    if (this.current.deferredUserMessage) {
      messages.push({ role: 'user', content: this.current.deferredUserMessage });
      delete this.current.deferredUserMessage;
    }
    await this.save(this.snapshot(messages, []), 'running');
  }

  async runTools(
    calls: AIToolCall[],
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<void> {
    const allowed = new Set(this.tools.map((tool) => tool.function.name));
    for (let index = 0; index < calls.length; index++) {
      if (signal?.aborted) throw await this.stop('user');
      const call = calls[index]!;
      const afterResult = (result: AIToolCallResult) =>
        this.snapshot([...messages, result], calls.slice(index + 1), [
          ...this.current.completedCallIds,
          call.id,
        ]);
      const outcome: ToolOutcome = allowed.has(call.function.name)
        ? await this.profile.executeTool(call, { afterResult, ...(signal ? { signal } : {}) })
        : {
            result: {
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({
                success: false,
                // 返回给模型的说明固定简中
                error: executionError(
                  'TOOL_NOT_ALLOWED',
                  AGENT_LOCALE,
                  'aiToolFeedback.toolNotAllowed',
                ).message,
                error_code: 'TOOL_NOT_ALLOWED',
              }),
            },
          };
      if (outcome.result) {
        if (outcome.result.tool_call_id !== call.id || outcome.result.name !== call.function.name)
          throw executionError(
            'TOOL_PAIR',
            this.languages.uiLocale,
            'aiToolFeedback.toolPairIdentity',
          );
        const next = afterResult(outcome.result);
        if (outcome.checkpointCommitted) this.current = next;
        else await this.save(next, 'running');
        messages.push(outcome.result);
      } else if (!outcome.pause)
        throw executionError(
          'TOOL_PAIR',
          this.languages.uiLocale,
          'aiToolFeedback.toolPairMissing',
        );
      if (outcome.pause) throw await this.stop(outcome.pause);
    }
  }

  async stop(reason: AssistantPauseReason): Promise<AssistantExecutionPaused> {
    await this.save(this.current, 'paused', reason);
    return new AssistantExecutionPaused(reason, structuredClone(this.current));
  }
  async complete(messages: ChatMessage[]): Promise<void> {
    await this.save(this.snapshot(messages, []), 'complete');
  }
}
