<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { useUiStore } from 'src/stores/ui';
import { useContextStore } from 'src/stores/context';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
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

const ui = useUiStore();
const contextStore = useContextStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const aiProcessingStore = useAIProcessingStore();
const chatSessionsStore = useChatSessionsStore();
const toast = useToastWithHistory();

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

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
});

const messages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
const isSending = ref(false);
const currentTaskId = ref<string | null>(null);
const currentMessageActions = ref<MessageAction[]>([]); // 当前消息的操作列表

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
  if (context.hoveredParagraphId) {
    info.push('当前段落');
  }
  
  return info.length > 0 ? info.join(' | ') : '无上下文';
});

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
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
      // 不显示总结开始的 toast，静默进行

      // 构建要总结的消息（排除系统消息）
      const messagesToSummarize = messages.value.map((msg) => ({
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

      // 保存总结并重置消息
      chatSessionsStore.summarizeAndReset(summary);

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
    } catch (error) {
      console.error('Failed to summarize session:', error);
      summarySucceeded = false;
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
  const assistantMessageId = (Date.now() + 1).toString();
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };
  messages.value.push(assistantMessage);
  
  // 注意：不在这里重置操作列表，因为操作可能在消息发送过程中发生
  // 操作列表会在消息完成或失败时处理

  try {
      // 获取当前会话的总结（如果有）
      const currentSession = chatSessionsStore.currentSession;
      const sessionSummary = currentSession?.summary;

      // 调用 AssistantService
      const result = await AssistantService.chat(assistantModel.value, message, {
        ...(sessionSummary ? { sessionSummary } : {}),
      onChunk: (chunk) => {
        // 更新助手消息内容
        const msg = messages.value.find((m) => m.id === assistantMessageId);
        if (msg && chunk.text) {
          msg.content += chunk.text;
          scrollToBottom();
        }
      },
      onAction: (action: ActionInfo) => {
        // 记录操作到当前消息
        const actionName = 'name' in action.data ? action.data.name : undefined;
        const messageAction: MessageAction = {
          type: action.type,
          entity: action.entity,
          ...(actionName ? { name: actionName } : {}),
          timestamp: Date.now(),
        };
        currentMessageActions.value.push(messageAction);

        // 显示操作通知
        const actionLabels: Record<ActionInfo['type'], string> = {
          create: '创建',
          update: '更新',
          delete: '删除',
        };
        const entityLabels: Record<ActionInfo['entity'], string> = {
          term: '术语',
          character: '角色',
        };
        toast.add({
          severity: 'success',
          summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
          detail: action.type === 'create' && 'name' in action.data 
            ? `${entityLabels[action.entity]} "${action.data.name}" 已${actionLabels[action.type]}`
            : `${entityLabels[action.entity]}已${actionLabels[action.type]}`,
          life: 2000,
        });
      },
      aiProcessingStore: {
        addTask: async (task) => {
          const id = await aiProcessingStore.addTask(task);
          currentTaskId.value = id;
          return id;
        },
        updateTask: async (id, updates) => {
          await aiProcessingStore.updateTask(id, updates);
        },
        appendThinkingMessage: async (id, text) => {
          await aiProcessingStore.appendThinkingMessage(id, text);
        },
        removeTask: async (id) => {
          await aiProcessingStore.removeTask(id);
        },
      },
    });

    // 更新最终消息内容
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      if (result.text) {
        msg.content = result.text;
      }
      // 添加操作信息到消息
      if (currentMessageActions.value.length > 0) {
        msg.actions = [...currentMessageActions.value];
      }
    }
    
    // 清空操作列表（消息完成后）
    currentMessageActions.value = [];
  } catch (error) {
    // 更新错误消息
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      msg.content = `错误：${error instanceof Error ? error.message : '未知错误'}`;
      // 即使出错，也保存已记录的操作（如果有的话）
      if (currentMessageActions.value.length > 0) {
        msg.actions = [...currentMessageActions.value];
      }
    }
    toast.add({
      severity: 'error',
      summary: '助手回复失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 5000,
    });
  } finally {
    isSending.value = false;
    currentTaskId.value = null;
    // 清空操作列表（无论成功还是失败）
    currentMessageActions.value = [];
    scrollToBottom();
    // 聚焦输入框
    nextTick(() => {
      if (inputRef.value) {
        // PrimeVue Textarea 组件可能通过 $el 暴露原生元素，或直接有 focus 方法
        const component = inputRef.value as unknown as { $el?: HTMLElement; focus?: () => void };
        if (component.focus) {
          component.focus();
        } else if (component.$el) {
          const textarea = component.$el.querySelector('textarea') as HTMLTextAreaElement | null;
          textarea?.focus();
        }
      }
    });
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
const createNewSession = () => {
  const context = contextStore.getContext;
  chatSessionsStore.createSession({
    bookId: context.currentBookId,
    chapterId: context.currentChapterId,
    paragraphId: context.hoveredParagraphId,
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
    loadCurrentSession();
  }
});

// 监听当前会话变化
watch(
  () => chatSessionsStore.currentSessionId,
  () => {
    loadCurrentSession();
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
      paragraphId: context.hoveredParagraphId,
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
    <div class="shrink-0 px-4 pt-6 pb-4 relative z-10 flex items-center justify-between border-b border-white/10">
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
    <div v-if="contextInfo !== '无上下文'" class="shrink-0 px-4 py-2 relative z-10 border-b border-white/10">
      <p class="text-xs text-moon-50">{{ contextInfo }}</p>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-2 min-h-0 min-w-0 relative z-10 messages-container"
    >
      <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-center">
        <i class="pi pi-comments text-4xl text-moon-40 mb-4" />
        <p class="text-sm text-moon-60 mb-2">开始与 AI 助手对话</p>
        <p class="text-xs text-moon-40">助手可以帮你管理术语、角色设定，并提供翻译建议</p>
      </div>
      <div v-else class="flex flex-col gap-4 w-full">
        <div
          v-for="message in messages"
          :key="message.id"
          class="flex flex-col gap-2 w-full"
          :class="message.role === 'user' ? 'items-end' : 'items-start'"
        >
          <div
            class="rounded-lg px-3 py-2 max-w-[85%] min-w-0"
            :class="
              message.role === 'user'
                ? 'bg-primary-500/20 text-primary-100'
                : 'bg-white/5 text-moon-90'
            "
          >
            <!-- 操作结果高亮显示 -->
            <div v-if="message.actions && message.actions.length > 0" class="mb-2 space-y-1 flex flex-wrap gap-1">
              <div
                v-for="(action, idx) in message.actions"
                :key="idx"
                class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300"
                :class="{
                  'bg-green-500/25 text-green-200 border border-green-500/40 shadow-lg shadow-green-500/20': action.type === 'create',
                  'bg-blue-500/25 text-blue-200 border border-blue-500/40 shadow-lg shadow-blue-500/20': action.type === 'update',
                  'bg-red-500/25 text-red-200 border border-red-500/40 shadow-lg shadow-red-500/20': action.type === 'delete',
                }"
              >
                <i
                  class="text-sm"
                  :class="{
                    'pi pi-plus-circle': action.type === 'create',
                    'pi pi-pencil': action.type === 'update',
                    'pi pi-trash': action.type === 'delete',
                  }"
                />
                <span>
                  {{ action.type === 'create' ? '创建' : action.type === 'update' ? '更新' : '删除' }}
                  {{ action.entity === 'term' ? '术语' : '角色' }}
                  <span v-if="action.name" class="font-semibold">"{{ action.name }}"</span>
                </span>
              </div>
            </div>
            <p class="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere">{{ message.content || '思考中...' }}</p>
          </div>
          <span class="text-xs text-moon-40">
            {{ new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
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
          <span v-else class="text-xs text-moon-50">{{ assistantModel.name || assistantModel.id }}</span>
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
</style>

