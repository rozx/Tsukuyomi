import { getAssistantSystemPrompt } from 'src/services/ai/tasks/prompts/assistant';
import { getTodosSystemPrompt } from 'src/services/ai/tasks/utils/todo-helper';
import { ToolRegistry } from 'src/services/ai/tools';
import type { AITool, ChatMessage as AIChatMessage } from 'src/services/ai/types/ai-service';
import type { ChatSessionMessage, ChatSession } from 'src/stores/chat-sessions';
import { measureContext, modelContextKey } from 'src/services/ai/context/measure';
import type { AIModel } from 'src/services/ai/types/ai-model';

export type SessionWithSummaryIndex = ChatSession & { lastSummarizedMessageIndex?: number };

export interface AssistantContextInfo {
  currentBookId: string | null;
  currentChapterId: string | null;
  selectedParagraphId: string | null;
}

export interface AssistantStatsParams {
  context: AssistantContextInfo;
  session: SessionWithSummaryIndex | null;
  currentMessages: ChatSessionMessage[];
  includeToolSchemas?: boolean;
}

export const buildAssistantMessageHistory = (
  session: SessionWithSummaryIndex | null,
): AIChatMessage[] | undefined => {
  if (!session || !session.messages.length) {
    return undefined;
  }

  // 优先使用完整的 API 消息历史（包含工具调用和结果），确保上下文连续性
  if (session.apiMessageHistory && session.apiMessageHistory.length > 0) {
    return session.apiMessageHistory.map((message) => ({ ...message }));
  }

  // 回退：从 UI 消息重建（不含工具上下文，兼容旧会话）
  const startIndex = session.lastSummarizedMessageIndex ?? 0;
  const sliced = session.messages
    .slice(startIndex)
    .filter(
      (msg) =>
        (msg.role === 'user' || msg.role === 'assistant') &&
        !msg.isSummarization &&
        !msg.isSummaryResponse,
    )
    // [兼容] 过滤空消息：部分 OpenAI 兼容服务会拒绝空 content
    .filter((msg) => Boolean(msg.content && msg.content.trim()))
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  return sliced.length > 0 ? sliced : undefined;
};

const ensurePendingUserMessage = (
  history: AIChatMessage[] | undefined,
  currentMessages: ChatSessionMessage[],
): AIChatMessage[] | undefined => {
  const lastMessage = currentMessages[currentMessages.length - 1];
  const hasPendingUserMessage = lastMessage?.role === 'user';
  if (!hasPendingUserMessage) return history;

  const lastHistoryMessage = history?.[history.length - 1];
  if (lastHistoryMessage?.role === 'user' && lastHistoryMessage.content === lastMessage.content) {
    return history;
  }

  return [
    ...(history ?? []),
    {
      role: 'user',
      content: lastMessage.content,
    },
  ];
};

const buildAssistantSystemPromptForStats = (
  context: AssistantContextInfo,
  session: SessionWithSummaryIndex | null,
): { prompt: string; tools: AITool[] } => {
  const tools = ToolRegistry.getAssistantToolsExcludingTranslationManagement(
    context.currentBookId || undefined,
  );
  const todosPrompt = getTodosSystemPrompt(!!session?.id);
  let systemPrompt = getAssistantSystemPrompt(todosPrompt, tools, context);
  if (session?.summary) {
    systemPrompt += `\n\n## 之前的对话总结\n\n${session.summary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
  }
  return { prompt: systemPrompt, tools };
};

export const measureAssistantContext = (params: AssistantStatsParams, model: AIModel) => {
  const { context, session, currentMessages } = params;
  const { prompt, tools } = buildAssistantSystemPromptForStats(context, session);
  const history =
    ensurePendingUserMessage(buildAssistantMessageHistory(session), currentMessages) || [];
  return measureContext({
    systemPrompt: prompt,
    tools: params.includeToolSchemas === false ? [] : tools,
    history,
    anchor: session?.contextAnchor,
    modelKey: modelContextKey(model),
  });
};
