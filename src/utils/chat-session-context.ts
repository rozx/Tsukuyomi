import type { ChatSession, ChatSessionMessage } from 'src/stores/chat-sessions';
import { formatSummaryMessages } from 'src/services/ai/context/summary-input';
import { TOOL_CALL_PLACEHOLDER_VARIANTS } from 'src/constants/chat';

type SummarizableMessage = { role: 'user' | 'assistant'; content: string };

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

const countVisibleMessagesSinceSummary = (
  session: ChatSession,
  allMessages: ChatSessionMessage[],
): number => buildVisibleMessagesToSummarize(session, allMessages).length;

const buildApiMessagesToSummarize = (session: ChatSession): SummarizableMessage[] =>
  formatSummaryMessages(session.apiMessageHistory ?? []);

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
