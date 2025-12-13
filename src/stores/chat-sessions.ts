import { defineStore, acceptHMRUpdate } from 'pinia';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'luna-ai-chat-sessions';
const MAX_SESSIONS = 50; // 最多保存 50 个会话
export const MAX_MESSAGES_PER_SESSION = 50; // 每个会话最多 50 条消息（用户+助手）
export const MESSAGE_LIMIT_THRESHOLD = 40; // 当达到 40 条消息时触发总结

/**
 * 操作信息（用于在消息中标记 CRUD 操作）
 */
export interface MessageAction {
  type: 'create' | 'update' | 'delete' | 'web_search' | 'web_fetch' | 'read' | 'navigate';
  entity:
    | 'term'
    | 'character'
    | 'web'
    | 'translation'
    | 'chapter'
    | 'paragraph'
    | 'book'
    | 'memory'
    | 'todo';
  name?: string;
  timestamp: number;
  // 网络搜索相关信息
  query?: string; // 搜索查询（用于 web_search）
  url?: string; // 网页 URL（用于 web_fetch）
  // 翻译相关信息
  paragraph_id?: string; // 段落 ID（用于 translation）
  translation_id?: string; // 翻译 ID（用于 translation）
  // 读取操作相关信息
  chapter_id?: string; // 章节 ID（用于 read chapter）
  chapter_title?: string; // 章节标题（用于 read chapter）
  character_name?: string; // 角色名称（用于 read character）
  tool_name?: string; // 工具名称（用于 read 操作）
  keywords?: string[]; // 关键词数组（用于 batch_replace_translations 和 search_memory_by_keywords）
  regex_pattern?: string; // 正则表达式模式（用于 search_paragraphs_by_regex）
  // Memory 相关信息
  memory_id?: string; // Memory ID（用于 memory 操作）
  keyword?: string; // 搜索关键词（用于 search_memory_by_keywords，已废弃，应使用 keywords 数组）
  // 导航相关信息
  book_id?: string; // 书籍 ID（用于 navigate 操作）
  // 注意：chapter_id 和 chapter_title 在 read 和 navigate 操作中都会使用
  // paragraph_id 在 translation、read 和 navigate 操作中都会使用
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: MessageAction[]; // 消息中包含的操作
  thinkingProcess?: string; // AI 思考过程（仅在 assistant 角色时使用）
  isSummarization?: boolean; // 是否为总结消息（用于标记总结过程的消息气泡）
  isSummaryResponse?: boolean; // 是否为总结响应消息（用于标记包含完整总结内容的消息，应隐藏）
}

/**
 * 会话上下文信息
 */
export interface SessionContext {
  bookId: string | null;
  chapterId: string | null;
  paragraphId: string | null;
}

/**
 * 聊天会话接口
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  context: SessionContext;
  createdAt: number;
  updatedAt: number;
  summary?: string; // 会话总结（当消息过多时自动生成）
}

/**
 * 从 localStorage 加载会话列表
 */
function loadSessionsFromStorage(): ChatSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const sessions = JSON.parse(stored) as ChatSession[];
      // 确保时间戳是数字类型
      return sessions.map((session) => ({
        ...session,
        createdAt:
          typeof session.createdAt === 'string'
            ? new Date(session.createdAt).getTime()
            : session.createdAt,
        updatedAt:
          typeof session.updatedAt === 'string'
            ? new Date(session.updatedAt).getTime()
            : session.updatedAt,
        messages: session.messages.map((msg) => ({
          ...msg,
          timestamp:
            typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : msg.timestamp,
        })),
      }));
    }
  } catch (error) {
    console.error('Failed to load chat sessions from storage:', error);
  }
  return [];
}

/**
 * 保存会话列表到 localStorage
 */
function saveSessionsToStorage(sessions: ChatSession[]): void {
  try {
    // 只保存最近的 MAX_SESSIONS 个会话
    const sessionsToSave = sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsToSave));
  } catch (error) {
    console.error('Failed to save chat sessions to storage:', error);
  }
}

/**
 * 从消息生成会话标题
 */
function generateSessionTitle(messages: ChatMessage[]): string {
  // 使用第一条用户消息的前 30 个字符作为标题
  const firstUserMessage = messages.find((msg) => msg.role === 'user');
  if (firstUserMessage) {
    const title = firstUserMessage.content.trim().substring(0, 30);
    return title || '新会话';
  }
  return '新会话';
}

/**
 * 聊天会话 Store
 */
export const useChatSessionsStore = defineStore('chatSessions', {
  state: () => ({
    sessions: [] as ChatSession[],
    currentSessionId: null as string | null,
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取当前会话
     */
    currentSession: (state): ChatSession | null => {
      if (!state.currentSessionId) return null;
      return state.sessions.find((s) => s.id === state.currentSessionId) || null;
    },

    /**
     * 获取所有会话（按更新时间倒序）
     */
    allSessions: (state): ChatSession[] => {
      return [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    },
  },

  actions: {
    /**
     * 从 localStorage 加载会话列表
     */
    loadSessions(): void {
      if (this.isLoaded) return;
      this.sessions = loadSessionsFromStorage();
      this.isLoaded = true;
    },

    /**
     * 创建新会话
     */
    createSession(context: SessionContext): string {
      const sessionId = uuidv4();
      const now = Date.now();
      const newSession: ChatSession = {
        id: sessionId,
        title: '新会话',
        messages: [],
        context,
        createdAt: now,
        updatedAt: now,
      };

      this.sessions.push(newSession);
      this.currentSessionId = sessionId;
      saveSessionsToStorage(this.sessions);
      return sessionId;
    },

    /**
     * 切换到指定会话
     */
    switchToSession(sessionId: string): void {
      const session = this.sessions.find((s) => s.id === sessionId);
      if (session) {
        this.currentSessionId = sessionId;
      }
    },

    /**
     * 更新当前会话的消息
     */
    updateCurrentSessionMessages(messages: ChatMessage[]): void {
      if (!this.currentSessionId) return;

      const session = this.sessions.find((s) => s.id === this.currentSessionId);
      if (session) {
        session.messages = messages;
        session.updatedAt = Date.now();

        // 如果消息列表不为空且标题还是"新会话"，生成新标题
        if (messages.length > 0 && session.title === '新会话') {
          session.title = generateSessionTitle(messages);
        }

        saveSessionsToStorage(this.sessions);
      }
    },

    /**
     * 更新指定会话的消息（用于异步操作期间会话可能切换的情况）
     */
    updateSessionMessages(sessionId: string, messages: ChatMessage[]): void {
      const session = this.sessions.find((s) => s.id === sessionId);
      if (session) {
        session.messages = messages;
        session.updatedAt = Date.now();

        // 如果消息列表不为空且标题还是"新会话"，生成新标题
        if (messages.length > 0 && session.title === '新会话') {
          session.title = generateSessionTitle(messages);
        }

        saveSessionsToStorage(this.sessions);
      }
    },

    /**
     * 添加消息到当前会话
     */
    addMessageToCurrentSession(message: ChatMessage): void {
      if (!this.currentSessionId) return;

      const session = this.sessions.find((s) => s.id === this.currentSessionId);
      if (session) {
        session.messages.push(message);
        session.updatedAt = Date.now();

        // 如果这是第一条用户消息，生成标题
        if (session.title === '新会话' && message.role === 'user') {
          session.title = generateSessionTitle(session.messages);
        }

        saveSessionsToStorage(this.sessions);
      }
    },

    /**
     * 更新当前会话的上下文
     */
    updateCurrentSessionContext(context: SessionContext): void {
      if (!this.currentSessionId) return;

      const session = this.sessions.find((s) => s.id === this.currentSessionId);
      if (session) {
        session.context = context;
        session.updatedAt = Date.now();
        saveSessionsToStorage(this.sessions);
      }
    },

    /**
     * 删除会话
     */
    deleteSession(sessionId: string): void {
      this.sessions = this.sessions.filter((s) => s.id !== sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      saveSessionsToStorage(this.sessions);
    },

    /**
     * 清空当前会话的消息
     */
    clearCurrentSession(): void {
      if (!this.currentSessionId) return;

      const session = this.sessions.find((s) => s.id === this.currentSessionId);
      if (session) {
        session.messages = [];
        session.title = '新会话';
        delete session.summary;
        session.updatedAt = Date.now();
        saveSessionsToStorage(this.sessions);
      }
    },

    /**
     * 检查当前会话是否接近限制
     */
    isNearLimit(): boolean {
      const session = this.currentSession;
      if (!session) return false;
      return session.messages.length >= MESSAGE_LIMIT_THRESHOLD;
    },

    /**
     * 检查当前会话是否达到限制
     */
    isAtLimit(): boolean {
      const session = this.currentSession;
      if (!session) return false;
      return session.messages.length >= MAX_MESSAGES_PER_SESSION;
    },

    /**
     * 设置会话总结（保留所有消息，不清除聊天历史）
     * @param summary 会话总结
     * @param sessionId 可选的会话 ID，如果不提供则使用当前会话
     */
    summarizeAndReset(summary: string, sessionId?: string): void {
      const targetSessionId = sessionId ?? this.currentSessionId;
      if (!targetSessionId) return;

      const session = this.sessions.find((s) => s.id === targetSessionId);
      if (session) {
        // 保存总结，但不清除聊天历史
        session.summary = summary;
        // 不修改消息列表，保留所有消息
        // 摘要将在 AssistantService 中用于后续对话的上下文
        session.updatedAt = Date.now();
        saveSessionsToStorage(this.sessions);
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChatSessionsStore, import.meta.hot));
}
