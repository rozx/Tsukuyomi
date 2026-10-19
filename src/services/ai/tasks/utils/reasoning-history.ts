import type { AIReasoningPart, ChatMessage } from 'src/services/ai/types/ai-service';

/**
 * 由模型结果构造 assistant 消息的思考字段：文字供 DeepSeek 等回传 reasoning_content，
 * 带签名的片段供 Anthropic 在后续工具轮次原样回放 thinking 块。
 */
export function assistantReasoningFields(result: {
  reasoningContent?: string | null | undefined;
  reasoningParts?: AIReasoningPart[] | undefined;
}): Pick<ChatMessage, 'reasoning_content' | 'reasoning_parts'> {
  return {
    reasoning_content: result.reasoningContent || null,
    ...(result.reasoningParts?.length ? { reasoning_parts: result.reasoningParts } : {}),
  };
}
