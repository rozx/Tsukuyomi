import type { AIModel } from '../types/ai-model';
import type { AITool, ChatMessage } from '../types/ai-service';
import { estimateMessagesTokenCount, estimateToolSchemaTokens } from 'src/utils/ai-token-utils';
import { getEstimationMultiplier, observeTokenUsage } from './calibration';
import { canonicalStringify } from 'src/utils/canonical-json';

export interface ContextAnchor {
  inputTokens: number;
  historyLength: number;
  historyFingerprint: string;
  promptFingerprint: string;
  /** 未乘校准系数的系统提示与工具定义估算，避免系数更新引起虚假的提示词差值。 */
  promptTokens: number;
  modelKey: string;
  estimateAtAnchor: number;
}

export interface ContextInput {
  systemPrompt: string;
  tools: AITool[];
  history: ChatMessage[];
  modelKey: string;
  anchor?: ContextAnchor | undefined;
}

// 同步校验仅用于判断内容是否被编辑，不作安全哈希；可直接读取 Vue 响应式对象。
function fingerprint(value: unknown): string {
  const text = canonicalStringify(value);
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function modelContextKey(
  model: Pick<AIModel, 'id' | 'provider' | 'model' | 'baseUrl' | 'thinkingLevel'>,
): string {
  const identity = [model.id, model.provider, model.model, model.baseUrl];
  if (model.thinkingLevel && model.thinkingLevel !== 'provider-default')
    identity.push(model.thinkingLevel);
  return JSON.stringify(identity);
}

function promptMessages(systemPrompt: string): ChatMessage[] {
  return systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
}

function basePromptTokens(input: ContextInput): number {
  return (
    estimateMessagesTokenCount(promptMessages(input.systemPrompt), 1) +
    estimateToolSchemaTokens(input.tools, 1)
  );
}

export function createContextAnchor(
  input: ContextInput,
  inputTokens: number | undefined,
): ContextAnchor | undefined {
  if (inputTokens === undefined || !Number.isFinite(inputTokens) || inputTokens < 0)
    return undefined;
  const promptTokens = basePromptTokens(input);
  const estimateAtAnchor = promptTokens + estimateMessagesTokenCount(input.history, 1);
  observeTokenUsage(input.modelKey, inputTokens, estimateAtAnchor);
  return {
    inputTokens,
    promptTokens,
    estimateAtAnchor,
    modelKey: input.modelKey,
    historyLength: input.history.length,
    historyFingerprint: fingerprint(input.history),
    promptFingerprint: fingerprint([input.systemPrompt, input.tools]),
  };
}

function validAnchor(input: ContextInput, anchor: ContextAnchor): boolean {
  return (
    anchor.modelKey === input.modelKey &&
    Number.isFinite(anchor.inputTokens) &&
    anchor.inputTokens >= 0 &&
    Number.isFinite(anchor.promptTokens) &&
    anchor.promptTokens >= 0 &&
    Number.isFinite(anchor.estimateAtAnchor) &&
    anchor.estimateAtAnchor >= 0 &&
    typeof anchor.promptFingerprint === 'string' &&
    Number.isInteger(anchor.historyLength) &&
    anchor.historyLength >= 0 &&
    anchor.historyLength <= input.history.length &&
    anchor.historyFingerprint === fingerprint(input.history.slice(0, anchor.historyLength))
  );
}

export function measureContext(input: ContextInput): { tokens: number; estimated: boolean } {
  const multiplier = getEstimationMultiplier(input.modelKey);
  const { anchor } = input;
  if (anchor && validAnchor(input, anchor)) {
    const promptDelta =
      anchor.promptFingerprint === fingerprint([input.systemPrompt, input.tools])
        ? 0
        : (basePromptTokens(input) - anchor.promptTokens) * multiplier;
    return {
      tokens: Math.max(
        0,
        Math.ceil(
          anchor.inputTokens +
            promptDelta +
            estimateMessagesTokenCount(input.history.slice(anchor.historyLength), multiplier),
        ),
      ),
      estimated: false,
    };
  }
  return {
    tokens:
      estimateMessagesTokenCount(promptMessages(input.systemPrompt), multiplier) +
      estimateToolSchemaTokens(input.tools, multiplier) +
      estimateMessagesTokenCount(input.history, multiplier),
    estimated: true,
  };
}
