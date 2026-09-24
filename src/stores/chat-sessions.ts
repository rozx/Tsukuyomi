import type { ContextAnchor } from 'src/services/ai/context/measure';
import type { ChatMessage, AIToolCall } from 'src/services/ai/types/ai-service';
import { defineStore, acceptHMRUpdate } from 'pinia';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'tsukuyomi-chat-sessions';
const CURRENT_SESSION_ID_KEY = 'tsukuyomi-chat-current-session-id';
const MAX_SESSIONS = 50; // 最多保存 50 个会话
export const MAX_MESSAGES_PER_SESSION = 200; // 每个会话最多 200 条消息（用户+助手）

/**
 * 操作信息（用于在消息中标记 CRUD 操作）
 */
export interface MessageAction {
  type:
    | 'create'
    | 'update'
    | 'delete'
    | 'web_search'
    | 'web_fetch'
    | 'read'
    | 'navigate'
    | 'ask'
    | 'search';
  entity:
    | 'term'
    | 'character'
    | 'web'
    | 'translation'
    | 'chapter'
    | 'paragraph'
    | 'book'
    | 'memory'
    | 'todo'
    | 'user'
    | 'help_doc';
  name?: string;
  /** name 已是完整操作说明时，直接展示，不再拼接操作／实体前缀。 */
  nameIsDescription?: boolean;
  /** 完整说明的结构化详情，气泡摘要之外的信息供浮层展示。 */
  descriptionDetails?: { label: string; value: string }[];
  timestamp: number;
  // 网络搜索相关信息
  query?: string; // 搜索查询（用于 web_search）
  url?: string; // 网页 URL（用于 web_fetch）
  // 帮助文档相关信息
  title?: string; // 文档标题（用于 help docs read/search）
  // 翻译相关信息
  paragraph_id?: string; // 段落 ID（用于 translation）
  translation_id?: string; // 翻译 ID（用于 translation）
  // 批量替换相关信息
  replaced_paragraph_count?: number; // 替换的段落数量（用于 batch_replace_translations）
  replaced_translation_count?: number; // 替换的翻译版本总数（用于 batch_replace_translations）
  replacement_text?: string; // 替换文本（用于 batch_replace_translations）
  replace_all_translations?: boolean; // 是否替换所有翻译版本（用于 batch_replace_translations）
  original_keywords?: string[]; // 原文关键词数组（用于 batch_replace_translations）
  // 读取操作相关信息
  chapter_id?: string; // 章节 ID（用于 read chapter）
  chapter_title?: string; // 章节标题（用于 read chapter）
  character_name?: string; // 角色名称（用于 read character）
  tool_name?: string; // 工具名称（用于 read 操作）
  keywords?: string[]; // 关键词数组（用于 batch_replace_translations、search_memories 和 find_paragraph_by_keywords）
  translation_keywords?: string[]; // 翻译关键词数组（用于 find_paragraph_by_keywords）
  regex_pattern?: string; // 正则表达式模式（用于 search_paragraphs_by_regex）
  // Memory 相关信息
  memory_id?: string; // Memory ID（用于 memory 操作）
  keyword?: string; // 搜索关键词（用于 search_memories，已废弃，应使用 keywords 数组）
  // 导航相关信息
  book_id?: string; // 书籍 ID（用于 navigate 操作）
  doc_id?: string; // 文档 ID（用于 navigate help_doc 操作）
  section_id?: string; // 章节锚点 ID（用于 navigate help_doc 操作）
  // 章节更新相关信息
  old_title?: string; // 旧标题（用于 update_chapter_title）
  new_title?: string; // 新标题（用于 update_chapter_title）
  // 翻译更新相关信息
  old_translation?: string; // 旧翻译（用于 update_translation）
  new_translation?: string; // 新翻译（用于 update_translation）
  // ask_user 问答相关信息
  question?: string; // 问题（用于 ask_user）
  answer?: string; // 最终答案（用于 ask_user）
  selected_index?: number; // 选择的候选答案索引（用于 ask_user）
  cancelled?: boolean; // 是否取消（用于 ask_user）
  suggested_answers?: string[]; // 候选答案列表（用于 ask_user）
  // ask_user_batch 批量问答相关信息
  batch_questions?: string[]; // 问题列表（用于 ask_user_batch）
  batch_answers?: Array<{
    question_index: number;
    answer: string;
    selected_index?: number;
  }>; // 已答部分/最终答案（用于 ask_user_batch）
  // 注意：chapter_id 和 chapter_title 在 read 和 navigate 操作中都会使用
  // paragraph_id 在 translation、read 和 navigate 操作中都会使用
}

/**
 * 聊天消息接口
 */
export interface ChatSessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: MessageAction[]; // 消息中包含的操作
  thinkingProcess?: string; // AI 思考过程（仅在 assistant 角色时使用）
  isSummarization?: boolean; // 是否为总结消息（用于标记总结过程的消息气泡）
  isSummaryResponse?: boolean; // 是否为总结响应消息（用于标记包含完整总结内容的消息，应隐藏）
  isContextMessage?: boolean; // 是否为上下文辅助消息（用于隐藏“工具结果摘要”等不需要展示给用户的消息）
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
 * API 层消息（存储完整的工具交互历史）
 * 与 AI 服务的 ChatMessage 保持一致，但仅用于持久化存储
 */
export interface ApiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
  reasoning_content?: string | null;
}

/**
 * 聊天会话接口
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  context: SessionContext;
  createdAt: number;
  updatedAt: number;
  summary?: string; // 会话总结（当消息过多时自动生成）
  lastSummarizedMessageIndex: number; // 上次总结时的消息数量，用于计算"重置"后的条数
  contextAnchor?: ContextAnchor;
  /**
   * 完整的 API 消息历史（包含工具调用和结果）。
   * 不含 system 消息（每次请求时动态生成）。
   * 用于在下一轮对话中传递给 AI 服务，确保上下文连续性。
   * 压缩后只保存保留的近期历史。
   */
  apiMessageHistory?: ApiMessage[];
  /**
   * apiMessageHistory 写入时对应的可见消息数量。
   * 用于发送中/失败发送后把尚未进入 API history 的可见消息作为增量计数。
   */
  apiMessageHistoryVisibleMessageCount?: number;
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
      return sessions.map((session) => {
        const { toolCallTokenOverhead: _legacy, ...current } = session as ChatSession & {
          toolCallTokenOverhead?: number;
        };
        return {
          ...current,
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
          lastSummarizedMessageIndex:
            typeof session.lastSummarizedMessageIndex === 'number'
              ? session.lastSummarizedMessageIndex
              : 0,
        };
      });
    }
  } catch (error) {
    console.error('Failed to load chat sessions from storage:', error);
    // 清理无效存储并返回空会话列表
    localStorage.removeItem(STORAGE_KEY);
  }
  return [];
}

/**
 * 保存会话列表到 localStorage
 */
function saveSessionsToStorage(sessions: ChatSession[]): void {
  const toSave = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('[chat-sessions] 保存失败，保留原有存储', error);
  }
}

/**
 * 从 localStorage 加载当前会话 ID
 */
function loadCurrentSessionIdFromStorage(): string | null {
  try {
    const stored = localStorage.getItem(CURRENT_SESSION_ID_KEY);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.error('Failed to load current session ID from storage:', error);
  }
  return null;
}

/**
 * 保存当前会话 ID 到 localStorage
 */
function saveCurrentSessionIdToStorage(sessionId: string | null): void {
  try {
    if (sessionId) {
      localStorage.setItem(CURRENT_SESSION_ID_KEY, sessionId);
    } else {
      localStorage.removeItem(CURRENT_SESSION_ID_KEY);
    }
  } catch (error) {
    console.error('Failed to save current session ID to storage:', error);
  }
}

/**
 * 从消息生成会话标题
 */
function generateSessionTitle(messages: ChatSessionMessage[]): string {
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
      // 加载当前会话 ID
      const savedSessionId = loadCurrentSessionIdFromStorage();
      // 验证会话 ID 是否仍然存在
      if (savedSessionId && this.sessions.some((s) => s.id === savedSessionId)) {
        this.currentSessionId = savedSessionId;
      } else {
        // 如果保存的会话 ID 不存在，清除它
        if (savedSessionId) {
          saveCurrentSessionIdToStorage(null);
        }
        this.currentSessionId = null;
      }
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
        lastSummarizedMessageIndex: 0,
      };

      this.sessions.push(newSession);
      this.currentSessionId = sessionId;
      saveSessionsToStorage(this.sessions);
      saveCurrentSessionIdToStorage(sessionId);
      return sessionId;
    },

    /**
     * 切换到指定会话
     */
    switchToSession(sessionId: string): void {
      const session = this.sessions.find((s) => s.id === sessionId);
      if (session) {
        this.currentSessionId = sessionId;
        saveCurrentSessionIdToStorage(sessionId);
      }
    },

    /**
     * 更新指定会话的消息（用于异步操作期间会话可能切换的情况）
     */
    updateSessionMessages(sessionId: string, messages: ChatSessionMessage[]): void {
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
    addMessageToCurrentSession(message: ChatSessionMessage): void {
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
        saveCurrentSessionIdToStorage(null);
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
        delete session.contextAnchor;
        delete session.apiMessageHistory;
        delete session.apiMessageHistoryVisibleMessageCount;
        session.lastSummarizedMessageIndex = 0;
        session.updatedAt = Date.now();
        saveSessionsToStorage(this.sessions);
      }
    },

    /** 候选上下文先完整持久化，再替换内存；配额失败时不能部分写入。 */
    saveChatResult(
      sessionId: string,
      result: {
        summary?: string | undefined;
        messageHistory?: ChatMessage[];
        contextAnchor?: ContextAnchor | undefined;
      },
      visibleMessageCount?: number,
    ): void {
      const index = this.sessions.findIndex((session) => session.id === sessionId);
      if (index < 0) return;
      const current = this.sessions[index]!;
      const candidate: ChatSession = { ...current, updatedAt: Date.now() };
      const count = visibleMessageCount ?? current.messages.length;
      if (result.summary !== undefined) {
        candidate.summary = result.summary;
        candidate.lastSummarizedMessageIndex = count;
      }
      if (result.messageHistory) {
        candidate.apiMessageHistory = result.messageHistory.filter(
          (message): message is ApiMessage => message.role !== 'system',
        );
        candidate.apiMessageHistoryVisibleMessageCount = count;
      }
      if (result.contextAnchor) candidate.contextAnchor = result.contextAnchor;
      else delete candidate.contextAnchor;
      const sessions = [...this.sessions];
      sessions[index] = candidate;
      try {
        const serialized = JSON.stringify(sessions);
        localStorage.setItem(STORAGE_KEY, serialized);
        this.sessions = JSON.parse(serialized) as ChatSession[];
      } catch (error) {
        throw new Error('保存会话上下文失败，原有摘要与历史已保留。请检查浏览器存储空间。', {
          cause: error,
        });
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChatSessionsStore, import.meta.hot));
}
