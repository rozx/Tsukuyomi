import type { ApiMessage, ChatSession, ChatSessionMessage } from 'src/stores/chat-sessions';
import { TOOL_CALL_PLACEHOLDER_VARIANTS } from 'src/constants/chat';

const TOOL_ARGUMENT_SUMMARY_MAX_CHARS = 240;
const TOOL_RESULT_SUMMARY_MAX_CHARS = 1200;

type SummarizableMessage = { role: 'user' | 'assistant'; content: string };

const truncateText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
};

const isVisibleMessageCountable = (msg: ChatSessionMessage): boolean => {
  if (msg.isSummarization || msg.isSummaryResponse || msg.isContextMessage) return false;
  const content = msg.content?.trim();
  return Boolean(content && !isToolCallPlaceholder(content));
};

const isToolCallPlaceholder = (content: string): boolean =>
  TOOL_CALL_PLACEHOLDER_VARIANTS.includes(
    content as (typeof TOOL_CALL_PLACEHOLDER_VARIANTS)[number],
  );

const buildVisibleMessagesToSummarizeFromIndex = (
  allMessages: ChatSessionMessage[],
  startIndex: number,
): SummarizableMessage[] => {
  return allMessages
    .slice(Math.max(0, startIndex))
    .filter(isVisibleMessageCountable)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
};

const buildVisibleMessagesToSummarize = (
  session: ChatSession,
  allMessages: ChatSessionMessage[],
): SummarizableMessage[] =>
  buildVisibleMessagesToSummarizeFromIndex(allMessages, session.lastSummarizedMessageIndex ?? 0);

const formatToolCall = (toolCall: NonNullable<ApiMessage['tool_calls']>[number]): string => {
  const args = truncateText(toolCall.function.arguments || '{}', TOOL_ARGUMENT_SUMMARY_MAX_CHARS);
  return `工具调用 ${toolCall.function.name}: ${args}`;
};

const formatToolResult = (msg: ApiMessage): string => {
  const toolName = msg.name || msg.tool_call_id || 'unknown_tool';
  const content = truncateText(msg.content ?? '', TOOL_RESULT_SUMMARY_MAX_CHARS);
  return `工具结果 ${toolName}: ${content}`;
};

const apiMessageToSummarizableMessages = (msg: ApiMessage): SummarizableMessage[] => {
  if (msg.role === 'user') {
    const content = msg.content?.trim() ?? '';
    return content ? [{ role: 'user', content }] : [];
  }

  if (msg.role === 'tool') {
    return [{ role: 'assistant', content: formatToolResult(msg) }];
  }

  const messages: SummarizableMessage[] = [];
  const content = msg.content?.trim() ?? '';
  if (content && !isToolCallPlaceholder(content)) {
    messages.push({ role: 'assistant', content });
  }
  if (msg.tool_calls?.length) {
    messages.push(
      ...msg.tool_calls.map((toolCall) => ({
        role: 'assistant' as const,
        content: formatToolCall(toolCall),
      })),
    );
  }

  return messages;
};

const countVisibleMessagesSinceSummary = (
  session: ChatSession,
  allMessages: ChatSessionMessage[],
): number => buildVisibleMessagesToSummarize(session, allMessages).length;

const buildApiMessagesToSummarize = (session: ChatSession): SummarizableMessage[] =>
  session.apiMessageHistory?.flatMap(apiMessageToSummarizableMessages) ?? [];

const countApiContextMessages = (session: ChatSession): number =>
  buildApiMessagesToSummarize(session).length;

const buildVisibleDeltaAfterApiHistory = (
  session: ChatSession,
  allMessages: ChatSessionMessage[],
): SummarizableMessage[] => {
  if (typeof session.apiMessageHistoryVisibleMessageCount !== 'number') {
    return [];
  }
  const startIndex = Math.max(
    session.lastSummarizedMessageIndex ?? 0,
    session.apiMessageHistoryVisibleMessageCount,
  );
  return buildVisibleMessagesToSummarizeFromIndex(allMessages, startIndex);
};

export const countContextMessagesSinceSummary = (
  session: ChatSession | null,
  allMessages: ChatSessionMessage[],
): number => {
  if (!session) return allMessages.filter(isVisibleMessageCountable).length;
  if (session.apiMessageHistory?.length) {
    const apiCount = countApiContextMessages(session);
    const visibleDeltaCount = buildVisibleDeltaAfterApiHistory(session, allMessages).length;
    if (typeof session.apiMessageHistoryVisibleMessageCount === 'number') {
      return apiCount + visibleDeltaCount;
    }
  }
  return Math.max(
    countVisibleMessagesSinceSummary(session, allMessages),
    countApiContextMessages(session),
  );
};

export const buildContextMessagesToSummarize = (
  session: ChatSession,
  allMessages: ChatSessionMessage[],
): SummarizableMessage[] => {
  if (session.apiMessageHistory?.length) {
    return [
      ...buildApiMessagesToSummarize(session),
      ...buildVisibleDeltaAfterApiHistory(session, allMessages),
    ];
  }

  return buildVisibleMessagesToSummarize(session, allMessages);
};
