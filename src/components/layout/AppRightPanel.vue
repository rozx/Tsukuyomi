<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Popover from 'primevue/popover';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useUiStore } from 'src/stores/ui';
import { useContextStore } from 'src/stores/context';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import {
  useChatSessionsStore,
  type ChatMessage,
  type ChatSession,
  type MessageAction,
  MESSAGE_LIMIT_THRESHOLD,
  MAX_MESSAGES_PER_SESSION,
} from 'src/stores/chat-sessions';
import { AssistantService } from 'src/services/ai/tasks';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { ActionInfo } from 'src/services/ai/tools';
import type { ChatMessage as AIChatMessage } from 'src/services/ai/types/ai-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import { ChapterService } from 'src/services/chapter-service';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { CharacterSetting, Alias, Terminology, Translation, Novel } from 'src/models/novel';
import {
  createMessageActionFromActionInfo,
  getActionDetails,
  ACTION_LABELS,
  ENTITY_LABELS,
  type ActionDetailsContext,
} from 'src/utils/action-info-utils';
import co from 'co';

const ui = useUiStore();
const router = useRouter();
const contextStore = useContextStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const bookDetailsStore = useBookDetailsStore();
const aiProcessingStore = useAIProcessingStore();
const chatSessionsStore = useChatSessionsStore();
const toast = useToastWithHistory();

const SUMMARIZING_MESSAGE_CONTENT = '聊天正在总结中...';
const SUMMARIZED_MESSAGE_CONTENT = '聊天总结完成。';
const SUMMARIZED_WITH_REASON_MESSAGE_CONTENT = '聊天总结完成，之前的对话历史已自动总结。';

type SessionWithSummaryIndex = ChatSession & { lastSummarizedMessageIndex?: number };

const buildAIMessageHistory = (
  session: SessionWithSummaryIndex | null,
): AIChatMessage[] | undefined => {
  if (!session || !session.messages.length) {
    return undefined;
  }
  const startIndex = session.lastSummarizedMessageIndex ?? 0;
  const sliced = session.messages
    .slice(startIndex)
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  return sliced.length > 0 ? sliced : undefined;
};

// 扩展类型，包含所有可选属性（用于类型断言）
// 这允许我们在模板中安全地访问这些属性，同时保持类型安全
type MessageActionWithAllProperties = MessageAction & {
  replaced_paragraph_count?: number;
  replaced_translation_count?: number;
  old_translation?: string;
  new_translation?: string;
  old_title?: string;
  new_title?: string;
  translation_keywords?: string[];
};

// 配置 marked 以支持更好的 Markdown 渲染
marked.setOptions({
  breaks: true, // 支持换行
  gfm: true, // 支持 GitHub Flavored Markdown
});

// 渲染 Markdown 为 HTML（使用 DOMPurify 清理以防止 XSS）
const renderMarkdown = (text: string): string => {
  if (!text) return '';
  try {
    // 使用 marked 解析 Markdown
    const html = marked.parse(text) as string;
    // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
    // 允许常见的 Markdown HTML 标签，但阻止脚本执行
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'a',
        'hr',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      ALLOWED_ATTR: ['href', 'title', 'alt', 'class'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // 如果渲染失败，返回转义的原始文本
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }
};

const panelContainerRef = ref<HTMLElement | null>(null);
const messagesContainerRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof Textarea> | null>(null);
const resizeHandleRef = ref<HTMLElement | null>(null);

// 拖拽调整大小
const isResizing = ref(false);
const startX = ref(0);
const startWidth = ref(0);

const handleResizeStart = (event: MouseEvent) => {
  isResizing.value = true;
  startX.value = event.clientX;
  startWidth.value = ui.rightPanelWidth;
  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
  event.preventDefault();
};

const handleResizeMove = (event: MouseEvent) => {
  if (!isResizing.value) return;

  const deltaX = startX.value - event.clientX; // 向左拖拽时 deltaX 为正
  const newWidth = startWidth.value + deltaX;
  ui.setRightPanelWidth(newWidth);
};

const handleResizeEnd = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
};

onMounted(() => {
  // 初始化时加载待办事项
  loadTodos();
  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
  // 清理所有思考过程活动状态超时器
  for (const timeoutId of thinkingActiveTimeouts.value.values()) {
    clearTimeout(timeoutId);
  }
  thinkingActiveTimeouts.value.clear();
  thinkingActive.value.clear();
  // 清理 storage 事件监听
  window.removeEventListener('storage', handleStorageChange);
});

const messages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
const isSending = ref(false);
const isSummarizing = ref(false);
const currentTaskId = ref<string | null>(null);
const currentMessageActions = ref<MessageAction[]>([]); // 当前消息的操作列表
const isAutoSummarizing = ref(false); // 是否正在自动总结（AI 响应完成后触发）

const getMessagesSinceSummaryCount = (session: SessionWithSummaryIndex | null): number => {
  if (!session) return messages.value.length;
  const cutoff = session.lastSummarizedMessageIndex ?? 0;
  return Math.max(session.messages.length - cutoff, 0);
};

/**
 * 自动执行总结（当 AI 响应完成后消息数量达到限制时触发）
 * 这个函数独立于 sendMessage，可以在 AI 响应完成后调用
 */
const performAutoSummarization = async (): Promise<void> => {
  // 如果已经在总结或发送中，跳过
  if (isAutoSummarizing.value || isSummarizing.value || isSending.value) {
    return;
  }

  // 检查模型是否可用
  if (!assistantModel.value) {
    console.warn('[AppRightPanel] 自动总结跳过：助手模型未配置');
    return;
  }

  const currentSession = chatSessionsStore.currentSession;
  if (!currentSession) {
    return;
  }

  // 检查消息数量是否达到阈值
  const messageCount = getMessagesSinceSummaryCount(currentSession);
  if (messageCount < MESSAGE_LIMIT_THRESHOLD) {
    return;
  }

  isAutoSummarizing.value = true;

  try {
    // 创建总结消息气泡
    const summarizationMessageId = Date.now().toString();
    const summarizationMessage: ChatMessage = {
      id: summarizationMessageId,
      role: 'assistant',
      content: SUMMARIZING_MESSAGE_CONTENT,
      timestamp: Date.now(),
      isSummarization: true,
    };
    messages.value.push(summarizationMessage);

    // 更新 store 中的消息历史
    chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
    scrollToBottom();

    // 构建要总结的消息（排除系统消息和总结消息）
    const messagesToSummarize = messages.value
      .filter((msg) => !msg.isSummarization && !msg.isSummaryResponse)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    // 调用总结功能
    const summary = await AssistantService.summarizeSession(
      assistantModel.value,
      messagesToSummarize,
      {
        onChunk: () => {
          // 总结过程中可以显示进度，但这里简化处理
        },
      },
    );

    // 更新总结消息状态为完成
    const summarizationMsgIndex = messages.value.findIndex(
      (m) => m.id === summarizationMessageId,
    );
    if (summarizationMsgIndex >= 0) {
      const existingMsg = messages.value[summarizationMsgIndex];
      if (existingMsg) {
        existingMsg.content = SUMMARIZED_MESSAGE_CONTENT;
        // 更新 store 中的消息历史
        chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
      }
    }

    // 保存总结（不清除聊天历史）
    chatSessionsStore.summarizeAndReset(summary, currentSession.id);

    // 更新本地消息列表（使用标记避免触发 watch）
    isUpdatingFromStore = true;
    const session = chatSessionsStore.currentSession;
    if (session) {
      messages.value = [...session.messages];
    }
    await nextTick();
    isUpdatingFromStore = false;

    toast.add({
      severity: 'info',
      summary: '自动总结完成',
      detail: '对话历史已自动总结，以优化后续对话效果',
      life: 3000,
    });
  } catch (error) {
    console.error('[AppRightPanel] 自动总结失败:', error);
    toast.add({
      severity: 'error',
      summary: '自动总结失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 5000,
    });
  } finally {
    isAutoSummarizing.value = false;
  }
};

// 待办事项列表
const todos = ref<TodoItem[]>([]);
const showTodoList = ref(false);

// 会话列表 Popover
const sessionListPopoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 切换会话列表 Popover
const toggleSessionListPopover = (event: Event) => {
  sessionListPopoverRef.value?.toggle(event);
};

// 关闭会话列表 Popover
const hideSessionListPopover = () => {
  sessionListPopoverRef.value?.hide();
};

// 获取最近的会话列表（最多5个，排除当前会话）
const recentSessions = computed(() => {
  const allSessions = chatSessionsStore.allSessions;
  const currentSessionId = chatSessionsStore.currentSessionId;
  return allSessions
    .filter((session) => session.id !== currentSessionId)
    .slice(0, 5);
});

// 切换到指定会话
const switchToSession = (sessionId: string) => {
  chatSessionsStore.switchToSession(sessionId);
  // loadCurrentSession 会通过 watch 自动触发
  // 切换会话后关闭 popover
  hideSessionListPopover();
};

// 格式化会话时间
const formatSessionTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return '刚刚';
  } else if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  }
};

// 加载待办事项列表（优先显示当前会话的待办事项，否则显示当前任务的待办事项）
const loadTodos = () => {
  const allTodos = TodoListService.getAllTodos();
  const currentSession = chatSessionsStore.currentSession;
  const sessionId = currentSession?.id;

  // 对于助手聊天，优先使用 sessionId 过滤待办事项
  if (sessionId) {
    todos.value = allTodos.filter((todo) => todo.sessionId === sessionId);
  } else if (currentTaskId.value) {
    // 对于其他任务（翻译、润色等），使用 taskId 过滤
    todos.value = allTodos.filter((todo) => todo.taskId === currentTaskId.value);
  } else {
    todos.value = [];
  }
};

// 监听待办事项变化（通过 localStorage 事件）
const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'luna-ai-todo-list') {
    loadTodos();
  }
};

// 监听 currentTaskId 和当前会话变化，重新加载待办事项
watch(
  () => [currentTaskId.value, chatSessionsStore.currentSessionId],
  () => {
    loadTodos();
  },
);

// Popover refs for action details
const actionPopoverRefs = ref<Map<string, InstanceType<typeof Popover> | null>>(new Map());
const hoveredAction = ref<{ action: MessageAction; message: ChatMessage } | null>(null);

// Popover refs for grouped action details
const groupedActionPopoverRefs = ref<Map<string, InstanceType<typeof Popover> | null>>(new Map());
const hoveredGroupedAction = ref<{
  actions: MessageAction[];
  message: ChatMessage;
  timestamp: number;
} | null>(null);

// 思考过程折叠状态（messageId -> isExpanded）
const thinkingExpanded = ref<Map<string, boolean>>(new Map());

// 思考过程内容容器 refs（用于滚动）
const thinkingContentRefs = ref<Map<string, HTMLElement | null>>(new Map());

// 思考过程活动状态（messageId -> isActive），用于显示加载指示器
const thinkingActive = ref<Map<string, boolean>>(new Map());

// 思考过程活动状态超时器（messageId -> timeoutId），用于清除活动状态
const thinkingActiveTimeouts = ref<Map<string, number>>(new Map());

// 设置思考过程为活动状态
const setThinkingActive = (messageId: string, isActive: boolean) => {
  if (isActive) {
    thinkingActive.value.set(messageId, true);
    // 清除之前的超时器（如果有）
    const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      thinkingActiveTimeouts.value.delete(messageId);
    }
  } else {
    thinkingActive.value.delete(messageId);
    // 清除超时器
    const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      thinkingActiveTimeouts.value.delete(messageId);
    }
  }
};

// 标记思考过程为活动状态，并在2秒后自动清除（如果没有新的思考块）
const markThinkingActive = (messageId: string) => {
  thinkingActive.value.set(messageId, true);
  // 清除之前的超时器（如果有）
  const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  // 设置新的超时器，2秒后清除活动状态
  const timeoutId = window.setTimeout(() => {
    thinkingActive.value.delete(messageId);
    thinkingActiveTimeouts.value.delete(messageId);
  }, 2000);
  thinkingActiveTimeouts.value.set(messageId, timeoutId);
};

// 设置思考过程内容容器 ref
const setThinkingContentRef = (messageId: string, el: HTMLElement | null) => {
  if (el) {
    thinkingContentRefs.value.set(messageId, el);
  } else {
    thinkingContentRefs.value.delete(messageId);
  }
};

// 滚动思考过程内容到底部
const scrollThinkingToBottom = (messageId: string) => {
  void nextTick(() => {
    const container = thinkingContentRefs.value.get(messageId);
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

// 切换思考过程折叠状态
const toggleThinking = (messageId: string) => {
  const current = thinkingExpanded.value.get(messageId) || false;
  const willExpand = !current;
  thinkingExpanded.value.set(messageId, willExpand);

  // 如果展开，等待 DOM 更新后滚动到底部
  if (willExpand) {
    void nextTick(() => {
      scrollThinkingToBottom(messageId);
      // 同时滚动消息容器到底部，确保思考过程气泡可见
      scrollToBottom();
    });
  }
};

// 获取思考过程预览（前2行）
const getThinkingPreview = (thinkingProcess: string): string => {
  if (!thinkingProcess) return '';
  const lines = thinkingProcess.split('\n');
  if (lines.length <= 2) return thinkingProcess;
  return lines.slice(0, 2).join('\n');
};

// 获取默认助手模型
const assistantModel = computed(() => {
  return aiModelsStore.getDefaultModelForTask('assistant');
});

// 获取当前上下文信息
const contextInfo = computed(() => {
  const context = contextStore.getContext;
  const info: string[] = [];

  if (context.currentBookId) {
    const book = booksStore.getBookById(context.currentBookId);
    if (book) {
      info.push(`书籍：${book.title}`);
    } else {
      info.push('当前书籍');
    }
  }
  if (context.currentChapterId) {
    info.push('当前章节');
  }
  if (context.selectedParagraphId) {
    info.push('当前段落');
  }

  return info.length > 0 ? info.join(' | ') : '无上下文';
});

// 滚动到底部
const scrollToBottom = () => {
  void nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
};

// 聚焦输入框
const focusInput = () => {
  // 使用 nextTick 确保 DOM 已更新，然后添加小延迟确保组件状态已更新
  void nextTick(() => {
    // 添加小延迟确保 PrimeVue 组件状态已更新（特别是 disabled 状态）
    setTimeout(() => {
      if (inputRef.value) {
        // PrimeVue Textarea 组件的聚焦方法
        // 尝试多种方式访问 textarea 元素
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const component = inputRef.value as any;

        // 方法1: 直接调用 focus 方法（如果组件暴露了）
        if (typeof component.focus === 'function') {
          component.focus();
          return;
        }

        // 方法2: 通过 $el 访问（Vue 3 组件实例）
        if (component.$el) {
          const textarea = component.$el.querySelector?.('textarea') as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            return;
          }
          // 如果 $el 本身就是 textarea
          if (component.$el instanceof HTMLTextAreaElement) {
            component.$el.focus();
            return;
          }
        }

        // 方法3: 通过 el 属性访问（PrimeVue 可能使用）
        if (component.el) {
          const textarea = component.el.querySelector?.('textarea') as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            return;
          }
          if (component.el instanceof HTMLTextAreaElement) {
            component.el.focus();
            return;
          }
        }

        // 方法4: 直接通过 DOM 查询（最后手段）
        const textareaElement = document.querySelector('textarea[placeholder*="输入消息"]');
        if (textareaElement instanceof HTMLTextAreaElement && !textareaElement.disabled) {
          textareaElement.focus();
        }
      }
    }, 50); // 50ms 延迟，确保组件状态已更新
  });
};

// 标记是否正在从 store 更新，避免循环
let isUpdatingFromStore = false;

// 发送消息
const sendMessage = async () => {
  const message = inputMessage.value.trim();
  if (!message || isSending.value) return;

  if (!assistantModel.value) {
    toast.add({
      severity: 'warn',
      summary: '未配置助手模型',
      detail: '请先在 AI 设置中配置默认助手模型',
      life: 3000,
    });
    return;
  }

  // 检查是否达到限制（在添加新消息之前）
  // 注意：这里检查的是添加新消息后的数量
  const sessionForLimit = chatSessionsStore.currentSession;
  let messageCountSinceSummary = getMessagesSinceSummaryCount(sessionForLimit);
  const willExceedLimit = messageCountSinceSummary + 1 >= MESSAGE_LIMIT_THRESHOLD;
  const willReachLimit = messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION;

  // 如果接近或达到限制，先尝试自动总结
  // 注意：无论是接近限制(40)还是达到限制(50)，都应该先尝试总结，而不是直接阻止
  let uiPerformedSummarization = false; // 跟踪 UI 是否成功执行了摘要

  if ((willExceedLimit || willReachLimit) && messages.value.length > 0) {
    // 执行 UI 层摘要
    const summarizationResult = await performUISummarization();

    if (!summarizationResult.success) {
      // 摘要失败：如果已达上限则阻止发送，否则继续（可能触发服务层摘要）
      if (willReachLimit) {
        return; // performUISummarization 内部已显示错误 toast
      }
      // 未达上限，继续发送（可能触发服务层摘要）
    } else {
      uiPerformedSummarization = true;

      // 总结成功后，重新检查消息数量
      const updatedSession = chatSessionsStore.currentSession;
      messageCountSinceSummary = getMessagesSinceSummaryCount(updatedSession);

      // 如果总结后仍然达到限制（理论上不应该发生，但作为安全检查）
      if (messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION) {
        toast.add({
          severity: 'warn',
          summary: '会话消息数仍达上限',
          detail: '请创建新会话继续对话',
          life: 3000,
        });
        return;
      }
    }
  }

  /**
   * 执行 UI 层摘要的辅助函数
   * @returns 包含成功状态的结果对象
   */
  async function performUISummarization(): Promise<{ success: boolean }> {
    isSending.value = true;
    isSummarizing.value = true;

    try {
      // 创建总结消息气泡
      const summarizationMessageId = (Date.now() - 1).toString();
      const summarizationMessage: ChatMessage = {
        id: summarizationMessageId,
        role: 'assistant',
        content: SUMMARIZING_MESSAGE_CONTENT,
        timestamp: Date.now(),
        isSummarization: true,
      };
      messages.value.push(summarizationMessage);

      // 更新 store 中的消息历史
      const currentSession = chatSessionsStore.currentSession;
      if (currentSession) {
        chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
      }
      scrollToBottom();

      // 构建要总结的消息（排除系统消息和总结消息）
      const messagesToSummarize = messages.value
        .filter((msg) => !msg.isSummarization && !msg.isSummaryResponse)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // 调用总结功能
      // 注意：此时 assistantModel.value 已在 sendMessage 开头验证过，但 TypeScript 需要再次断言
      if (!assistantModel.value) {
        throw new Error('助手模型未配置');
      }
      const summary = await AssistantService.summarizeSession(
        assistantModel.value,
        messagesToSummarize,
        {
          onChunk: () => {
            // 总结过程中可以显示进度，但这里简化处理
          },
        },
      );

      // 更新总结消息状态为完成
      const summarizationMsgIndex = messages.value.findIndex(
        (m) => m.id === summarizationMessageId,
      );
      if (summarizationMsgIndex >= 0) {
        const existingMsg = messages.value[summarizationMsgIndex];
        if (existingMsg) {
          messages.value[summarizationMsgIndex] = {
            id: existingMsg.id,
            role: existingMsg.role,
            content: SUMMARIZED_MESSAGE_CONTENT,
            timestamp: existingMsg.timestamp,
            ...(existingMsg.isSummarization !== undefined && {
              isSummarization: existingMsg.isSummarization,
            }),
            ...(existingMsg.actions && { actions: existingMsg.actions }),
            ...(existingMsg.thinkingProcess && { thinkingProcess: existingMsg.thinkingProcess }),
          };
          // 更新 store 中的消息历史
          if (currentSession) {
            chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
          }
        }
      }

      // 保存总结（不清除聊天历史）
      chatSessionsStore.summarizeAndReset(summary);

      // 注意：记忆创建已移至 AssistantService.requestSummaryReset 中统一处理
      // 避免重复创建相同的会话摘要记忆

      // 更新本地消息列表（使用标记避免触发 watch）
      isUpdatingFromStore = true;
      const session = chatSessionsStore.currentSession;
      if (session) {
        messages.value = [...session.messages];
      }
      await nextTick();
      isUpdatingFromStore = false;

      return { success: true };
    } catch (error) {
      console.error('Failed to summarize session:', error);

      toast.add({
        severity: 'error',
        summary: '总结失败',
        detail: error instanceof Error ? error.message : '未知错误',
        life: 5000,
      });

      // 总结失败时，检查是否达到限制
      if (willReachLimit) {
        toast.add({
          severity: 'warn',
          summary: '无法发送消息',
          detail: '会话消息数已达上限，且自动总结失败。请手动创建新会话或清空当前会话。',
          life: 5000,
        });
        isSending.value = false;
      }

      return { success: false };
    } finally {
      isSummarizing.value = false;
      // 注意：isSending 在成功时保持 true，因为后续会继续发送消息
      // 只在失败且达到限制时在 catch 中重置为 false
    }
  }

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };
  messages.value.push(userMessage);
  inputMessage.value = '';
  isSending.value = true;
  scrollToBottom();

  // 添加占位符助手消息
  let assistantMessageId = (Date.now() + 1).toString();
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };
  messages.value.push(assistantMessage);

  // 注意：不在这里重置操作列表，因为操作可能在消息发送过程中发生
  // 操作列表会在消息完成或失败时处理

  // 获取当前会话的总结（如果有）
  // 保存会话 ID，确保在异步操作期间即使会话切换，消息也会保存到正确的会话
  // 在 try 块外定义，以便在 catch 块中也能访问
  const currentSession = chatSessionsStore.currentSession;
  const sessionId = currentSession?.id ?? null;
  const sessionSummary = currentSession?.summary;

  try {
    // 将 store 中的消息转换为 AI ChatMessage 格式（只保留上次总结后的内容）
    const messageHistory: AIChatMessage[] | undefined = buildAIMessageHistory(currentSession);

    // 用于跟踪摘要消息 ID（如果摘要在服务内部触发）
    let internalSummarizationMessageId: string | null = null;
    // 标记是否正在摘要（用于阻止 onChunk 更新助手消息）
    let isSummarizingInternally = false;
    // 保存摘要前的思考过程，以便在摘要后恢复
    let savedThinkingProcess: string | undefined = undefined;

    // 调用 AssistantService（内部会创建任务并获取 abortController signal）
    // 如果 UI 已经执行了摘要，告知服务跳过 token 限制检查，避免重复摘要
    const result = await AssistantService.chat(assistantModel.value, message, {
      ...(sessionSummary ? { sessionSummary } : {}),
      ...(messageHistory ? { messageHistory } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(uiPerformedSummarization ? { skipTokenLimitSummarization: true } : {}),
      onSummarizingStart: () => {
        // 当服务内部开始摘要时，创建摘要气泡
        isSummarizingInternally = true;

        // 在移除助手消息之前，保存其思考过程
        const assistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageId);
        if (assistantMsgIndex >= 0) {
          const assistantMsg = messages.value[assistantMsgIndex];
          if (assistantMsg) {
            // 保存思考过程（如果存在）
            if (assistantMsg.thinkingProcess) {
              savedThinkingProcess = assistantMsg.thinkingProcess;
            }
            // 立即移除占位符助手消息，防止显示 AI 响应内容
            messages.value.splice(assistantMsgIndex, 1);
          }
        }

        internalSummarizationMessageId = (Date.now() - 1).toString();
        const summarizationMessage: ChatMessage = {
          id: internalSummarizationMessageId,
          role: 'assistant',
          content: SUMMARIZING_MESSAGE_CONTENT,
          timestamp: Date.now(),
          isSummarization: true,
        };
        messages.value.push(summarizationMessage);
        // 更新 store 中的消息历史
        if (currentSession) {
          chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
        }
        scrollToBottom();
      },
      onChunk: (chunk) => {
        // 如果正在摘要，不更新助手消息内容
        if (isSummarizingInternally) {
          return;
        }
        // 更新助手消息内容
        const msg = messages.value.find((m) => m.id === assistantMessageId);
        if (msg) {
          if (chunk.text) {
            msg.content += chunk.text;
            scrollToBottom();
          }
        }
      },
      onThinkingChunk: (text) => {
        // 如果正在摘要，不更新助手消息的思考过程
        if (isSummarizingInternally) {
          return;
        }
        // 更新助手消息的思考过程
        const msg = messages.value.find((m) => m.id === assistantMessageId);
        if (msg) {
          if (!msg.thinkingProcess) {
            msg.thinkingProcess = '';
          }
          msg.thinkingProcess += text;
          // 标记思考过程为活动状态（显示加载指示器）
          markThinkingActive(assistantMessageId);
          // 如果思考过程已展开，滚动到思考过程内容底部
          if (thinkingExpanded.value.get(assistantMessageId)) {
            scrollThinkingToBottom(assistantMessageId);
          }
          scrollToBottom();
        }
      },
      onToast: (message) => {
        // 工具可以直接显示 toast
        toast.add(message);
      },
      onAction: (action: ActionInfo) => {
        // 记录操作到当前消息
        const messageAction = createMessageActionFromActionInfo(action);

        // 处理导航操作
        if (action.type === 'navigate' && 'book_id' in action.data) {
          const bookId = action.data.book_id as string;
          const chapterId = 'chapter_id' in action.data ? (action.data.chapter_id as string) : null;
          const paragraphId =
            'paragraph_id' in action.data ? (action.data.paragraph_id as string) : null;

          // 导航到书籍详情页面
          void co(function* () {
            try {
              yield router.push(`/books/${bookId}`);
              // 等待路由完成后再设置选中的章节
              yield nextTick();
              if (chapterId) {
                bookDetailsStore.setSelectedChapter(bookId, chapterId);
              }

              // 如果有段落 ID，滚动到该段落
              if (paragraphId) {
                yield nextTick();
                // 等待章节加载完成后再滚动
                setTimeout(() => {
                  const paragraphElement = document.getElementById(`paragraph-${paragraphId}`);
                  if (paragraphElement) {
                    paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 500); // 给章节内容加载一些时间
              }
            } catch (error) {
              console.error('[AppRightPanel] 导航失败:', error);
            }
          });
        }

        // 立即将操作添加到临时数组（用于后续保存）
        currentMessageActions.value.push(messageAction);

        // 立即将操作添加到当前助手消息，使其立即显示在 UI 中
        const assistantMsg = messages.value.find((m) => m.id === assistantMessageId);
        if (assistantMsg) {
          if (!assistantMsg.actions) {
            assistantMsg.actions = [];
          }
          // 检查是否已经添加过（避免重复）
          const existingAction = assistantMsg.actions.find(
            (a) => a.timestamp === messageAction.timestamp && a.type === messageAction.type,
          );
          if (!existingAction) {
            assistantMsg.actions.push(messageAction);
            // 触发响应式更新并滚动到底部
            void nextTick(() => {
              scrollToBottom();
            });
          }
        }

        // 在调用工具后，创建新的助手消息用于后续回复
        // 这样后续的 AI 回复会显示在新的消息气泡中
        // 但对于 todo 操作，不创建新消息，以便多个 todo 可以在同一消息中分组显示
        if (action.entity !== 'todo') {
          // 检查是否接近消息限制，如果是，则不创建新消息，防止在单次响应中超出限制
          const currentSessionForLimit = chatSessionsStore.currentSession;
          const currentMsgCount = getMessagesSinceSummaryCount(currentSessionForLimit);

          // 只有当消息数量未达到硬限制时才创建新消息
          if (currentMsgCount < MAX_MESSAGES_PER_SESSION) {
            const newAssistantMessageId = (Date.now() + 1).toString();
            const newAssistantMessage: ChatMessage = {
              id: newAssistantMessageId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            };
            messages.value.push(newAssistantMessage);
            // 更新 assistantMessageId，使后续的 onChunk 更新新消息
            assistantMessageId = newAssistantMessageId;
            // 重置当前消息操作列表，因为新消息还没有操作
            currentMessageActions.value = [];
          }
          // 如果已达到限制，继续使用当前消息，后续会在响应完成后触发自动总结
        }
        scrollToBottom();

        // 显示操作通知

        // 处理网络搜索和网页获取操作（不显示 toast 通知）
        if (action.type === 'web_search') {
          return;
        }

        if (action.type === 'web_fetch') {
          return;
        }

        // 处理读取操作（不显示 toast 通知，但会在消息中显示操作标签）
        if (action.type === 'read') {
          return;
        }

        // 处理导航操作（不显示 toast 通知，导航已在上面处理）
        if (action.type === 'navigate') {
          return;
        }

        // 处理待办事项操作（不显示 toast 通知，根据需求）
        if (action.entity === 'todo') {
          // 刷新待办事项列表
          loadTodos();
          return;
        }

        // 构建详细的 toast 消息
        let detail = '';
        let shouldShowRevertToast = false;

        if (action.type === 'create' && 'name' in action.data) {
          // 创建操作：显示详细信息
          if (action.entity === 'character' && 'id' in action.data) {
            const character = action.data as CharacterSetting;
            const parts: string[] = [];

            // 角色名称和翻译（主要信息）
            if (character.name) {
              const translation = character.translation?.translation;
              if (translation) {
                parts.push(`${character.name} → ${translation}`);
              } else {
                parts.push(character.name);
              }
            }

            // 其他详细信息
            const details: string[] = [];

            // 性别
            if (character.sex) {
              const sexLabels: Record<string, string> = {
                male: '男',
                female: '女',
                other: '其他',
              };
              details.push(`性别：${sexLabels[character.sex] || character.sex}`);
            }

            // 说话口吻
            if (character.speakingStyle) {
              details.push(`口吻：${character.speakingStyle}`);
            }

            // 别名数量
            if (character.aliases && character.aliases.length > 0) {
              details.push(`别名：${character.aliases.length} 个`);
            }

            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = mainInfo;
            } else if (details.length > 0) {
              detail = details.join(' | ');
            } else {
              detail = `角色 "${character.name}" 已创建`;
            }

            // 为创建操作添加 revert（删除）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (contextStore.getContext.currentBookId) {
                    await CharacterSettingService.deleteCharacterSetting(
                      contextStore.getContext.currentBookId,
                      character.id,
                    );
                  }
                },
              });
            }
          } else if (action.entity === 'term' && 'id' in action.data) {
            const term = action.data as Terminology;
            const parts: string[] = [];

            // 术语名称和翻译（主要信息）
            if (term.name) {
              const translation = term.translation?.translation;
              if (translation) {
                parts.push(`${term.name} → ${translation}`);
              } else {
                parts.push(term.name);
              }
            }

            // 其他详细信息
            const details: string[] = [];

            // 描述
            if (term.description) {
              details.push(`描述：${term.description}`);
            }

            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = mainInfo;
            } else if (details.length > 0) {
              detail = details.join(' | ');
            } else {
              detail = `术语 "${term.name}" 已创建`;
            }

            // 为创建操作添加 revert（删除）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (contextStore.getContext.currentBookId) {
                    await TerminologyService.deleteTerminology(
                      contextStore.getContext.currentBookId,
                      term.id,
                    );
                  }
                },
              });
            }
          } else {
            // 默认创建消息
            detail = `${ENTITY_LABELS[action.entity]} "${action.data.name}" 已${ACTION_LABELS[action.type]}`;
          }
        } else if (
          action.type === 'update' &&
          action.entity === 'character' &&
          'name' in action.data
        ) {
          // 角色更新操作：显示详细信息
          const character = action.data as CharacterSetting;
          const parts: string[] = [];

          // 角色名称和翻译（主要信息）
          if (character.name) {
            const translation = character.translation?.translation;
            if (translation) {
              parts.push(`${character.name} → ${translation}`);
            } else {
              parts.push(character.name);
            }
          }

          // 其他详细信息
          const details: string[] = [];

          // 性别
          if (character.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            details.push(`性别：${sexLabels[character.sex] || character.sex}`);
          }

          // 说话口吻
          if (character.speakingStyle) {
            details.push(`口吻：${character.speakingStyle}`);
          }

          // 别名数量
          if (character.aliases && character.aliases.length > 0) {
            details.push(`别名：${character.aliases.length} 个`);
          }

          // 组合消息
          const mainInfo = parts.join(' | ');
          if (mainInfo && details.length > 0) {
            detail = `${mainInfo} | ${details.join(' | ')}`;
          } else if (mainInfo) {
            detail = mainInfo;
          } else if (details.length > 0) {
            detail = details.join(' | ');
          } else {
            detail = '角色已更新';
          }

          // 添加 revert 功能
          const previousCharacter = action.previousData as CharacterSetting | undefined;

          if (previousCharacter && contextStore.getContext.currentBookId) {
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
              detail,
              life: 3000,
              onRevert: async () => {
                if (previousCharacter && contextStore.getContext.currentBookId) {
                  await CharacterSettingService.updateCharacterSetting(
                    contextStore.getContext.currentBookId,
                    previousCharacter.id,
                    {
                      name: previousCharacter.name,
                      sex: previousCharacter.sex,
                      translation: previousCharacter.translation.translation,
                      ...(previousCharacter.description !== undefined
                        ? { description: previousCharacter.description }
                        : {}),
                      ...(previousCharacter.speakingStyle !== undefined
                        ? { speakingStyle: previousCharacter.speakingStyle }
                        : {}),
                      ...(previousCharacter.aliases !== undefined
                        ? {
                            aliases: previousCharacter.aliases.map((a: Alias) => ({
                              name: a.name,
                              translation: a.translation.translation,
                            })),
                          }
                        : {}),
                    },
                  );
                }
              },
            });
          }
        } else if (action.type === 'update' && action.entity === 'term' && 'name' in action.data) {
          // 术语更新操作：显示详细信息
          const term = action.data as Terminology;
          const parts: string[] = [];

          // 术语名称和翻译（主要信息）
          if (term.name) {
            const translation = term.translation?.translation;
            if (translation) {
              parts.push(`${term.name} → ${translation}`);
            } else {
              parts.push(term.name);
            }
          }

          // 其他详细信息
          const details: string[] = [];

          // 描述
          if (term.description) {
            details.push(`描述：${term.description}`);
          }

          // 组合消息
          const mainInfo = parts.join(' | ');
          if (mainInfo && details.length > 0) {
            detail = `${mainInfo} | ${details.join(' | ')}`;
          } else if (mainInfo) {
            detail = mainInfo;
          } else if (details.length > 0) {
            detail = details.join(' | ');
          } else {
            detail = `术语 "${term.name}" 已更新`;
          }

          // 添加 revert 功能
          const previousTerm = action.previousData as Terminology | undefined;

          if (previousTerm && contextStore.getContext.currentBookId) {
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
              detail,
              life: 3000,
              onRevert: async () => {
                if (previousTerm && contextStore.getContext.currentBookId) {
                  await TerminologyService.updateTerminology(
                    contextStore.getContext.currentBookId,
                    previousTerm.id,
                    {
                      name: previousTerm.name,
                      translation: previousTerm.translation.translation,
                      ...(previousTerm.description !== undefined
                        ? { description: previousTerm.description }
                        : {}),
                    },
                  );
                }
              },
            });
          }
        } else if (action.type === 'update' && action.entity === 'translation') {
          // 检查是否是批量替换操作
          if (
            'tool_name' in action.data &&
            action.data.tool_name === 'batch_replace_translations'
          ) {
            // 批量替换操作：显示汇总信息
            const batchData = action.data as {
              tool_name: string;
              replaced_paragraph_count: number;
              replaced_translation_count: number;
              keywords?: string[];
              original_keywords?: string[];
              replacement_text: string;
              replace_all_translations: boolean;
            };

            const keywordParts: string[] = [];
            if (batchData.keywords && batchData.keywords.length > 0) {
              keywordParts.push(`翻译关键词: ${batchData.keywords.join(', ')}`);
            }
            if (batchData.original_keywords && batchData.original_keywords.length > 0) {
              keywordParts.push(`原文关键词: ${batchData.original_keywords.join(', ')}`);
            }

            const keywordInfo = keywordParts.length > 0 ? ` | ${keywordParts.join(' | ')}` : '';
            const replacementPreview =
              batchData.replacement_text.length > 30
                ? batchData.replacement_text.substring(0, 30) + '...'
                : batchData.replacement_text;

            detail = `已批量替换 ${batchData.replaced_paragraph_count} 个段落（共 ${batchData.replaced_translation_count} 个翻译版本） | 替换为: "${replacementPreview}"${keywordInfo}`;

            // 获取 previousData 中的替换数据以便恢复
            const previousData = action.previousData as
              | {
                  replaced_paragraphs: Array<{
                    paragraph_id: string;
                    chapter_id: string;
                    old_translations: Array<{
                      id: string;
                      translation: string;
                      aiModelId: string;
                    }>;
                  }>;
                }
              | undefined;

            // 添加 revert 功能
            if (
              previousData &&
              previousData.replaced_paragraphs &&
              contextStore.getContext.currentBookId
            ) {
              toast.add({
                severity: 'success',
                summary: '批量替换翻译',
                detail,
                life: 5000,
                onRevert: async () => {
                  if (
                    previousData &&
                    previousData.replaced_paragraphs &&
                    contextStore.getContext.currentBookId
                  ) {
                    const bookId = contextStore.getContext.currentBookId;
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(bookId);
                    if (!book) return;

                    // 恢复所有被替换的翻译
                    for (const replacedParagraph of previousData.replaced_paragraphs) {
                      // 查找段落位置
                      const location = ChapterService.findParagraphLocation(
                        book,
                        replacedParagraph.paragraph_id,
                      );
                      if (!location) continue;

                      const { paragraph } = location;

                      // 确保段落有翻译数组
                      if (!paragraph.translations || paragraph.translations.length === 0) {
                        continue;
                      }

                      // 恢复每个翻译
                      for (const oldTranslation of replacedParagraph.old_translations) {
                        const translationIndex = paragraph.translations.findIndex(
                          (t) => t.id === oldTranslation.id,
                        );
                        if (translationIndex !== -1 && paragraph.translations[translationIndex]) {
                          // 恢复原始翻译文本
                          paragraph.translations[translationIndex]!.translation =
                            oldTranslation.translation;
                        }
                      }
                    }

                    // 更新书籍
                    if (book.volumes) {
                      await booksStore.updateBook(bookId, { volumes: book.volumes });
                    }
                  }
                },
              });
            } else {
              // 如果没有 previousData，仍然显示 toast（但不提供撤销）
              toast.add({
                severity: 'success',
                summary: '批量替换翻译',
                detail,
                life: 5000,
              });
            }
            return; // 批量替换操作已处理，不需要继续处理
          }

          // 翻译更新操作：显示详细信息
          if (
            'paragraph_id' in action.data &&
            'translation_id' in action.data &&
            'old_translation' in action.data &&
            'new_translation' in action.data
          ) {
            const translationData = action.data as {
              paragraph_id: string;
              translation_id: string;
              old_translation: string;
              new_translation: string;
            };
            const previousTranslation = action.previousData as Translation | undefined;

            // 构建详细信息
            const oldText = translationData.old_translation;
            const newText = translationData.new_translation;
            const previewLength = 50;
            const oldPreview =
              oldText.length > previewLength
                ? oldText.substring(0, previewLength) + '...'
                : oldText;
            const newPreview =
              newText.length > previewLength
                ? newText.substring(0, previewLength) + '...'
                : newText;

            detail = `段落翻译已更新 | 旧: "${oldPreview}" → 新: "${newPreview}"`;

            // 添加 revert 功能
            if (previousTranslation && contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type as ActionInfo['type']]}${ENTITY_LABELS[action.entity as ActionInfo['entity']]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (previousTranslation && contextStore.getContext.currentBookId) {
                    const bookId = contextStore.getContext.currentBookId;
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(bookId);
                    if (!book) return;

                    // 查找段落
                    const location = ChapterService.findParagraphLocation(
                      book,
                      translationData.paragraph_id,
                    );
                    if (!location) return;

                    const { paragraph } = location;

                    // 查找要恢复的翻译
                    const translationIndex = paragraph.translations.findIndex(
                      (t) => t.id === translationData.translation_id,
                    );
                    if (translationIndex === -1) return;

                    // 恢复原始翻译
                    const translationToRestore = paragraph.translations[translationIndex];
                    if (translationToRestore) {
                      translationToRestore.translation = previousTranslation.translation;
                    }

                    // 更新书籍
                    if (book.volumes) {
                      await booksStore.updateBook(bookId, { volumes: book.volumes });
                    }
                  }
                },
              });
            } else {
              // 如果没有 previousData，仍然显示 toast（但不提供撤销）
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type as ActionInfo['type']]}${ENTITY_LABELS[action.entity as ActionInfo['entity']]}`,
                detail,
                life: 3000,
              });
            }
          }
        } else if (action.type === 'delete' && 'name' in action.data) {
          // 删除操作：显示详细信息（从 previousData 获取）
          if (action.entity === 'character' && action.previousData) {
            const previousCharacter = action.previousData as CharacterSetting;
            const parts: string[] = [];

            // 角色名称和翻译（主要信息）
            if (previousCharacter.name) {
              const translation = previousCharacter.translation?.translation;
              if (translation) {
                parts.push(`${previousCharacter.name} → ${translation}`);
              } else {
                parts.push(previousCharacter.name);
              }
            }

            // 其他详细信息
            const details: string[] = [];

            // 性别
            if (previousCharacter.sex) {
              const sexLabels: Record<string, string> = {
                male: '男',
                female: '女',
                other: '其他',
              };
              details.push(`性别：${sexLabels[previousCharacter.sex] || previousCharacter.sex}`);
            }

            // 说话口吻
            if (previousCharacter.speakingStyle) {
              details.push(`口吻：${previousCharacter.speakingStyle}`);
            }

            // 别名数量
            if (previousCharacter.aliases && previousCharacter.aliases.length > 0) {
              details.push(`别名：${previousCharacter.aliases.length} 个`);
            }

            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `已删除：${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = `已删除：${mainInfo}`;
            } else if (details.length > 0) {
              detail = `已删除角色 | ${details.join(' | ')}`;
            } else {
              detail = `角色 "${previousCharacter.name}" 已删除`;
            }

            // 为删除操作添加 revert（恢复）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (previousCharacter && contextStore.getContext.currentBookId) {
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(contextStore.getContext.currentBookId);
                    if (book) {
                      const current = book.characterSettings || [];
                      // 检查是否存在（避免重复）
                      if (!current.some((c) => c.id === previousCharacter.id)) {
                        await booksStore.updateBook(book.id, {
                          characterSettings: [...current, previousCharacter],
                          lastEdited: new Date(),
                        });
                      }
                    }
                  }
                },
              });
            }
          } else if (action.entity === 'term' && action.previousData) {
            const previousTerm = action.previousData as Terminology;
            const parts: string[] = [];

            // 术语名称和翻译（主要信息）
            if (previousTerm.name) {
              const translation = previousTerm.translation?.translation;
              if (translation) {
                parts.push(`${previousTerm.name} → ${translation}`);
              } else {
                parts.push(previousTerm.name);
              }
            }

            // 其他详细信息
            const details: string[] = [];

            // 描述
            if (previousTerm.description) {
              details.push(`描述：${previousTerm.description}`);
            }

            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `已删除：${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = `已删除：${mainInfo}`;
            } else if (details.length > 0) {
              detail = `已删除术语 | ${details.join(' | ')}`;
            } else {
              detail = `术语 "${previousTerm.name}" 已删除`;
            }

            // 为删除操作添加 revert（恢复）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (previousTerm && contextStore.getContext.currentBookId) {
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(contextStore.getContext.currentBookId);
                    if (book) {
                      const current = book.terminologies || [];
                      // 检查是否存在（避免重复）
                      if (!current.some((t) => t.id === previousTerm.id)) {
                        await booksStore.updateBook(book.id, {
                          terminologies: [...current, previousTerm],
                          lastEdited: new Date(),
                        });
                      }
                    }
                  }
                },
              });
            }
          } else {
            // 默认删除消息
            detail = `${ENTITY_LABELS[action.entity]} "${action.data.name}" 已${ACTION_LABELS[action.type]}`;
          }
        } else if (action.type === 'update' && action.entity === 'book') {
          // 书籍更新操作：显示详细信息
          const bookData = action.data as {
            book_id?: string;
            tool_name?: string;
            description?: string;
            tags?: string[];
            author?: string;
            alternate_titles?: string[];
          };

          const updatedFields: string[] = [];
          const details: string[] = [];

          // 检查更新的字段
          if ('description' in bookData && bookData.description !== undefined) {
            updatedFields.push('描述');
            if (bookData.description && bookData.description.trim().length > 0) {
              const preview =
                bookData.description.length > 50
                  ? bookData.description.substring(0, 50) + '...'
                  : bookData.description;
              details.push(`描述：${preview}`);
            } else {
              details.push('描述：已清除');
            }
          }

          if ('tags' in bookData && bookData.tags !== undefined) {
            updatedFields.push('标签');
            if (bookData.tags.length > 0) {
              details.push(`标签：${bookData.tags.join('、')}`);
            } else {
              details.push('标签：已清除');
            }
          }

          if ('author' in bookData && bookData.author !== undefined) {
            updatedFields.push('作者');
            if (bookData.author && bookData.author.trim().length > 0) {
              details.push(`作者：${bookData.author}`);
            } else {
              details.push('作者：已清除');
            }
          }

          if ('alternate_titles' in bookData && bookData.alternate_titles !== undefined) {
            updatedFields.push('别名');
            if (bookData.alternate_titles.length > 0) {
              details.push(`别名：${bookData.alternate_titles.join('、')}`);
            } else {
              details.push('别名：已清除');
            }
          }

          // 组合消息
          if (updatedFields.length > 0) {
            if (details.length > 0) {
              detail = `已更新：${updatedFields.join('、')} | ${details.join(' | ')}`;
            } else {
              detail = `已更新：${updatedFields.join('、')}`;
            }
          } else {
            detail = '书籍信息已更新';
          }

          // 添加 revert 功能
          const previousBookData = action.previousData as
            | {
                description?: string;
                tags?: string[];
                author?: string;
                alternateTitles?: string[];
              }
            | undefined;

          if (previousBookData && contextStore.getContext.currentBookId) {
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
              detail,
              life: 3000,
              onRevert: async () => {
                if (previousBookData && contextStore.getContext.currentBookId) {
                  const booksStore = useBooksStore();
                  const bookId = contextStore.getContext.currentBookId;
                  const revertUpdates: Partial<Novel> = {};

                  if ('description' in previousBookData) {
                    revertUpdates.description = previousBookData.description;
                  }
                  if ('tags' in previousBookData) {
                    revertUpdates.tags = previousBookData.tags;
                  }
                  if ('author' in previousBookData) {
                    revertUpdates.author = previousBookData.author;
                  }
                  if ('alternateTitles' in previousBookData) {
                    revertUpdates.alternateTitles = previousBookData.alternateTitles;
                  }

                  await booksStore.updateBook(bookId, revertUpdates);
                }
              },
            });
          } else {
            // 如果没有 previousData，仍然显示 toast（但不提供撤销）
            // 设置标志以防止通用 toast 处理重复显示
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
              detail,
              life: 3000,
            });
          }
        } else if (action.entity === 'memory') {
          // Memory 操作：不显示 toast（根据需求）
          // 只记录到 action info，不显示 toast 消息
        } else {
          // 默认消息
          detail = `${ENTITY_LABELS[action.entity]}已${ACTION_LABELS[action.type]}`;
        }

        // 如果没有显示带 revert 的 toast，且不是 memory 操作，显示通用 toast
        if (!shouldShowRevertToast && action.entity !== 'memory') {
          toast.add({
            severity: 'success',
            summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
            detail,
            life: 3000,
          });
        }
      },
      aiProcessingStore: {
        addTask: async (task) => {
          // AssistantService 内部会调用此方法来创建任务
          const id = await aiProcessingStore.addTask(task);
          return id;
        },
        updateTask: async (id, updates) => {
          await aiProcessingStore.updateTask(id, updates);
        },
        appendThinkingMessage: async (id, text) => {
          await aiProcessingStore.appendThinkingMessage(id, text);
        },
        appendOutputContent: async (id, text) => {
          await aiProcessingStore.appendOutputContent(id, text);
        },
        removeTask: async (id) => {
          await aiProcessingStore.removeTask(id);
        },
        activeTasks: aiProcessingStore.activeTasks,
      },
    });

    // 保存 taskId（从 result 中获取，因为任务是在 AssistantService 内部创建的）
    if (result.taskId) {
      currentTaskId.value = result.taskId;
    }

    // 检查是否需要重置（token 限制或错误导致）
    if (result.needsReset && result.summary) {
      // 保存总结（不清除聊天历史，使用保存的会话 ID，确保即使会话切换，总结也会保存到原始会话）
      if (sessionId) {
        chatSessionsStore.summarizeAndReset(result.summary, sessionId);
      }

      // 不显示总结成功的 toast，静默完成

      // 移除占位符助手消息（因为需要重置）
      // 注意：如果已经在 onSummarizingStart 中移除了，这里不会找到消息，但不会报错
      const assistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageId);
      if (assistantMsgIndex >= 0) {
        messages.value.splice(assistantMsgIndex, 1);
      }

      // 重置摘要标志
      isSummarizingInternally = false;

      // 更新摘要消息状态为完成（如果摘要气泡已通过回调创建）
      if (internalSummarizationMessageId) {
        const summarizationMsgIndex = messages.value.findIndex(
          (m) => m.id === internalSummarizationMessageId,
        );
        if (summarizationMsgIndex >= 0) {
          const existingMsg = messages.value[summarizationMsgIndex];
          if (existingMsg) {
            existingMsg.content = SUMMARIZED_WITH_REASON_MESSAGE_CONTENT;
            if (existingMsg.isSummarization === undefined) {
              existingMsg.isSummarization = true;
            }
            // 更新 store 中的消息历史
            if (sessionId) {
              chatSessionsStore.updateSessionMessages(sessionId, messages.value);
            }
          }
        }
      } else {
        // 如果回调没有触发（理论上不应该发生），创建摘要气泡
        const summarizationMessageId = (Date.now() - 1).toString();
        const summarizationMessage: ChatMessage = {
          id: summarizationMessageId,
          role: 'assistant',
          content: SUMMARIZED_WITH_REASON_MESSAGE_CONTENT,
          timestamp: Date.now(),
          isSummarization: true,
        };
        messages.value.push(summarizationMessage);
        // 更新 store 中的消息历史
        if (sessionId) {
          chatSessionsStore.updateSessionMessages(sessionId, messages.value);
        }
      }

      // 更新本地消息列表（使用标记避免触发 watch）
      // 注意：这应该在更新摘要消息之后进行，以确保摘要消息被正确保存
      isUpdatingFromStore = true;
      const session = chatSessionsStore.currentSession;
      if (session) {
        messages.value = [...session.messages];

        // 确保摘要消息在重新加载后仍然存在且内容正确
        // 因为从 store 重新加载可能会丢失刚刚更新的摘要消息
        const summarizationMessageContent = SUMMARIZED_WITH_REASON_MESSAGE_CONTENT;
        if (internalSummarizationMessageId) {
          const summarizationMsgIndex = messages.value.findIndex(
            (m) => m.id === internalSummarizationMessageId,
          );
          if (summarizationMsgIndex >= 0) {
            // 如果摘要消息存在，确保内容正确
            const existingMsg = messages.value[summarizationMsgIndex];
            if (existingMsg && existingMsg.content !== summarizationMessageContent) {
              existingMsg.content = summarizationMessageContent;
              existingMsg.isSummarization = true;
            }
          } else {
            // 如果摘要消息不存在，重新创建它
            const summarizationMessage: ChatMessage = {
              id: internalSummarizationMessageId,
              role: 'assistant',
              content: summarizationMessageContent,
              timestamp: Date.now(),
              isSummarization: true,
            };
            messages.value.push(summarizationMessage);
          }
        }
      }
      // 使用 nextTick 确保在下一个 tick 重置标记
      await nextTick();
      isUpdatingFromStore = false;

      // 不创建显示完整总结内容的消息，因为用户要求不显示 AI 总结响应

      // 更新 store 中的消息历史
      // 使用保存的会话 ID，确保即使会话切换，消息也会保存到原始会话
      if (sessionId) {
        chatSessionsStore.updateSessionMessages(sessionId, messages.value);
      }

      // 清空操作列表
      currentMessageActions.value = [];

      // 摘要完成后，继续发送用户消息（基于摘要后的上下文）
      // 用户消息已经在前面添加了，现在需要重新调用 AssistantService.chat
      // 但这次会使用摘要后的上下文，所以不会再次触发摘要

      // 确保用户消息已保存到 store
      if (sessionId) {
        chatSessionsStore.updateSessionMessages(sessionId, messages.value);
      }

      // 重新获取更新后的会话摘要和消息历史
      const updatedSession = chatSessionsStore.currentSession;
      const updatedSessionSummary = updatedSession?.summary;
      const updatedMessageHistory: AIChatMessage[] | undefined =
        buildAIMessageHistory(updatedSession);

      // 创建新的助手消息用于继续对话
      assistantMessageId = (Date.now() + 1).toString();
      const newAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        // 恢复摘要前的思考过程（如果存在）
        ...(savedThinkingProcess ? { thinkingProcess: savedThinkingProcess } : {}),
      };
      messages.value.push(newAssistantMessage);
      scrollToBottom();

      // 重置摘要标志
      isSummarizingInternally = false;

      try {
        // 重新调用 AssistantService.chat，这次会使用摘要后的上下文
        const continueResult = await AssistantService.chat(assistantModel.value, message, {
          ...(updatedSessionSummary ? { sessionSummary: updatedSessionSummary } : {}),
          ...(updatedMessageHistory ? { messageHistory: updatedMessageHistory } : {}),
          onChunk: (chunk) => {
            // 更新助手消息内容
            const msg = messages.value.find((m) => m.id === assistantMessageId);
            if (msg) {
              if (chunk.text) {
                msg.content += chunk.text;
                scrollToBottom();
              }
            }
          },
          onThinkingChunk: (text) => {
            // 更新助手消息的思考过程
            const msg = messages.value.find((m) => m.id === assistantMessageId);
            if (msg) {
              if (!msg.thinkingProcess) {
                msg.thinkingProcess = '';
              }
              msg.thinkingProcess += text;
              // 标记思考过程为活动状态（显示加载指示器）
              markThinkingActive(assistantMessageId);
              // 如果思考过程已展开，滚动到思考过程内容底部
              if (thinkingExpanded.value.get(assistantMessageId)) {
                scrollThinkingToBottom(assistantMessageId);
              }
              scrollToBottom();
            }
          },
          onToast: (message) => {
            // 工具可以直接显示 toast
            toast.add(message);
          },
          onAction: (action: ActionInfo) => {
            // 记录操作到当前消息（复用之前的 onAction 逻辑）
            const messageAction = createMessageActionFromActionInfo(action);

            // 处理导航操作
            if (action.type === 'navigate' && 'book_id' in action.data) {
              const bookId = action.data.book_id as string;
              const chapterId =
                'chapter_id' in action.data ? (action.data.chapter_id as string) : null;
              const paragraphId =
                'paragraph_id' in action.data ? (action.data.paragraph_id as string) : null;

              // 导航到书籍详情页面
              void co(function* () {
                try {
                  yield router.push(`/books/${bookId}`);
                  // 等待路由完成后再设置选中的章节
                  yield nextTick();
                  if (chapterId) {
                    bookDetailsStore.setSelectedChapter(bookId, chapterId);
                  }

                  // 如果有段落 ID，滚动到该段落
                  if (paragraphId) {
                    yield nextTick();
                    // 等待章节加载完成后再滚动
                    setTimeout(() => {
                      const paragraphElement = document.getElementById(`paragraph-${paragraphId}`);
                      if (paragraphElement) {
                        paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 500); // 给章节内容加载一些时间
                  }
                } catch (error) {
                  console.error('[AppRightPanel] 导航失败:', error);
                }
              });
            }

            // 立即将操作添加到临时数组（用于后续保存）
            currentMessageActions.value.push(messageAction);

            // 立即将操作添加到当前助手消息，使其立即显示在 UI 中
            const assistantMsg = messages.value.find((m) => m.id === assistantMessageId);
            if (assistantMsg) {
              if (!assistantMsg.actions) {
                assistantMsg.actions = [];
              }
              assistantMsg.actions.push(messageAction);
            }
          },
          // 不传递 signal，让服务内部管理
          aiProcessingStore: {
            addTask: async (task) => {
              const id = await aiProcessingStore.addTask(task);
              return id;
            },
            updateTask: async (id, updates) => {
              await aiProcessingStore.updateTask(id, updates);
            },
            appendThinkingMessage: async (id, text) => {
              await aiProcessingStore.appendThinkingMessage(id, text);
            },
            appendOutputContent: async (id, text) => {
              await aiProcessingStore.appendOutputContent(id, text);
            },
            removeTask: async (id) => {
              await aiProcessingStore.removeTask(id);
            },
            activeTasks: aiProcessingStore.activeTasks,
          },
        });

        // 处理继续对话的结果
        if (continueResult.taskId) {
          currentTaskId.value = continueResult.taskId;
        }

        // 如果继续对话时又需要重置（理论上不应该发生，但为了安全起见）
        if (continueResult.needsReset && continueResult.summary) {
          // 这种情况不应该发生，但如果发生了，我们只保存摘要，不继续对话
          if (sessionId) {
            chatSessionsStore.summarizeAndReset(continueResult.summary, sessionId);
          }
          // 移除助手消息
          const continueAssistantMsgIndex = messages.value.findIndex(
            (m) => m.id === assistantMessageId,
          );
          if (continueAssistantMsgIndex >= 0) {
            messages.value.splice(continueAssistantMsgIndex, 1);
          }
          toast.add({
            severity: 'warn',
            summary: '对话无法继续',
            detail: '摘要后再次达到限制，请创建新会话',
            life: 5000,
          });
          return;
        }

        // 更新最终消息内容和操作
        const finalMsg = messages.value.find((m) => m.id === assistantMessageId);
        if (finalMsg) {
          finalMsg.content = continueResult.text || '';
          if (continueResult.actions && continueResult.actions.length > 0) {
            if (!finalMsg.actions) {
              finalMsg.actions = [];
            }
            // 将服务返回的操作添加到消息中
            for (const action of continueResult.actions) {
              const messageAction = createMessageActionFromActionInfo(action);
              finalMsg.actions.push(messageAction);
            }
          }
          // 清除思考过程活动状态（消息已完成）
          setThinkingActive(assistantMessageId, false);
        }

        // 更新 store 中的消息历史
        if (continueResult.messageHistory && sessionId) {
          // 将 AI 返回的消息历史转换为 ChatMessage 格式并更新
          const updatedMessages: ChatMessage[] = messages.value.map((msg) => {
            // 保留现有的消息，只更新助手消息的内容
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content: continueResult.text || msg.content,
              };
            }
            return msg;
          });
          chatSessionsStore.updateSessionMessages(sessionId, updatedMessages);
        } else if (sessionId) {
          chatSessionsStore.updateSessionMessages(sessionId, messages.value);
        }

        // 清空操作列表
        currentMessageActions.value = [];

        isSending.value = false;
        return; // 继续对话完成，提前返回
      } catch (continueError) {
        console.error('继续对话失败:', continueError);
        // 移除助手消息
        const errorAssistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageId);
        if (errorAssistantMsgIndex >= 0) {
          messages.value.splice(errorAssistantMsgIndex, 1);
        }
        toast.add({
          severity: 'error',
          summary: '继续对话失败',
          detail: continueError instanceof Error ? continueError.message : '未知错误',
          life: 5000,
        });
        isSending.value = false;
        return;
      }
    }

    // 更新最终消息内容
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      // 如果 result.text 有内容，使用它（这会覆盖流式累积的内容，确保最终一致性）
      // 如果 result.text 为空但 msg.content 有内容（来自流式更新），保留流式内容
      // 如果两者都为空，显示错误提示
      if (result.text) {
        msg.content = result.text;
      } else if (!msg.content) {
        // 如果既没有流式内容也没有最终内容，可能是响应为空
        msg.content = '抱歉，我没有收到有效的回复。请重试。';
      }
      // 操作信息已经在 onAction 回调中立即添加了，这里不需要再次添加
      // 但我们需要确保操作数组存在（如果没有任何操作，保持为 undefined 或空数组）
      if (!msg.actions) {
        msg.actions = [];
      }
      // 清除思考过程活动状态（消息已完成）
      setThinkingActive(assistantMessageId, false);
    }

    // 更新 store 中的消息历史（使用 UI 中的消息列表，它们已经包含了用户和助手消息）
    // 使用保存的会话 ID，确保即使会话切换，消息也会保存到原始会话
    if (sessionId) {
      chatSessionsStore.updateSessionMessages(sessionId, messages.value);
    }

    // 清空操作列表（消息完成后）
    currentMessageActions.value = [];

    // AI 响应完成后，检查是否需要自动总结
    // 这样可以在 AI 输出多条消息后自动触发总结，而不是等用户下次发消息时才触发
    const sessionAfterResponse = chatSessionsStore.currentSession;
    const messageCountAfterResponse = getMessagesSinceSummaryCount(sessionAfterResponse);
    if (messageCountAfterResponse >= MESSAGE_LIMIT_THRESHOLD) {
      // 异步执行自动总结，不阻塞当前响应完成
      void performAutoSummarization();
    }
  } catch (error) {
    // 检查是否是用户主动取消的错误
    const isAborted =
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.message.includes('aborted') ||
        error.message.includes('cancelled'));

    // 更新错误消息（如果是取消，不显示错误）
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      if (isAborted) {
        // 如果是用户取消，更新消息显示已取消
        if (!msg.content.trim()) {
          msg.content = '**已取消**\n\n用户已停止 AI 思考过程。';
        } else {
          msg.content += '\n\n**已取消**';
        }
      } else {
        // 其他错误，显示错误信息
        msg.content = `错误：${error instanceof Error ? error.message : '未知错误'}`;
      }
      // 即使出错，也保存已记录的操作（如果有的话）
      if (currentMessageActions.value.length > 0) {
        msg.actions = [...currentMessageActions.value];
      }
      // 清除思考过程活动状态（消息已失败）
      setThinkingActive(assistantMessageId, false);
    }

    // 保存消息到正确的会话（使用保存的会话 ID）
    if (sessionId && messages.value.length > 0) {
      chatSessionsStore.updateSessionMessages(sessionId, messages.value);
    }

    // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
  } finally {
    isSending.value = false;
    currentTaskId.value = null;
    // 清空操作列表（无论成功还是失败）
    currentMessageActions.value = [];
    // 清除所有思考过程活动状态（消息已完成或失败）
    if (assistantMessageId) {
      setThinkingActive(assistantMessageId, false);
    }
    scrollToBottom();
    // 聚焦输入框
    focusInput();
  }
};

// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
};

// 清空聊天
const clearChat = () => {
  messages.value = [];
  chatSessionsStore.clearCurrentSession();
};

// 创建新会话
const createNewSession = async () => {
  // 停止所有正在进行的助手（聊天）相关任务
  // 仅停止聊天任务，不影响翻译、校对等其他任务
  try {
    await aiProcessingStore.stopAllAssistantTasks();
  } catch (error) {
    console.error('Failed to stop assistant tasks:', error);
    // 不阻止创建新会话，即使停止任务失败
  }

  const context = contextStore.getContext;
  chatSessionsStore.createSession({
    bookId: context.currentBookId,
    chapterId: context.currentChapterId,
    paragraphId: context.selectedParagraphId,
  });
  messages.value = [];
};

// 获取章节标题的辅助函数（用于 action 显示）
const getChapterTitleForAction = (chapterId: string | undefined): string | undefined => {
  if (!chapterId) return undefined;
  const currentBookId = contextStore.getContext.currentBookId;
  if (!currentBookId) return undefined;
  const book = booksStore.getBookById(currentBookId);
  if (!book) return undefined;
  const chapterResult = ChapterService.findChapterById(book, chapterId);
  if (chapterResult && chapterResult.chapter) {
    return getChapterDisplayTitle(chapterResult.chapter);
  }
  return undefined;
};

// 加载当前会话的消息
const loadCurrentSession = async () => {
  isUpdatingFromStore = true; // 标记正在从 store 更新
  const session = chatSessionsStore.currentSession;
  if (session) {
    messages.value = [...session.messages];
  } else {
    messages.value = [];
  }
  // 使用 nextTick 确保在下一个 tick 重置标记
  await nextTick();
  isUpdatingFromStore = false;
};

// 初始化会话
onMounted(() => {
  chatSessionsStore.loadSessions();
  if (!chatSessionsStore.currentSessionId) {
    // 如果没有当前会话，创建新会话
    createNewSession();
  } else {
    // 加载当前会话的消息
    void loadCurrentSession();
  }
});

// 监听当前会话变化
watch(
  () => chatSessionsStore.currentSessionId,
  () => {
    void loadCurrentSession();
  },
);

// 监听消息变化，同步到会话
// 使用 immediate: false 避免初始化时的同步
watch(
  () => messages.value,
  (newMessages) => {
    // 如果正在从 store 更新，跳过同步，避免循环
    if (isUpdatingFromStore) {
      return;
    }
    chatSessionsStore.updateCurrentSessionMessages(newMessages);
  },
  { deep: true },
);

// 监听上下文变化，更新会话上下文
watch(
  () => contextStore.getContext,
  (context) => {
    chatSessionsStore.updateCurrentSessionContext({
      bookId: context.currentBookId,
      chapterId: context.currentChapterId,
      paragraphId: context.selectedParagraphId,
    });
  },
  { deep: true },
);

// 监听消息变化，自动滚动
watch(
  () => messages.value.length,
  () => {
    scrollToBottom();
  },
);

// 监听思考过程更新，如果已展开则滚动到底部
watch(
  () => messages.value.map((m) => ({ id: m.id, thinkingProcess: m.thinkingProcess })),
  (newValues, oldValues) => {
    if (!oldValues) return;

    // 检查每个消息的思考过程是否更新
    for (const newVal of newValues) {
      const oldVal = oldValues.find((v) => v.id === newVal.id);
      if (
        oldVal &&
        oldVal.thinkingProcess !== newVal.thinkingProcess &&
        newVal.thinkingProcess &&
        thinkingExpanded.value.get(newVal.id)
      ) {
        // 思考过程已更新且已展开，滚动到底部
        scrollThinkingToBottom(newVal.id);
      }
    }
  },
  { deep: true },
);

// 监听助手输入消息状态，自动填充输入框
watch(
  () => ui.assistantInputMessage,
  (message) => {
    if (message !== null) {
      // 设置输入框的值
      inputMessage.value = message;
      // 打开右侧面板（如果未打开）
      if (!ui.rightPanelOpen) {
        ui.openRightPanel();
      }
      // 聚焦到输入框
      void nextTick(() => {
        if (inputRef.value) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const component = inputRef.value as any;
          if (component.$el) {
            const textarea = component.$el.querySelector('textarea');
            if (textarea) {
              textarea.focus();
            }
          }
        }
      });
      // 清除状态
      ui.setAssistantInputMessage(null);
    }
  },
);

// 获取操作详细信息（用于 popover）
// 使用工具函数，传入上下文
const getActionDetailsWithContext = (action: MessageAction) => {
  const context: ActionDetailsContext = {
    getBookById: (bookId: string) => booksStore.getBookById(bookId),
    getCurrentBookId: () => contextStore.getContext.currentBookId,
  };
  return getActionDetails(action, context);
};

// 切换操作详情 Popover
const toggleActionPopover = (event: Event, action: MessageAction, message: ChatMessage) => {
  const actionKey = `${message.id}-${action.timestamp}`;
  const popoverRef = actionPopoverRefs.value.get(actionKey);

  if (popoverRef) {
    hoveredAction.value = { action, message };
    popoverRef.toggle(event);
  }
};

// 处理鼠标离开事件，关闭 Popover
const handleActionMouseLeave = (action: MessageAction, message: ChatMessage) => {
  const actionKey = `${message.id}-${action.timestamp}`;
  const popoverRef = actionPopoverRefs.value.get(actionKey);

  if (popoverRef) {
    popoverRef.hide();
  }
};

// 处理 Popover 关闭
const handleActionPopoverHide = () => {
  hoveredAction.value = null;
};

// 切换分组操作详情 Popover
const toggleGroupedActionPopover = (
  event: Event,
  actions: MessageAction[],
  message: ChatMessage,
  timestamp: number,
) => {
  const actionKey = `grouped-${message.id}-${timestamp}`;
  const popoverRef = groupedActionPopoverRefs.value.get(actionKey);

  if (popoverRef) {
    hoveredGroupedAction.value = { actions, message, timestamp };
    popoverRef.toggle(event);
  }
};

// 处理鼠标离开事件，关闭分组操作 Popover
const handleGroupedActionMouseLeave = (_timestamp: number) => {
  // 注意：这里不能直接通过 timestamp 找到 ref，需要遍历或使用其他方式
  // 为了简化，我们使用 hoveredGroupedAction 来找到对应的 ref
  if (hoveredGroupedAction.value) {
    const actionKey = `grouped-${hoveredGroupedAction.value.message.id}-${hoveredGroupedAction.value.timestamp}`;
    const popoverRef = groupedActionPopoverRefs.value.get(actionKey);

    if (popoverRef) {
      popoverRef.hide();
    }
  }
};

// 处理分组操作 Popover 关闭
const handleGroupedActionPopoverHide = () => {
  hoveredGroupedAction.value = null;
};

// 消息显示项类型
interface MessageDisplayItem {
  type: 'content' | 'action' | 'grouped_action';
  content?: string;
  action?: MessageAction;
  groupedActions?: MessageAction[]; // 用于分组显示的操作（如多个 todo 创建）
  messageId: string;
  messageRole: 'user' | 'assistant';
  timestamp: number;
}

// 将消息内容和操作按时间顺序混合
const getMessageDisplayItems = (message: ChatMessage): MessageDisplayItem[] => {
  const items: MessageDisplayItem[] = [];

  // 如果没有操作，直接返回内容
  if (!message.actions || message.actions.length === 0) {
    if (message.content) {
      items.push({
        type: 'content',
        content: message.content,
        messageId: message.id,
        messageRole: message.role,
        timestamp: message.timestamp,
      });
    }
    return items;
  }

  // 按时间戳排序操作，同时保留原始索引用于相同时间戳时的排序
  const actionsWithIndex = message.actions.map((action, index) => ({ action, index }));
  const sortedActions = actionsWithIndex.sort((a, b) => {
    // 首先按时间戳排序
    if (a.action.timestamp !== b.action.timestamp) {
      return a.action.timestamp - b.action.timestamp;
    }
    // 如果时间戳相同，按原始索引排序（保持操作添加的顺序）
    return a.index - b.index;
  });

  // 分组处理 todo 创建操作：将连续创建的 todo（相邻时间戳相差小于时间窗口）合并为一个显示项
  const TODO_GROUP_TIME_WINDOW = 5000; // 5 秒时间窗口（更宽松，以捕获 AI 连续创建的 todo）
  let i = 0;
  while (i < sortedActions.length) {
    const currentAction = sortedActions[i]?.action;
    if (!currentAction) {
      i++;
      continue;
    }

    // 检查是否是 todo 创建操作
    if (currentAction.entity === 'todo' && currentAction.type === 'create') {
      // 收集连续的 todo 创建操作
      const todoGroup: MessageAction[] = [currentAction];
      let j = i + 1;
      let lastAddedTimestamp = currentAction.timestamp; // 追踪最后添加的 todo 的时间戳

      // 查找时间戳相近的后续 todo 创建操作
      while (j < sortedActions.length) {
        const nextAction = sortedActions[j]?.action;
        if (!nextAction) {
          j++;
          continue;
        }
        // 比较与上一个 todo 的时间差，而不是与第一个 todo 的时间差
        // 这样可以正确捕获连续创建的 todo（如 0ms, 800ms, 1600ms 都能被分组）
        const timeDiff = nextAction.timestamp - lastAddedTimestamp;

        // 如果下一个操作也是 todo 创建，且时间戳相差小于时间窗口，则加入分组
        if (
          nextAction.entity === 'todo' &&
          nextAction.type === 'create' &&
          timeDiff < TODO_GROUP_TIME_WINDOW
        ) {
          todoGroup.push(nextAction);
          lastAddedTimestamp = nextAction.timestamp; // 更新最后添加的时间戳
          j++;
        } else {
          break;
        }
      }

      // 如果只有一个 todo，正常显示；如果有多个，使用分组显示
      const firstTodo = todoGroup[0];
      if (!firstTodo) {
        i++;
        continue;
      }

      if (todoGroup.length === 1) {
        items.push({
          type: 'action',
          action: firstTodo,
          messageId: message.id,
          messageRole: message.role,
          timestamp: firstTodo.timestamp,
        });
      } else {
        // 创建分组操作项，使用第一个操作的时间戳
        items.push({
          type: 'grouped_action',
          groupedActions: todoGroup,
          messageId: message.id,
          messageRole: message.role,
          timestamp: firstTodo.timestamp,
        });
      }

      i = j; // 跳过已处理的操作
    } else {
      // 非 todo 创建操作，正常添加
      items.push({
        type: 'action',
        action: currentAction,
        messageId: message.id,
        messageRole: message.role,
        timestamp: currentAction.timestamp,
      });
      i++;
    }
  }

  // 添加内容（如果有），确保内容始终显示在所有工具调用之后
  if (message.content) {
    // 找到所有操作中的最大时间戳，确保内容的时间戳在所有操作之后
    const maxActionTimestamp =
      sortedActions.length > 0
        ? Math.max(...sortedActions.map((a) => a.action.timestamp))
        : message.timestamp;
    // 使用最大操作时间戳 + 1，确保内容始终在工具调用之后显示
    const contentTimestamp = maxActionTimestamp + 1;

    items.push({
      type: 'content',
      content: message.content,
      messageId: message.id,
      messageRole: message.role,
      timestamp: contentTimestamp,
    });
  }

  // 按时间戳排序，相同时间戳时使用更精确的排序策略
  // 为了更准确地反映实际执行顺序，我们需要考虑操作的执行时间
  // 操作是在流式输出过程中添加的，所以操作的 timestamp 应该反映其实际执行时间
  return items.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    // 如果时间戳相同，需要更精确的排序：
    // 1. 如果都是操作，保持它们在数组中的顺序（已通过 sortedActions 保证）
    // 2. 如果一个是内容一个是操作，根据操作的实际执行时间来判断
    //    由于操作是在流式输出过程中添加的，如果时间戳相同（可能是精度问题），
    //    我们应该将操作放在内容之后，因为操作发生在消息开始输出之后
    if (a.type === 'action' && b.type === 'action') {
      // 都是操作，保持它们在 sortedActions 中的顺序
      // 由于我们已经按索引排序，这里不需要额外处理
      return 0;
    }
    // 处理内容和操作混合的情况
    // 由于内容的时间戳已经设置为所有操作的最大时间戳 + 1，正常情况下内容应该在所有操作之后
    // 但为了处理可能的边界情况，如果时间戳相同，确保内容始终在操作之后
    if (a.type === 'content' && b.type === 'action') {
      // a 是内容，b 是操作
      // 内容应该始终在操作之后显示
      return 1;
    }
    if (a.type === 'action' && b.type === 'content') {
      // a 是操作，b 是内容
      // 操作应该始终在内容之前显示
      return -1;
    }
    return 0;
  });
};
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative overflow-hidden"
    :style="{ width: `${ui.rightPanelWidth}px` }"
  >
    <!-- Resize handle -->
    <div
      ref="resizeHandleRef"
      class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors z-30"
      :class="{
        'bg-primary-500/50': isResizing,
        'bg-primary-500/20 hover:bg-primary-500/40': !isResizing,
      }"
      @mousedown="handleResizeStart"
    />
    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-luna-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Header with new chat button -->
    <div
      class="shrink-0 px-4 pt-6 pb-4 relative z-10 flex items-center justify-between border-b border-white/10"
    >
      <h2 class="text-sm font-semibold text-moon-100 uppercase tracking-wide">AI 助手</h2>
      <div class="flex items-center gap-2">
        <Button
          v-if="messages.length > 0"
          aria-label="清空聊天"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-trash"
          size="small"
          @click="clearChat"
        />
        <Button
          v-if="chatSessionsStore.allSessions.length > 1"
          id="session-list-button"
          aria-label="会话列表"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-history"
          size="small"
          @click="toggleSessionListPopover"
        />
        <Button
          aria-label="新聊天"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-comments"
          size="small"
          @click="createNewSession"
        />
      </div>
    </div>

    <!-- Session List Popover -->
    <Popover
      ref="sessionListPopoverRef"
      target="#session-list-button"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 20rem; max-width: 90vw"
      class="session-list-popover"
      @hide="hideSessionListPopover"
    >
      <div class="session-list-popover-content">
        <div class="popover-header">
          <span class="popover-title">最近会话</span>
          <span
            v-if="recentSessions.length > 0"
            class="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
          >
            {{ recentSessions.length }}
          </span>
        </div>
        <div v-if="recentSessions.length === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
          暂无其他会话
        </div>
        <div v-else class="popover-sessions-list">
          <button
            v-for="session in recentSessions"
            :key="session.id"
            class="session-item"
            :class="{
              'session-item-active': session.id === chatSessionsStore.currentSessionId,
            }"
            @click="switchToSession(session.id)"
          >
            <div class="session-item-header">
              <span class="session-item-title" :title="session.title">
                {{ session.title }}
              </span>
              <span class="session-item-time">
                {{ formatSessionTime(session.updatedAt) }}
              </span>
            </div>
            <div v-if="session.messages.length > 0" class="session-item-meta">
              <span class="text-xs text-moon-60">
                {{ session.messages.length }} 条消息
              </span>
            </div>
          </button>
        </div>
      </div>
    </Popover>

    <!-- Context info -->
    <div
      v-if="contextInfo !== '无上下文'"
      class="shrink-0 px-4 py-2 relative z-10 border-b border-white/10"
    >
      <p class="text-xs text-moon-50">{{ contextInfo }}</p>
    </div>

    <!-- Todo List Section -->
    <div class="shrink-0 relative z-10 border-b border-white/10">
      <button
        class="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
        @click="showTodoList = !showTodoList"
      >
        <div class="flex items-center gap-2">
          <i class="pi pi-list text-sm text-moon-70"></i>
          <span class="text-xs font-medium text-moon-100">待办事项</span>
          <span
            v-if="todos.filter((t) => !t.completed).length > 0"
            class="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
          >
            {{ todos.filter((t) => !t.completed).length }}
          </span>
        </div>
        <i
          class="pi text-xs text-moon-70 transition-transform"
          :class="showTodoList ? 'pi-chevron-down' : 'pi-chevron-right'"
        ></i>
      </button>
      <div v-if="showTodoList" class="max-h-64 overflow-y-auto border-t border-white/10 bg-white/3">
        <div v-if="todos.length === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
          暂无待办事项
        </div>
        <div v-else class="px-4 py-2 space-y-1">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
            :class="{ 'opacity-60': todo.completed }"
          >
            <i
              class="pi mt-0.5 text-xs flex-shrink-0"
              :class="todo.completed ? 'pi-check-circle text-green-400' : 'pi-circle text-moon-50'"
            ></i>
            <span
              class="text-xs text-moon-80 flex-1 break-words"
              :class="{ 'line-through': todo.completed }"
            >
              {{ todo.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-2 min-h-0 min-w-0 relative z-10 messages-container"
    >
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-center"
      >
        <i class="pi pi-comments text-4xl text-moon-40 mb-4" />
        <p class="text-sm text-moon-60 mb-2">开始与 AI 助手对话</p>
        <p class="text-xs text-moon-40">助手可以帮你管理术语、角色设定，并提供翻译建议</p>
      </div>
      <div v-else class="flex flex-col gap-4 w-full">
        <template v-for="message in messages" :key="message.id">
          <!-- 过滤掉总结响应消息（包含完整总结内容的消息） -->
          <template v-if="!message.isSummaryResponse">
            <div
              class="flex flex-col gap-2 w-full"
              :class="message.role === 'user' ? 'items-end' : 'items-start'"
            >
              <!-- 思考过程显示（仅在助手消息且有思考内容时显示） -->
              <div
                v-if="
                  message.role === 'assistant' &&
                  message.thinkingProcess &&
                  message.thinkingProcess.trim()
                "
                class="rounded-lg px-3 py-2 max-w-[85%] min-w-0 bg-white/3 border border-white/10"
              >
                <button
                  class="w-full text-left flex items-center gap-2 text-xs text-moon-70 hover:text-moon-90 transition-colors"
                  @click="toggleThinking(message.id)"
                >
                  <i
                    class="text-xs transition-transform"
                    :class="
                      thinkingExpanded.get(message.id)
                        ? 'pi pi-chevron-down'
                        : 'pi pi-chevron-right'
                    "
                  />
                  <span class="font-medium">思考过程</span>
                  <i
                    v-if="thinkingActive.get(message.id)"
                    class="pi pi-spin pi-spinner text-xs ml-auto"
                  />
                </button>
                <div
                  v-if="thinkingExpanded.get(message.id)"
                  :ref="(el) => setThinkingContentRef(message.id, el as HTMLElement)"
                  class="mt-2 text-xs text-moon-60 whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-96 overflow-y-auto thinking-content"
                  :data-message-id="message.id"
                >
                  {{ message.thinkingProcess }}
                </div>
                <div
                  v-else
                  class="mt-2 text-xs text-moon-60 whitespace-pre-wrap break-words overflow-wrap-anywhere opacity-70"
                  style="
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                  "
                >
                  {{ getThinkingPreview(message.thinkingProcess) }}
                </div>
              </div>
              <template
                v-for="(item, itemIdx) in getMessageDisplayItems(message)"
                :key="`${message.id}-${itemIdx}-${item.timestamp}`"
              >
                <div
                  v-if="item.type === 'content' && item.content"
                  class="rounded-lg px-3 py-2 max-w-[85%] min-w-0 w-full"
                  :class="
                    item.messageRole === 'user'
                      ? 'bg-primary-500/20 text-primary-100'
                      : 'bg-white/5 text-moon-90'
                  "
                >
                  <div
                    class="text-sm break-words overflow-wrap-anywhere markdown-content w-full min-w-0"
                    v-html="renderMarkdown(item.content)"
                  ></div>
                </div>
                <div
                  v-else-if="item.type === 'grouped_action' && item.groupedActions"
                  class="max-w-[85%] min-w-0"
                >
                  <div class="flex flex-wrap gap-1.5">
                    <div
                      :id="`grouped-action-${item.messageId}-${item.timestamp}`"
                      class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35"
                      @mouseenter="
                        (e) =>
                          toggleGroupedActionPopover(
                            e,
                            item.groupedActions!,
                            message,
                            item.timestamp,
                          )
                      "
                      @mouseleave="() => handleGroupedActionMouseLeave(item.timestamp)"
                    >
                      <i class="text-sm pi pi-list" />
                      <span> 创建 {{ item.groupedActions.length }} 个待办事项 </span>
                    </div>
                    <!-- Grouped Action Details Popover -->
                    <Popover
                      :ref="
                        (el) => {
                          const actionKey = `grouped-${item.messageId}-${item.timestamp}`;
                          if (el) {
                            groupedActionPopoverRefs.set(
                              actionKey,
                              el as unknown as InstanceType<typeof Popover>,
                            );
                          }
                        }
                      "
                      :target="`grouped-action-${item.messageId}-${item.timestamp}`"
                      :dismissable="true"
                      :show-close-icon="false"
                      style="width: 18rem; max-width: 90vw"
                      class="action-popover"
                      @hide="handleGroupedActionPopoverHide"
                    >
                      <div
                        v-if="
                          hoveredGroupedAction &&
                          hoveredGroupedAction.timestamp === item.timestamp &&
                          hoveredGroupedAction.message.id === item.messageId
                        "
                        class="action-popover-content"
                      >
                        <div class="popover-header">
                          <span class="popover-title"
                            >创建 {{ item.groupedActions.length }} 个待办事项</span
                          >
                        </div>
                        <div class="popover-details">
                          <div
                            v-for="(todoAction, todoIdx) in item.groupedActions"
                            :key="todoIdx"
                            class="popover-detail-item"
                          >
                            <span class="popover-detail-label">{{ todoIdx + 1 }}.</span>
                            <span class="popover-detail-value">{{
                              todoAction.name || '待办事项'
                            }}</span>
                          </div>
                        </div>
                      </div>
                    </Popover>
                  </div>
                </div>
                <div v-else-if="item.type === 'action' && item.action" class="max-w-[85%] min-w-0">
                  <div class="flex flex-wrap gap-1.5">
                    <div
                      :id="`action-${item.messageId}-${item.action.timestamp}`"
                      class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help"
                      :class="{
                        'bg-green-500/25 text-green-200 border border-green-500/40 hover:bg-green-500/35':
                          item.action.type === 'create',
                        'bg-blue-500/25 text-blue-200 border border-blue-500/40 hover:bg-blue-500/35':
                          item.action.type === 'update',
                        'bg-red-500/25 text-red-200 border border-red-500/40 hover:bg-red-500/35':
                          item.action.type === 'delete',
                        'bg-purple-500/25 text-purple-200 border border-purple-500/40 hover:bg-purple-500/35':
                          item.action.type === 'web_search',
                        'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/35':
                          item.action.type === 'web_fetch',
                        'bg-yellow-500/25 text-yellow-200 border border-yellow-500/40 hover:bg-yellow-500/35':
                          item.action.type === 'read',
                        'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/35':
                          item.action.type === 'navigate',
                        'bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35':
                          item.action.entity === 'todo',
                      }"
                      @mouseenter="(e) => toggleActionPopover(e, item.action!, message)"
                      @mouseleave="() => handleActionMouseLeave(item.action!, message)"
                    >
                      <i
                        class="text-sm"
                        :class="{
                          'pi pi-plus-circle': item.action.type === 'create',
                          'pi pi-pencil': item.action.type === 'update',
                          'pi pi-trash': item.action.type === 'delete',
                          'pi pi-search': item.action.type === 'web_search',
                          'pi pi-link': item.action.type === 'web_fetch',
                          'pi pi-eye': item.action.type === 'read',
                          'pi pi-arrow-right': item.action.type === 'navigate',
                          'pi pi-list': item.action.entity === 'todo',
                        }"
                      />
                      <span>
                        {{
                          item.action.type === 'create'
                            ? '创建'
                            : item.action.type === 'update'
                              ? '更新'
                              : item.action.type === 'delete'
                                ? '删除'
                                : item.action.type === 'web_search'
                                  ? '网络搜索'
                                  : item.action.type === 'web_fetch'
                                    ? '网页获取'
                                    : item.action.type === 'read'
                                      ? '读取'
                                      : item.action.type === 'navigate'
                                        ? '导航'
                                        : ''
                        }}
                        {{
                          item.action.entity === 'term'
                            ? '术语'
                            : item.action.entity === 'character'
                              ? '角色'
                              : item.action.entity === 'web'
                                ? '网络'
                                : item.action.entity === 'translation'
                                  ? '翻译'
                                  : item.action.entity === 'chapter'
                                    ? '章节'
                                    : item.action.entity === 'paragraph'
                                      ? '段落'
                                      : item.action.entity === 'book'
                                        ? '书籍'
                                        : item.action.entity === 'memory'
                                          ? '记忆'
                                          : item.action.entity === 'todo'
                                            ? '待办事项'
                                            : ''
                        }}
                        <span
                          v-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'get_term' &&
                            item.action.name
                          "
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.name }}"
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'get_paragraph_info' &&
                            item.action.chapter_title
                          "
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.chapter_title }}"
                          <span v-if="item.action.paragraph_id" class="opacity-70 ml-1"
                            >段落 ({{ item.action.paragraph_id.substring(0, 8) }})</span
                          >
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            (item.action.tool_name === 'get_previous_paragraphs' ||
                              item.action.tool_name === 'get_next_paragraphs') &&
                            item.action.paragraph_id
                          "
                          class="font-semibold text-xs"
                        >
                          {{
                            item.action.tool_name === 'get_previous_paragraphs' ? '前' : '后'
                          }}段落 ({{ item.action.paragraph_id.substring(0, 8) }})
                        </span>
                        <span v-else-if="item.action.query" class="font-semibold"
                          >"{{ item.action.query }}"</span
                        >
                        <span v-else-if="item.action.url" class="font-semibold text-xs">{{
                          item.action.url
                        }}</span>
                        <span
                          v-else-if="
                            item.action.entity === 'translation' &&
                            item.action.tool_name === 'batch_replace_translations'
                          "
                          class="font-semibold text-xs"
                        >
                          批量替换
                          {{
                            (item.action as MessageActionWithAllProperties)
                              .replaced_paragraph_count ?? 0
                          }}
                          个段落（共
                          {{
                            (item.action as MessageActionWithAllProperties)
                              .replaced_translation_count ?? 0
                          }}
                          个翻译版本）
                        </span>
                        <span
                          v-else-if="
                            item.action.entity === 'translation' &&
                            item.action.paragraph_id &&
                            (item.action as MessageActionWithAllProperties).old_translation &&
                            (item.action as MessageActionWithAllProperties).new_translation
                          "
                          class="font-semibold text-xs"
                        >
                          段落翻译更新
                          <span v-if="item.action.paragraph_id" class="opacity-70 ml-1"
                            >({{ item.action.paragraph_id.substring(0, 8) }})</span
                          >
                          <span class="opacity-70 ml-1">
                            |
                            {{
                              (
                                item.action as MessageActionWithAllProperties
                              ).old_translation?.substring(0, 20) ?? ''
                            }}{{
                              ((item.action as MessageActionWithAllProperties).old_translation
                                ?.length ?? 0) > 20
                                ? '...'
                                : ''
                            }}
                            →
                            {{
                              (
                                item.action as MessageActionWithAllProperties
                              ).new_translation?.substring(0, 20) ?? ''
                            }}{{
                              ((item.action as MessageActionWithAllProperties).new_translation
                                ?.length ?? 0) > 20
                                ? '...'
                                : ''
                            }}
                          </span>
                        </span>
                        <span
                          v-else-if="
                            item.action.entity === 'translation' && item.action.paragraph_id
                          "
                          class="font-semibold text-xs"
                        >
                          段落翻译
                          <span v-if="item.action.paragraph_id" class="opacity-70 ml-1"
                            >({{ item.action.paragraph_id.substring(0, 8) }})</span
                          >
                        </span>
                        <span v-else-if="item.action.name" class="font-semibold"
                          >"{{ item.action.name }}"</span
                        >
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'get_book_info' &&
                            item.action.book_id
                          "
                          class="font-semibold text-xs"
                        >
                          书籍信息
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'get_memory' &&
                            item.action.memory_id
                          "
                          class="font-semibold text-xs"
                        >
                          Memory ({{ item.action.memory_id.substring(0, 8) }})
                        </span>
                        <span
                          v-else-if="item.action.type === 'read' && item.action.chapter_title"
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.chapter_title }}"
                        </span>
                        <span
                          v-else-if="item.action.type === 'read' && item.action.character_name"
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.character_name }}"
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'find_paragraph_by_keywords'
                          "
                          class="font-semibold text-xs"
                        >
                          关键词搜索
                          <span
                            v-if="item.action.keywords && item.action.keywords.length > 0"
                            class="opacity-70 ml-1"
                          >
                            原文: {{ item.action.keywords.join('、') }}
                          </span>
                          <span
                            v-if="
                              (item.action as MessageActionWithAllProperties)
                                .translation_keywords &&
                              ((item.action as MessageActionWithAllProperties).translation_keywords
                                ?.length ?? 0) > 0
                            "
                            class="opacity-70 ml-1"
                          >
                            翻译:
                            {{
                              (
                                item.action as MessageActionWithAllProperties
                              ).translation_keywords?.join('、') ?? ''
                            }}
                          </span>
                          <span v-if="item.action.chapter_id" class="opacity-70 ml-1">
                            | 章节:
                            {{
                              getChapterTitleForAction(item.action.chapter_id) ||
                              item.action.chapter_id.substring(0, 8)
                            }}
                          </span>
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.tool_name === 'search_paragraphs_by_regex' &&
                            item.action.regex_pattern
                          "
                          class="font-semibold text-xs"
                        >
                          正则:
                          {{
                            item.action.regex_pattern.length > 30
                              ? item.action.regex_pattern.substring(0, 30) + '...'
                              : item.action.regex_pattern
                          }}
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.entity === 'term' &&
                            item.action.tool_name === 'get_occurrences_by_keywords' &&
                            item.action.keywords &&
                            item.action.keywords.length > 0
                          "
                          class="font-semibold text-xs"
                        >
                          关键词: {{ item.action.keywords.join('、') }}
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.entity === 'character' &&
                            item.action.tool_name === 'search_characters_by_keywords' &&
                            item.action.keywords &&
                            item.action.keywords.length > 0
                          "
                          class="font-semibold text-xs"
                        >
                          搜索角色
                          <span class="opacity-70 ml-1">
                            关键词: {{ item.action.keywords.join('、') }}
                          </span>
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.entity === 'term' &&
                            item.action.tool_name === 'search_terms_by_keywords' &&
                            item.action.keywords &&
                            item.action.keywords.length > 0
                          "
                          class="font-semibold text-xs"
                        >
                          搜索术语
                          <span class="opacity-70 ml-1">
                            关键词: {{ item.action.keywords.join('、') }}
                          </span>
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.entity === 'memory' &&
                            item.action.tool_name === 'search_memory_by_keywords' &&
                            item.action.keywords &&
                            item.action.keywords.length > 0
                          "
                          class="font-semibold text-xs"
                        >
                          搜索记忆
                          <span class="opacity-70 ml-1">
                            关键词: {{ item.action.keywords.join('、') }}
                          </span>
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'read' &&
                            item.action.keywords &&
                            item.action.keywords.length > 0
                          "
                          class="font-semibold text-xs"
                        >
                          关键词: {{ item.action.keywords.join('、') }}
                        </span>
                        <span
                          v-else-if="item.action.type === 'read' && item.action.regex_pattern"
                          class="font-semibold text-xs"
                        >
                          正则:
                          {{
                            item.action.regex_pattern.length > 30
                              ? item.action.regex_pattern.substring(0, 30) + '...'
                              : item.action.regex_pattern
                          }}
                        </span>
                        <span
                          v-else-if="item.action.type === 'read' && item.action.tool_name"
                          class="font-semibold text-xs"
                        >
                          {{ item.action.tool_name }}
                        </span>
                        <span
                          v-else-if="item.action.entity === 'memory' && item.action.memory_id"
                          class="font-semibold text-xs"
                        >
                          Memory ID: {{ item.action.memory_id }}
                        </span>
                        <span
                          v-else-if="item.action.entity === 'memory' && item.action.keyword"
                          class="font-semibold text-xs"
                        >
                          搜索: "{{ item.action.keyword }}"
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'update' &&
                            item.action.entity === 'chapter' &&
                            item.action.tool_name === 'update_chapter_title' &&
                            (item.action as MessageActionWithAllProperties).old_title &&
                            (item.action as MessageActionWithAllProperties).new_title
                          "
                          class="font-semibold text-xs"
                        >
                          "{{ (item.action as MessageActionWithAllProperties).old_title }}" → "{{
                            (item.action as MessageActionWithAllProperties).new_title
                          }}"
                        </span>
                        <span
                          v-else-if="
                            item.action.type === 'update' &&
                            item.action.entity === 'chapter' &&
                            (item.action as MessageActionWithAllProperties).new_title
                          "
                          class="font-semibold text-xs"
                        >
                          "{{ (item.action as MessageActionWithAllProperties).new_title }}"
                        </span>
                        <span
                          v-else-if="item.action.type === 'navigate' && item.action.chapter_title"
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.chapter_title }}"
                          <span v-if="item.action.paragraph_id" class="opacity-70 ml-1">段落</span>
                        </span>
                        <span
                          v-else-if="item.action.type === 'navigate' && item.action.paragraph_id"
                          class="font-semibold text-xs"
                        >
                          段落 ({{ item.action.paragraph_id.substring(0, 8) }})
                        </span>
                      </span>
                    </div>
                    <!-- Action Details Popover -->
                    <Popover
                      :ref="
                        (el) => {
                          const actionKey = `${item.messageId}-${item.action!.timestamp}`;
                          if (el) {
                            actionPopoverRefs.set(
                              actionKey,
                              el as unknown as InstanceType<typeof Popover>,
                            );
                          }
                        }
                      "
                      :target="`action-${item.messageId}-${item.action!.timestamp}`"
                      :dismissable="true"
                      :show-close-icon="false"
                      style="width: 18rem; max-width: 90vw"
                      class="action-popover"
                      @hide="handleActionPopoverHide"
                    >
                      <div
                        v-if="
                          hoveredAction &&
                          hoveredAction.action.timestamp === item.action!.timestamp &&
                          hoveredAction.message.id === item.messageId
                        "
                        class="action-popover-content"
                      >
                        <div class="popover-header">
                          <span class="popover-title">
                            {{
                              item.action.type === 'create'
                                ? '创建'
                                : item.action.type === 'update'
                                  ? '更新'
                                  : item.action.type === 'delete'
                                    ? '删除'
                                    : item.action.type === 'web_search'
                                      ? '网络搜索'
                                      : item.action.type === 'web_fetch'
                                        ? '网页获取'
                                        : item.action.type === 'read'
                                          ? '读取'
                                          : item.action.type === 'navigate'
                                            ? '导航'
                                            : ''
                            }}
                            {{
                              item.action.entity === 'term'
                                ? '术语'
                                : item.action.entity === 'character'
                                  ? '角色'
                                  : item.action.entity === 'web'
                                    ? '网络'
                                    : item.action.entity === 'translation'
                                      ? '翻译'
                                      : item.action.entity === 'chapter'
                                        ? '章节'
                                        : item.action.entity === 'paragraph'
                                          ? '段落'
                                          : item.action.entity === 'book'
                                            ? '书籍'
                                            : item.action.entity === 'memory'
                                              ? '记忆'
                                              : item.action.entity === 'todo'
                                                ? '待办事项'
                                                : ''
                            }}
                          </span>
                        </div>
                        <div class="popover-details">
                          <div
                            v-for="(detail, detailIdx) in getActionDetailsWithContext(item.action)"
                            :key="detailIdx"
                            class="popover-detail-item"
                          >
                            <span class="popover-detail-label">{{ detail.label }}：</span>
                            <span class="popover-detail-value">{{ detail.value }}</span>
                          </div>
                        </div>
                      </div>
                    </Popover>
                  </div>
                </div>
                <span
                  v-if="itemIdx === getMessageDisplayItems(message).length - 1"
                  class="text-xs text-moon-40"
                >
                  {{
                    new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }}
                </span>
              </template>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Input area -->
    <div class="shrink-0 px-4 py-3 border-t border-white/10 relative z-10 bg-night-950/50 min-w-0">
      <div class="flex flex-col gap-2 w-full min-w-0">
        <Textarea
          ref="inputRef"
          v-model="inputMessage"
          :disabled="isSending || !assistantModel"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          class="w-full resize-none min-w-0"
          :auto-resize="true"
          rows="3"
          @keydown="handleKeydown"
        />
        <div class="flex items-center justify-between">
          <span v-if="!assistantModel" class="text-xs text-moon-50">未配置助手模型</span>
          <span v-else class="text-xs text-moon-50">{{
            assistantModel.name || assistantModel.id
          }}</span>
          <div class="flex items-center gap-2">
            <Button
              :disabled="!inputMessage.trim() || isSending || !assistantModel"
              label="发送"
              icon="pi pi-send"
              size="small"
              @click="sendMessage"
            />
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Resize handle styles */
.resize-handle {
  user-select: none;
  -webkit-user-select: none;
}

/* 消息容器样式 - 防止水平滚动 */
.messages-container {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 确保所有文本元素都能正确换行 */
.messages-container p {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

/* 消息气泡容器 */
.messages-container > div {
  width: 100%;
  min-width: 0;
}

/* 自定义滚动条样式 */
:deep(.p-textarea) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  max-height: 200px !important;
  overflow-y: auto !important;
}

:deep(.p-textarea:focus) {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.2rem rgba(var(--primary-rgb), 0.1);
}

:deep(.p-textarea::placeholder) {
  color: var(--moon-opacity-50);
}

/* 限制 textarea 最大高度，防止布局被破坏 */
:deep(.p-textarea textarea) {
  max-height: 200px !important;
  overflow-y: auto !important;
}

/* 消息容器滚动条 */
.messages-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

/* Markdown 内容样式 */
.markdown-content {
  line-height: 1.6;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: inherit;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.125em 0.25em;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
  display: inline-block;
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.75em;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.75em 0;
  max-width: 100%;
  width: 100%;
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
  max-width: 100%;
  display: block;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.75em 0;
  padding-left: 1.5em;
  max-width: 100%;
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.markdown-content :deep(ul:first-child),
.markdown-content :deep(ol:first-child) {
  margin-top: 0;
}

.markdown-content :deep(ul:last-child),
.markdown-content :deep(ol:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(li) {
  margin: 0.4em 0;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(li:first-child) {
  margin-top: 0;
}

.markdown-content :deep(li:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 1em;
  margin: 0.75em 0;
  opacity: 0.8;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(table) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border-collapse: collapse;
  word-wrap: break-word;
  overflow-wrap: break-word;
  table-layout: fixed;
}

.markdown-content :deep(table td),
.markdown-content :deep(table th) {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(a) {
  color: var(--primary-400);
  text-decoration: underline;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
}

.markdown-content :deep(a:hover) {
  color: var(--primary-300);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-weight: 600;
  margin: 0.75em 0 0.5em 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child),
.markdown-content :deep(h4:first-child),
.markdown-content :deep(h5:first-child),
.markdown-content :deep(h6:first-child) {
  margin-top: 0;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 1em 0;
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Action Popover 样式 */
:deep(.action-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.action-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.popover-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.popover-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}

.popover-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.popover-detail-label {
  color: var(--moon-opacity-70);
  font-weight: 500;
}

.popover-detail-value {
  color: var(--moon-opacity-90);
  word-break: break-word;
  line-height: 1.5;
}

/* Session List Popover 样式 */
:deep(.session-list-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.session-list-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 20rem;
  overflow-y: auto;
}

.session-list-popover-content .popover-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.session-list-popover-content .popover-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}

.popover-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.session-item {
  width: 100%;
  text-align: left;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.session-item-active {
  background: rgba(var(--primary-rgb), 0.2);
  border-color: rgba(var(--primary-rgb), 0.4);
}

.session-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.session-item-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item-active .session-item-title {
  color: var(--moon-opacity-100);
  font-weight: 600;
}

.session-item-time {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  flex-shrink: 0;
}

.session-item-meta {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}
</style>
