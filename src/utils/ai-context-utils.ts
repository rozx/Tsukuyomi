import { getAssistantSystemPrompt } from 'src/services/ai/tasks/prompts/assistant';
import { getTodosSystemPrompt } from 'src/services/ai/tasks/utils/todo-helper';
import { ToolRegistry } from 'src/services/ai/tools';
import type { AITool, ChatMessage as AIChatMessage } from 'src/services/ai/types/ai-service';
import type { ChatMessage, ChatSession } from 'src/stores/chat-sessions';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';

export type SessionWithSummaryIndex = ChatSession & { lastSummarizedMessageIndex?: number };

export interface AssistantContextInfo {
  currentBookId: string | null;
  currentChapterId: string | null;
  selectedParagraphId: string | null;
}

export interface AssistantStatsParams {
  context: AssistantContextInfo;
  session: SessionWithSummaryIndex | null;
  currentMessages: ChatMessage[];
  includeToolSchemas?: boolean;
}

export const buildAssistantMessageHistory = (
  session: SessionWithSummaryIndex | null,
): AIChatMessage[] | undefined => {
  if (!session || !session.messages.length) {
    return undefined;
  }
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
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  return sliced.length > 0 ? sliced : undefined;
};

const ensurePendingUserMessage = (
  history: AIChatMessage[] | undefined,
  currentMessages: ChatMessage[],
): AIChatMessage[] | undefined => {
  if (!history || history.length === 0) return history;
  const lastMessage = currentMessages[currentMessages.length - 1];
  const hasPendingUserMessage = lastMessage?.role === 'user';
  if (!hasPendingUserMessage) return history;

  const lastHistoryMessage = history[history.length - 1];
  if (lastHistoryMessage?.role === 'user' && lastHistoryMessage.content === lastMessage.content) {
    return history;
  }

  return [
    ...history,
    {
      role: 'user',
      content: lastMessage.content,
    },
  ];
};

const safeStringifyTools = (tools: AITool[]): string => {
  try {
    return JSON.stringify(tools);
  } catch (error) {
    console.warn('Tool schema serialization error:', error);
    return '[tools_serialization_failed]';
  }
};

const buildAssistantSystemPromptForStats = (
  context: AssistantContextInfo,
  session: SessionWithSummaryIndex | null,
): { prompt: string; tools: AITool[] } => {
  const tools = ToolRegistry.getAllTools(context.currentBookId || undefined).filter(
    (tool) => tool.function.name !== 'add_translation_batch',
  );
  const todosPrompt = getTodosSystemPrompt(undefined, session?.id);
  let systemPrompt = getAssistantSystemPrompt(todosPrompt, tools, context);
  if (session?.summary) {
    systemPrompt += `\n\n## 之前的对话总结\n\n${session.summary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
  }
  return { prompt: systemPrompt, tools };
};

export const buildAssistantStatsMessages = (params: AssistantStatsParams): AIChatMessage[] => {
  const { context, session, currentMessages, includeToolSchemas = true } = params;
  const { prompt, tools } = buildAssistantSystemPromptForStats(context, session);
  const history =
    ensurePendingUserMessage(buildAssistantMessageHistory(session), currentMessages) || [];
  const messages: AIChatMessage[] = [
    {
      role: 'system',
      content: prompt,
    },
  ];

  if (includeToolSchemas && tools.length > 0) {
    messages.push({
      role: 'system',
      content: `【工具定义】\n${safeStringifyTools(tools)}`,
    });
  }

  messages.push(...history);
  return messages;
};

export const estimateAssistantContextTokens = (params: AssistantStatsParams): number => {
  const messages = buildAssistantStatsMessages(params);
  return estimateMessagesTokenCount(messages);
};
