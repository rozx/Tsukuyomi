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
import { MemoryService } from 'src/services/memory-service';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import type { CharacterSetting, Alias, Terminology, Translation } from 'src/models/novel';
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

// 待办事项列表
const todos = ref<TodoItem[]>([]);
const showTodoList = ref(false);

// 加载待办事项列表
const loadTodos = () => {
  todos.value = TodoListService.getAllTodos();
};

// 监听待办事项变化（通过 localStorage 事件）
const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'luna-ai-todo-list') {
    loadTodos();
  }
};

// Popover refs for action details
const actionPopoverRefs = ref<Map<string, InstanceType<typeof Popover> | null>>(new Map());
const hoveredAction = ref<{ action: MessageAction; message: ChatMessage } | null>(null);

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
  const willExceedLimit = messages.value.length + 1 >= MESSAGE_LIMIT_THRESHOLD;
  const willReachLimit = messages.value.length + 1 >= MAX_MESSAGES_PER_SESSION;

  if (willReachLimit) {
    toast.add({
      severity: 'warn',
      summary: '会话消息数已达上限',
      detail: '请先总结当前会话或创建新会话',
      life: 3000,
    });
    return;
  }

  // 如果接近限制，自动总结并重置
  let summarySucceeded = true;
  if (willExceedLimit && messages.value.length > 0) {
    try {
      isSending.value = true;
      isSummarizing.value = true;
      // 不显示总结开始的 toast，静默进行

      // 创建总结消息气泡
      const summarizationMessageId = (Date.now() - 1).toString();
      const summarizationMessage: ChatMessage = {
        id: summarizationMessageId,
        role: 'assistant',
        content: '正在总结聊天会话...',
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
            content: '✓ 聊天会话总结完成',
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

      // 创建记忆（如果有 bookId）
      const context = contextStore.getContext;
      if (context.currentBookId && summary) {
        try {
          const memorySummary = summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
          await MemoryService.createMemory(
            context.currentBookId,
            summary,
            `会话摘要：${memorySummary}`,
          );
        } catch (error) {
          console.error('Failed to create memory for session summary:', error);
          // 不抛出错误，记忆创建失败不应该影响摘要流程
        }
      }

      // 更新本地消息列表（使用标记避免触发 watch）
      isUpdatingFromStore = true;
      const session = chatSessionsStore.currentSession;
      if (session) {
        messages.value = [...session.messages];
      }
      // 使用 nextTick 确保在下一个 tick 重置标记
      await nextTick();
      isUpdatingFromStore = false;

      // 不显示总结成功的 toast，静默完成
      isSummarizing.value = false;
    } catch (error) {
      console.error('Failed to summarize session:', error);
      summarySucceeded = false;
      isSummarizing.value = false;
      toast.add({
        severity: 'error',
        summary: '总结失败',
        detail: error instanceof Error ? error.message : '未知错误',
        life: 5000,
      });

      // 总结失败时，再次检查是否达到限制
      const currentMessageCount = messages.value.length + 1;
      if (currentMessageCount >= MAX_MESSAGES_PER_SESSION) {
        toast.add({
          severity: 'warn',
          summary: '无法发送消息',
          detail: '会话消息数已达上限，且自动总结失败。请手动创建新会话或清空当前会话。',
          life: 5000,
        });
        isSending.value = false;
        return; // 阻止发送消息
      }
    } finally {
      if (summarySucceeded) {
        isSending.value = false;
      }
      // 确保摘要状态被重置
      isSummarizing.value = false;
      // 如果总结失败且未达到上限，继续发送消息
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
    // 将 store 中的消息转换为 AI ChatMessage 格式（用于连续对话）
    const messageHistory: AIChatMessage[] | undefined = currentSession?.messages
      ? currentSession.messages
          .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }))
      : undefined;

    // 用于跟踪摘要消息 ID（如果摘要在服务内部触发）
    let internalSummarizationMessageId: string | null = null;
    // 标记是否正在摘要（用于阻止 onChunk 更新助手消息）
    let isSummarizingInternally = false;

    // 调用 AssistantService（内部会创建任务并获取 abortController signal）
    const result = await AssistantService.chat(assistantModel.value, message, {
      ...(sessionSummary ? { sessionSummary } : {}),
      ...(messageHistory ? { messageHistory } : {}),
      onSummarizingStart: () => {
        // 当服务内部开始摘要时，创建摘要气泡
        isSummarizingInternally = true;

        // 立即移除占位符助手消息，防止显示 AI 响应内容
        const assistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageId);
        if (assistantMsgIndex >= 0) {
          messages.value.splice(assistantMsgIndex, 1);
        }

        internalSummarizationMessageId = (Date.now() - 1).toString();
        const summarizationMessage: ChatMessage = {
          id: internalSummarizationMessageId,
          role: 'assistant',
          content: '正在总结聊天会话...',
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
        const actionName = 'name' in action.data ? action.data.name : undefined;
        const messageAction: MessageAction = {
          type: action.type,
          entity: action.entity,
          ...(actionName ? { name: actionName } : {}),
          timestamp: Date.now(),
          // 网络操作相关信息
          ...(action.type === 'web_search' && 'query' in action.data
            ? { query: action.data.query }
            : {}),
          ...(action.type === 'web_fetch' && 'url' in action.data ? { url: action.data.url } : {}),
          // 翻译操作相关信息
          ...(action.entity === 'translation' &&
          'paragraph_id' in action.data &&
          'translation_id' in action.data
            ? {
                paragraph_id: action.data.paragraph_id,
                translation_id: action.data.translation_id,
              }
            : {}),
          // 读取操作相关信息
          ...(action.type === 'read' && 'chapter_id' in action.data
            ? { chapter_id: action.data.chapter_id }
            : {}),
          ...(action.type === 'read' && 'chapter_title' in action.data
            ? { chapter_title: action.data.chapter_title }
            : {}),
          ...(action.type === 'read' && 'paragraph_id' in action.data
            ? { paragraph_id: action.data.paragraph_id }
            : {}),
          ...(action.type === 'read' && 'character_name' in action.data
            ? { character_name: action.data.character_name }
            : {}),
          ...(action.type === 'read' && 'tool_name' in action.data
            ? { tool_name: action.data.tool_name }
            : {}),
          // Memory 相关信息
          ...(action.entity === 'memory' && 'memory_id' in action.data
            ? { memory_id: action.data.memory_id }
            : {}),
          ...(action.entity === 'memory' && 'keyword' in action.data
            ? { keyword: action.data.keyword }
            : {}),
          ...(action.entity === 'memory' && 'summary' in action.data
            ? { name: action.data.summary }
            : {}),
          // 待办事项操作相关信息
          ...(action.entity === 'todo' && 'text' in action.data
            ? { name: (action.data as TodoItem).text }
            : {}),
          // 导航操作相关信息
          ...(action.type === 'navigate' && 'book_id' in action.data
            ? { book_id: action.data.book_id }
            : {}),
          ...(action.type === 'navigate' && 'chapter_id' in action.data
            ? { chapter_id: action.data.chapter_id }
            : {}),
          ...(action.type === 'navigate' && 'chapter_title' in action.data
            ? { chapter_title: action.data.chapter_title }
            : {}),
          ...(action.type === 'navigate' && 'paragraph_id' in action.data
            ? { paragraph_id: action.data.paragraph_id }
            : {}),
        };

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
        // 创建新的助手消息
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
        scrollToBottom();

        // 显示操作通知
        const actionLabels: Record<ActionInfo['type'], string> = {
          create: '创建',
          update: '更新',
          delete: '删除',
          web_search: '网络搜索',
          web_fetch: '网页获取',
          read: '读取',
          navigate: '导航',
        };
        const entityLabels: Record<ActionInfo['entity'], string> = {
          term: '术语',
          character: '角色',
          web: '网络',
          translation: '翻译',
          chapter: '章节',
          paragraph: '段落',
          book: '书籍',
          memory: '记忆',
          todo: '待办事项',
        };

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

            // 出现次数
            if (character.occurrences && character.occurrences.length > 0) {
              const totalOccurrences = character.occurrences.reduce(
                (sum, occ) => sum + occ.count,
                0,
              );
              details.push(`出现：${totalOccurrences} 次`);
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
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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

            // 出现次数
            if (term.occurrences && term.occurrences.length > 0) {
              const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
              details.push(`出现：${totalOccurrences} 次`);
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
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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
            detail = `${entityLabels[action.entity]} "${action.data.name}" 已${actionLabels[action.type]}`;
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

          // 出现次数
          if (character.occurrences && character.occurrences.length > 0) {
            const totalOccurrences = character.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push(`出现：${totalOccurrences} 次`);
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
              summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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

          // 出现次数
          if (term.occurrences && term.occurrences.length > 0) {
            const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push(`出现：${totalOccurrences} 次`);
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
              summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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
                summary: `${actionLabels[action.type as ActionInfo['type']]}${entityLabels[action.entity as ActionInfo['entity']]}`,
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
                    await booksStore.updateBook(bookId, { volumes: book.volumes });
                  }
                },
              });
            } else {
              // 如果没有 previousData，仍然显示 toast（但不提供撤销）
              toast.add({
                severity: 'success',
                summary: `${actionLabels[action.type as ActionInfo['type']]}${entityLabels[action.entity as ActionInfo['entity']]}`,
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

            // 出现次数
            if (previousCharacter.occurrences && previousCharacter.occurrences.length > 0) {
              const totalOccurrences = previousCharacter.occurrences.reduce(
                (sum, occ) => sum + occ.count,
                0,
              );
              details.push(`出现：${totalOccurrences} 次`);
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
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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

            // 出现次数
            if (previousTerm.occurrences && previousTerm.occurrences.length > 0) {
              const totalOccurrences = previousTerm.occurrences.reduce(
                (sum, occ) => sum + occ.count,
                0,
              );
              details.push(`出现：${totalOccurrences} 次`);
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
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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
            detail = `${entityLabels[action.entity]} "${action.data.name}" 已${actionLabels[action.type]}`;
          }
        } else if (action.entity === 'memory') {
          // Memory 操作：不显示 toast（根据需求）
          // 只记录到 action info，不显示 toast 消息
        } else {
          // 默认消息
          detail = `${entityLabels[action.entity]}已${actionLabels[action.type]}`;
        }

        // 如果没有显示带 revert 的 toast，且不是 memory 操作，显示通用 toast
        if (!shouldShowRevertToast && action.entity !== 'memory') {
          toast.add({
            severity: 'success',
            summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
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
            messages.value[summarizationMsgIndex] = {
              id: existingMsg.id,
              role: existingMsg.role,
              content: '✓ 聊天会话总结完成（由于达到 token 限制，之前的对话历史已自动总结）',
              timestamp: existingMsg.timestamp,
              ...(existingMsg.isSummarization !== undefined && {
                isSummarization: existingMsg.isSummarization,
              }),
              ...(existingMsg.actions && { actions: existingMsg.actions }),
              ...(existingMsg.thinkingProcess && { thinkingProcess: existingMsg.thinkingProcess }),
            };
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
          content: '✓ 聊天会话总结完成（由于达到 token 限制，之前的对话历史已自动总结）',
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
      const updatedMessageHistory: AIChatMessage[] | undefined = updatedSession?.messages
        ? updatedSession.messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
            }))
        : undefined;

      // 创建新的助手消息用于继续对话
      assistantMessageId = (Date.now() + 1).toString();
      const newAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
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
            const actionName = 'name' in action.data ? action.data.name : undefined;
            const messageAction: MessageAction = {
              type: action.type,
              entity: action.entity,
              ...(actionName ? { name: actionName } : {}),
              timestamp: Date.now(),
              // 网络操作相关信息
              ...(action.type === 'web_search' && 'query' in action.data
                ? { query: action.data.query }
                : {}),
              ...(action.type === 'web_fetch' && 'url' in action.data
                ? { url: action.data.url }
                : {}),
              // 翻译操作相关信息
              ...(action.entity === 'translation' &&
              'paragraph_id' in action.data &&
              'translation_id' in action.data
                ? {
                    paragraph_id: action.data.paragraph_id,
                    translation_id: action.data.translation_id,
                  }
                : {}),
              // 读取操作相关信息
              ...(action.type === 'read' && 'chapter_id' in action.data
                ? { chapter_id: action.data.chapter_id }
                : {}),
              ...(action.type === 'read' && 'chapter_title' in action.data
                ? { chapter_title: action.data.chapter_title }
                : {}),
              ...(action.type === 'read' && 'paragraph_id' in action.data
                ? { paragraph_id: action.data.paragraph_id }
                : {}),
              ...(action.type === 'read' && 'character_name' in action.data
                ? { character_name: action.data.character_name }
                : {}),
              ...(action.type === 'read' && 'tool_name' in action.data
                ? { tool_name: action.data.tool_name }
                : {}),
              // Memory 相关信息
              ...(action.entity === 'memory' && 'memory_id' in action.data
                ? { memory_id: action.data.memory_id }
                : {}),
              ...(action.entity === 'memory' && 'keyword' in action.data
                ? { keyword: action.data.keyword }
                : {}),
              ...(action.entity === 'memory' && 'summary' in action.data
                ? { name: action.data.summary }
                : {}),
              // 导航操作相关信息
              ...(action.type === 'navigate' && 'book_id' in action.data
                ? { book_id: action.data.book_id }
                : {}),
              ...(action.type === 'navigate' && 'chapter_id' in action.data
                ? { chapter_id: action.data.chapter_id }
                : {}),
              ...(action.type === 'navigate' && 'chapter_title' in action.data
                ? { chapter_title: action.data.chapter_title }
                : {}),
              ...(action.type === 'navigate' && 'paragraph_id' in action.data
                ? { paragraph_id: action.data.paragraph_id }
                : {}),
            };

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
              const actionName = 'name' in action.data ? action.data.name : undefined;
              const messageAction: MessageAction = {
                type: action.type,
                entity: action.entity,
                ...(actionName ? { name: actionName } : {}),
                timestamp: Date.now(),
                // 添加其他操作相关信息（简化处理）
              };
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

// 停止当前任务
const stopCurrentTask = async () => {
  if (!currentTaskId.value) return;

  try {
    // 停止任务（这会触发 abortController.abort()）
    await aiProcessingStore.stopTask(currentTaskId.value);

    // 更新最后一条助手消息，显示已取消
    const lastAssistantMsg = messages.value
      .slice()
      .reverse()
      .find((msg) => msg.role === 'assistant');
    if (lastAssistantMsg) {
      if (!lastAssistantMsg.content.trim()) {
        lastAssistantMsg.content = '**已取消**\n\n用户已停止 AI 思考过程。';
      } else if (!lastAssistantMsg.content.includes('**已取消**')) {
        lastAssistantMsg.content += '\n\n**已取消**';
      }
      // 清除思考过程活动状态（任务已停止）
      setThinkingActive(lastAssistantMsg.id, false);
    }

    // 保存消息到会话
    const currentSession = chatSessionsStore.currentSession;
    if (currentSession?.id && messages.value.length > 0) {
      chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
    }

    toast.add({
      severity: 'info',
      summary: '已停止',
      detail: 'AI 思考过程已停止',
      life: 2000,
    });
  } catch (error) {
    console.error('Failed to stop task:', error);
    toast.add({
      severity: 'error',
      summary: '停止失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 3000,
    });
  } finally {
    // 重置状态，重新启用输入
    isSending.value = false;
    currentTaskId.value = null;
    currentMessageActions.value = [];
    scrollToBottom();
    focusInput();
  }
};

// 清空聊天
const clearChat = () => {
  messages.value = [];
  chatSessionsStore.clearCurrentSession();
};

// 创建新会话
const createNewSession = () => {
  const context = contextStore.getContext;
  chatSessionsStore.createSession({
    bookId: context.currentBookId,
    chapterId: context.currentChapterId,
    paragraphId: context.selectedParagraphId,
  });
  messages.value = [];
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
let isUpdatingFromStore = false; // 标记是否正在从 store 更新，避免循环
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
const getActionDetails = (action: MessageAction) => {
  const actionLabels: Record<MessageAction['type'], string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    web_search: '网络搜索',
    web_fetch: '网页获取',
    read: '读取',
    navigate: '导航',
  };
  const entityLabels: Record<MessageAction['entity'], string> = {
    term: '术语',
    character: '角色',
    web: '网络',
    translation: '翻译',
    chapter: '章节',
    paragraph: '段落',
    book: '书籍',
    memory: '记忆',
    todo: '待办事项',
  };

  const details: {
    label: string;
    value: string;
  }[] = [
    {
      label: '操作类型',
      value: actionLabels[action.type],
    },
    {
      label: '实体类型',
      value: entityLabels[action.entity],
    },
  ];

  if (action.name) {
    details.push({
      label: '名称',
      value: action.name,
    });
  }

  // 尝试从当前书籍获取详细信息
  const currentBookId = contextStore.getContext.currentBookId;
  if (currentBookId && action.name) {
    const book = booksStore.getBookById(currentBookId);
    if (book) {
      if (action.entity === 'term') {
        const term = book.terminologies?.find((t) => t.name === action.name);
        if (term) {
          if (term.translation?.translation) {
            details.push({
              label: '翻译',
              value: term.translation.translation,
            });
          }
          if (term.description) {
            details.push({
              label: '描述',
              value: term.description,
            });
          }
          if (term.occurrences && term.occurrences.length > 0) {
            const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push({
              label: '出现次数',
              value: `${totalOccurrences} 次`,
            });
          }
        }
      } else if (action.entity === 'character') {
        const character = book.characterSettings?.find((c) => c.name === action.name);
        if (character) {
          if (character.translation?.translation) {
            details.push({
              label: '翻译',
              value: character.translation.translation,
            });
          }
          if (character.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            details.push({
              label: '性别',
              value: sexLabels[character.sex] || character.sex,
            });
          }
          if (character.description) {
            details.push({
              label: '描述',
              value: character.description,
            });
          }
          if (character.speakingStyle) {
            details.push({
              label: '说话口吻',
              value: character.speakingStyle,
            });
          }
          if (character.aliases && character.aliases.length > 0) {
            details.push({
              label: '别名',
              value: character.aliases.map((a) => a.name).join('、'),
            });
          }
          if (character.occurrences && character.occurrences.length > 0) {
            const totalOccurrences = character.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push({
              label: '出现次数',
              value: `${totalOccurrences} 次`,
            });
          }
        }
      }
    }
  }

  // 处理网络搜索操作
  if (action.type === 'web_search' && action.entity === 'web') {
    if (action.query) {
      details.push({
        label: '搜索查询',
        value: action.query,
      });
    }
  }

  // 处理网页获取操作
  if (action.type === 'web_fetch' && action.entity === 'web') {
    if (action.url) {
      details.push({
        label: '网页 URL',
        value: action.url,
      });
    }
  }

  // 处理待办事项操作
  if (action.entity === 'todo') {
    if (action.name) {
      details.push({
        label: '内容',
        value: action.name,
      });
    }
  }

  // 处理翻译操作
  if (action.entity === 'translation') {
    if (action.paragraph_id) {
      details.push({
        label: '段落 ID',
        value: action.paragraph_id,
      });
    }
    if (action.translation_id) {
      details.push({
        label: '翻译 ID',
        value: action.translation_id,
      });
    }
  }

  // 处理 Memory 操作
  if (action.entity === 'memory') {
    if (action.memory_id) {
      details.push({
        label: 'Memory ID',
        value: action.memory_id,
      });
    }
    if (action.keyword) {
      details.push({
        label: '搜索关键词',
        value: action.keyword,
      });
    }
    if (action.name) {
      details.push({
        label: '摘要',
        value: action.name,
      });
    }
  }

  // 处理读取操作
  if (action.type === 'read') {
    if (action.tool_name) {
      details.push({
        label: '工具',
        value: action.tool_name,
      });
    }
    if (action.chapter_id) {
      details.push({
        label: '章节 ID',
        value: action.chapter_id,
      });
    }
    if (action.chapter_title) {
      details.push({
        label: '章节标题',
        value: action.chapter_title,
      });
    }
    if (action.paragraph_id) {
      details.push({
        label: '段落 ID',
        value: action.paragraph_id,
      });
    }
    if (action.character_name) {
      details.push({
        label: '角色名称',
        value: action.character_name,
      });
    }
    if (action.name) {
      details.push({
        label: '名称',
        value: action.name,
      });
    }
  }

  // 处理导航操作
  if (action.type === 'navigate') {
    if (action.book_id) {
      const book = booksStore.getBookById(action.book_id);
      if (book) {
        details.push({
          label: '书籍',
          value: book.title,
        });
      } else {
        details.push({
          label: '书籍 ID',
          value: action.book_id,
        });
      }
    }
    if (action.chapter_id) {
      details.push({
        label: '章节 ID',
        value: action.chapter_id,
      });
    }
    if (action.chapter_title) {
      details.push({
        label: '章节标题',
        value: action.chapter_title,
      });
    }
    if (action.paragraph_id) {
      details.push({
        label: '段落 ID',
        value: action.paragraph_id,
      });
    }
  }

  details.push({
    label: '操作时间',
    value: new Date(action.timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  });

  return details;
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

// 消息显示项类型
interface MessageDisplayItem {
  type: 'content' | 'action';
  content?: string;
  action?: MessageAction;
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

  // 将消息内容按操作时间戳分段
  // 第一个内容段：从消息开始到第一个操作之前
  // 每个操作之后：如果有新内容，显示新内容段
  // 由于我们不知道内容更新的精确时间戳，我们采用简化策略：
  // 1. 先显示初始内容（如果有）
  // 2. 然后按时间顺序显示操作
  // 3. 操作之后的内容会在流式更新时自动追加到消息内容中

  // 添加初始内容（如果有）
  if (message.content) {
    items.push({
      type: 'content',
      content: message.content,
      messageId: message.id,
      messageRole: message.role,
      timestamp: message.timestamp,
    });
  }

  // 添加所有操作（按时间戳排序，相同时间戳时按添加顺序）
  for (const { action } of sortedActions) {
    items.push({
      type: 'action',
      action,
      messageId: message.id,
      messageRole: message.role,
      timestamp: action.timestamp,
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
    // 由于操作是在流式输出过程中添加的，如果时间戳相同（可能是时间戳精度问题），
    // 操作应该被视为发生在消息开始输出之后，因此操作应该在内容之后
    if (a.type === 'content' && b.type === 'action') {
      // a 是内容，b 是操作
      // 如果时间戳相同，内容应该在操作之前（因为操作发生在流式输出过程中）
      return -1;
    }
    if (a.type === 'action' && b.type === 'content') {
      // a 是操作，b 是内容
      // 如果时间戳相同，操作应该在内容之后（因为操作发生在流式输出过程中）
      return 1;
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
      class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-500/30 transition-colors z-20"
      :class="{ 'bg-primary-500/50': isResizing }"
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
          aria-label="新聊天"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-comments"
          size="small"
          @click="createNewSession"
        />
      </div>
    </div>

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
                  class="rounded-lg px-3 py-2 max-w-[85%] min-w-0"
                  :class="
                    item.messageRole === 'user'
                      ? 'bg-primary-500/20 text-primary-100'
                      : 'bg-white/5 text-moon-90'
                  "
                >
                  <div
                    class="text-sm break-words overflow-wrap-anywhere markdown-content"
                    v-html="renderMarkdown(item.content)"
                  ></div>
                </div>
                <div v-else-if="item.type === 'action' && item.action" class="max-w-[85%] min-w-0">
                  <div class="space-y-1 flex flex-wrap gap-1">
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
                        <span v-if="item.action.name" class="font-semibold"
                          >"{{ item.action.name }}"</span
                        >
                        <span v-else-if="item.action.query" class="font-semibold"
                          >"{{ item.action.query }}"</span
                        >
                        <span v-else-if="item.action.url" class="font-semibold text-xs">{{
                          item.action.url
                        }}</span>
                        <span
                          v-else-if="
                            item.action.entity === 'translation' && item.action.paragraph_id
                          "
                          class="font-semibold text-xs"
                        >
                          段落翻译
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
                          v-else-if="item.action.entity === 'todo' && item.action.name"
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.name }}"
                        </span>
                        <span
                          v-else-if="item.action.type === 'navigate' && item.action.chapter_title"
                          class="font-semibold text-xs"
                        >
                          "{{ item.action.chapter_title }}"
                        </span>
                        <span
                          v-else-if="item.action.type === 'navigate' && item.action.paragraph_id"
                          class="font-semibold text-xs"
                        >
                          段落
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
                            v-for="(detail, detailIdx) in getActionDetails(item.action)"
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
              v-if="isSending && currentTaskId"
              label="停止"
              icon="pi pi-stop"
              size="small"
              severity="danger"
              @click="stopCurrentTask"
            />
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
}

:deep(.p-textarea:focus) {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.2rem rgba(var(--primary-rgb), 0.1);
}

:deep(.p-textarea::placeholder) {
  color: var(--moon-opacity-50);
}

/* 消息容器滚动条 */
.messages-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

/* Markdown 内容样式 */
.markdown-content {
  line-height: 1.6;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
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
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.75em;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.75em 0;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(li) {
  margin: 0.25em 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 1em;
  margin: 0.75em 0;
  opacity: 0.8;
}

.markdown-content :deep(a) {
  color: var(--primary-400);
  text-decoration: underline;
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
</style>
